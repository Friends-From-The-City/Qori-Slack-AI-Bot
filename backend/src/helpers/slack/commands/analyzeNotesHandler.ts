/**
 * analyzeNotesHandler.ts — /qori-analyze command and modal handlers
 *
 * Opens a progressive-disclosure modal (study → session → notes),
 * then processes selected session transcripts + observer notes through
 * the session_summary YAML template.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { ResearchQuestion, TargetBarrier } from '../../../types/cascade';

import { analyzeNotesModal } from "../ui/analyzeNotesModal";
import { getStudiesByUser, resolveStudyFromName } from "../../../services/research_study.service";
import { getActiveStudy, setActiveStudy } from "../../../services/slack-user-state.service";
import { studyNotesService } from "../../../services";
import sessionSummaryService from "../../../services/session-summary.service";
import studyParticipantService from "../../../services/study_participant.service";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepoByPath, fetchFileFromRepo } from "../../../helpers/github";
import { processYamlTemplate } from "../../../helpers/yamlProcessor";
import { readStudyVariablesByContext, type VariableContext } from '../../studyVariables';

// ─── Cascade context ─────────────────────────────────────────────

interface CascadeContext {
  barrierCount: number;
  questionCount: number;
  methodology?: string;
}

/**
 * Read cascade context from study variables (brief-emitted vars).
 * Non-blocking: returns null if variables are unavailable.
 */
const getCascadeContext = async (variableContext: VariableContext): Promise<CascadeContext | null> => {
  try {
    const studyVars = await readStudyVariablesByContext(variableContext);
    if (!studyVars || !studyVars.variables) return null;

    const vars = studyVars.variables;
    const barriers = vars.target_barriers?.value as TargetBarrier[] | string | undefined;
    const questions = vars.research_questions?.value as ResearchQuestion[] | string | undefined;
    const methodology = vars.methodology_selection?.value as string | undefined;

    const barrierCount = Array.isArray(barriers) ? barriers.length
      : (typeof barriers === 'string' && barriers.trim()) ? barriers.split(/\n|;/).filter(Boolean).length : 0;
    const questionCount = Array.isArray(questions) ? questions.length
      : (typeof questions === 'string' && questions.trim()) ? questions.split(/\n|;/).filter(Boolean).length : 0;

    if (barrierCount === 0 && questionCount === 0 && !methodology) return null;

    return { barrierCount, questionCount, methodology: methodology || undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Could not read cascade context for study:", message);
    return null;
  }
};

// ─── Template input contract ────────────────────────────────────

/** Data shape passed to the session_summary YAML template. */
interface SessionSummaryTemplateInput {
  study_folder: string;
  study_name: string;
  session_name: string;
  session_date: string;
  selected_note_files: string[];
  coded_transcript_content: string;
  notes_content: string;
  note_takers: string;
  participant_id: string;
  researcher_contact: string;
  analyzer: string;
}

// ─── Note detail types ──────────────────────────────────────────

interface NoteDetail {
  id: number;
  filename: string;
  transcript: boolean;
  participant_name: string | null;
  session_date: string | null;
  created_by: string;
  file_path: string | null;
  file_url: string | null;
  githubContent?: string;
  dataValues?: Record<string, unknown>;
  get?: (key: string) => unknown;
}

interface NoteFile {
  id: string;
  filename: string;
  transcript: boolean;
  author: string;
  participant_name: string | null;
  session_date: string | null;
  session_time: string | null;
  study_name: string;
  file_url: string | null;
}

// ─── Session mapping (participants → modal sessions) ────────────

/** Map participants to the Session shape expected by analyzeNotesModal. */
interface MappedSession {
  id: number | string;
  participant?: {
    participant_name?: string;
    scheduled_date?: string;
    scheduled_time?: string;
  };
}

interface ParticipantRecord {
  id: number;
  participant_name?: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
}

const mapParticipantsToSessions = (participants: ParticipantRecord[]): MappedSession[] => {
  return participants.map(p => ({
    id: p.id,
    participant: {
      participant_name: p.participant_name,
      scheduled_date: p.scheduled_date || undefined,
      scheduled_time: p.scheduled_time || undefined,
    }
  }));
};

// ─── Command handler ────────────────────────────────────────────

const analyzeNotesHandler = async ({ ack, body, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();

    const studies = await getStudiesByUser(body.user_id);
    const activeStudyId: number | null = await getActiveStudy(body.user_id);

    // Pre-load sessions if there's an active study (avoids "no sessions" on pre-selected study)
    let sessions: unknown[] = [];
    let cascadeContext: CascadeContext | null = null;
    if (activeStudyId) {
      try {
        // Find the study name for cascade context lookup
        const activeStudy = studies.find((s: { id: number }) => s.id === activeStudyId);
        const studyName = activeStudy?.name;

        const [participantsResult, cascadeResult] = await Promise.all([
          studyParticipantService.getParticipantsByStudy(activeStudyId).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("Warning: Could not pre-load participants:", message);
            return [];
          }),
          studyName ? resolveStudyFromName(studyName).then(resolved =>
            resolved ? getCascadeContext({ projectId: resolved.projectId, studyId: resolved.studyId }) : null
          ).catch(() => null) : Promise.resolve(null),
        ]);
        sessions = mapParticipantsToSessions(participantsResult as ParticipantRecord[]);
        cascadeContext = cascadeResult;
        console.log(`✅ Pre-loaded ${sessions.length} sessions for active study ID ${activeStudyId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("Warning: Could not pre-load sessions for active study:", message);
      }
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      view: analyzeNotesModal(studies, [], sessions, {
        showStudy: true,
        showSession: activeStudyId ? true : false,
        showNotes: false,
        selectedStudy: activeStudyId,
        cascadeContext,
      })
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error opening analyze notes modal:", error);

    await client.chat.postEphemeral({
      channel: body.user_id,
      user: body.user_id,
      text: `❌ Failed to open analyze notes modal: ${message}`,
    });
  }
};

// ─── View submission handler ────────────────────────────────────

const handleAnalyzeNotesSubmission = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  const values = view.state.values;

  const studyId = values.study_select_block?.study_select_test?.selected_option?.value as string | undefined;
  const sessionId = values.session_select_block?.analyze_notes_session_select?.selected_option?.value as string | undefined;
  const selectedTranscriptId = values.transcript_select_block?.transcript_select?.selected_option?.value as string | undefined;
  const selectedNotes = values.notes_select_block?.notes_select?.selected_options || [];

  // Transcript is required
  const transcriptBlock = values.transcript_select_block;
  if (!transcriptBlock || !selectedTranscriptId) {
    await (ack as Function)({
      response_action: "errors",
      errors: {
        transcript_select_block: "Please select a session transcript to analyze."
      }
    });
    return;
  }

  try {
    await ack();

    // Immediate progress message — LLM analysis takes 1-2 minutes.
    // Without this, researchers assume failure and re-run. See ADR 0019.
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: '🔄 *Analyzing session* — this takes a minute or two. You\'ll see a confirmation when it\'s done.',
    });

    if (!studyId || studyId === "no_studies") {
      throw new Error("No research study selected");
    }

    // Update active study for cross-command pre-fill
    await setActiveStudy(body.user.id, parseInt(studyId, 10));

    if (sessionId && sessionId !== "no_sessions") {
      console.log("Selected session ID:", sessionId);
    }

    const studyName: string = values.study_select_block?.study_select_test?.selected_option?.text?.text || "Unknown Study";
    const sessionName: string | null = values.session_select_block?.analyze_notes_session_select?.selected_option?.text?.text || null;

    // Fetch the transcript (required)
    const noteDetails: NoteDetail[] = [];
    try {
      const transcript = await studyNotesService.getStudyNoteById(parseInt(selectedTranscriptId));
      if (transcript) {
        noteDetails.push(transcript);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Warning: Could not fetch transcript:", message);
    }

    // Fetch optional observer notes
    const noteIds: string[] = selectedNotes.map((note: any) => note.value);
    try {
      for (const noteId of noteIds) {
        const note = await studyNotesService.getStudyNoteById(parseInt(noteId));
        if (note) {
          noteDetails.push(note);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Warning: Could not fetch some observer notes:", message);
    }

    const resolved = await resolveStudyFromName(studyName);
    if (!resolved) {
      throw new Error(`Study "${studyName}" not found`);
    }
    const { study, projectId, studyId: resolvedStudyId } = resolved;
    const variableContext: VariableContext = { projectId, studyId: resolvedStudyId };

    // Fetch GitHub content for each note file in parallel
    const noteContentPromises = noteDetails.map(async (note: NoteDetail) => {
      try {
        const filePath = note.file_path;

        if (filePath) {
          // @ts-expect-error — pre-existing type mismatch from require() → import migration
          const githubFile = await fetchFileFromRepoByPath(process.env.GITHUB_REPO, filePath);
          return {
            ...note,
            githubContent: githubFile.content || '[Content not available]'
          };
        } else {
          return {
            ...note,
            githubContent: '[File path not available]'
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not fetch GitHub content for note ${note.filename}:`, message);
        return {
          ...note,
          githubContent: '[Error fetching content]'
        };
      }
    });

    const notesWithContent = await Promise.all(noteContentPromises);

    const noteTakers: string[] = notesWithContent.map((note: NoteDetail) => note.created_by).filter(Boolean);

    const participantIds: string[] = notesWithContent.map((note: NoteDetail) => {
      const participantName = note.participant_name || note.dataValues?.participant_name || (note.get ? note.get('participant_name') : undefined);
      return (participantName as string) || 'unknown';
    });

    const uniqueParticipantIds = [...new Set(participantIds)];

    const formatNoteContent = (note: NoteDetail): string => {
      const filename = note.filename || 'Unknown File';
      return `# ${filename}\n\n` +
        `**Participant:** ${note.participant_name || 'Unknown Participant'}\n` +
        `**Date:** ${note.session_date || 'Unknown Date'}\n` +
        `**Note Taker:** ${note.created_by || 'Unknown User'}\n\n` +
        `${note.githubContent || '[No content available]'}`;
    };

    const transcriptNotes = notesWithContent.filter((note: NoteDetail) => note.transcript === true);
    const regularNotes = notesWithContent.filter((note: NoteDetail) => note.transcript !== true);

    const coded_transcript_content: string = transcriptNotes.length > 0
      ? transcriptNotes.map(formatNoteContent).join('\n\n---\n\n')
      : '';

    const notes_content: string = regularNotes.length > 0
      ? regularNotes.map(formatNoteContent).join('\n\n---\n\n')
      : '';

    const templateData: SessionSummaryTemplateInput = {
      study_folder: studyName,
      study_name: studyName,
      session_name: sessionName || 'No specific session selected',
      session_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      selected_note_files: notesWithContent.map((note: NoteDetail) => note.filename || 'Unknown File'),
      coded_transcript_content: coded_transcript_content,
      notes_content: notes_content,
      note_takers: noteTakers.join(', '),
      participant_id: uniqueParticipantIds[0] || 'Unknown Participant ID',
      researcher_contact: study?.researcher_name || study?.researcher_email || '',
      analyzer: (body.user as Record<string, string>).username || body.user.name || body.user.id
    };
    console.log("🚀 ~ handleAnalyzeNotesSubmission ~ templateData:", templateData);

    const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "session_summary.yaml");

    const studyPath = study?.path;
    if (!studyPath) throw new Error('Unexpected: study.path missing after resolution');

    const renderedYaml = await processYamlTemplate(
      yamlTemplateFile.content,
      templateData,
      studyPath,
      '',
      false,
      variableContext
    );

    // CRITICAL: Await extraction to ensure cascade variables are committed before returning success.
    // Without this, downstream modals (synthesis) may read stale data. See ADR 0019.
    if (renderedYaml.extractionPromise) {
      const extractResult = await renderedYaml.extractionPromise;
      if (!extractResult.success) {
        throw new Error(`Cascade variable extraction failed: ${extractResult.error}. Document was saved but variables were not written.`);
      }
      console.log(`✅ Cascade variables committed: ${extractResult.variableCount} items (${extractResult.keys?.join(', ')})`);
    }

    const { result } = renderedYaml;
    const urlParts: string[] = result.path.split('/');
    const fileName: string = urlParts[urlParts.length - 1];

    // Save the session summary to the database
    if (renderedYaml && renderedYaml.result) {
      try {
        const summaryData = {
          study_id: parseInt(studyId),
          study_name: studyName,
          filename: fileName || 'session_summary.md',
          file_path: result.path || null,
          file_url: result.url || null,
          created_by: body.user.id
        };

        const savedSummary = await sessionSummaryService.createOrUpdateSessionSummary(summaryData);
        console.log('✅ Session summary saved to database:', savedSummary.id);
      } catch (error) {
        console.error('⚠️ Warning: Could not save session summary to database:', error);
      }
    }

    const noteSummary: string = noteDetails.map((note: NoteDetail) =>
      `• ${note.filename || 'Unknown File'} - Note taker: <@${note.created_by}>`
    ).join('\n');

    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `✅ *Note Analysis Completed!*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Note Analysis Completed!*\n\n*Study:* ${studyName}\n${sessionName ? `*Session:* ${sessionName}\n` : ''}*Notes Processed:* ${noteDetails.length} files\n\n*Selected Notes:*\n${noteSummary}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${result.url}|:github: View Session Summary on GitHub>`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Next:* Run \`/qori-synthesis\` to identify themes across sessions.`,
          },
        },
      ],
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling analyze notes submission:", error);

    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error processing note analysis: ${message}`,
    });
  }
};

// ─── Study selection change handler ─────────────────────────────

const handleStudySelectionChange = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();
    console.log("🎯 Study selection change handler triggered!");

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_test?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      console.log("🚀 ~ No study selected, resetting to initial state");
      const studies = await getStudiesByUser(body.user.id);
      await client.views.update({
        view_id: view.id,
        view: analyzeNotesModal(studies, [], [], {
          showStudy: true,
          showSession: false,
          showNotes: false,
        })
      });
      return;
    }

    const studyId = parseInt(selectedStudyOption.value);
    const studyName: string = selectedStudyOption.text.text;

    let sessions: MappedSession[] = [];
    let cascadeContext: CascadeContext | null = null;
    try {
      const resolved = await resolveStudyFromName(studyName);
      const [participantsResult, cascadeResult] = await Promise.all([
        studyParticipantService.getParticipantsByStudy(studyId).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn("Warning: Could not fetch participants:", message);
          return [];
        }),
        resolved ? getCascadeContext({ projectId: resolved.projectId, studyId: resolved.studyId }) : Promise.resolve(null),
      ]);
      sessions = mapParticipantsToSessions(participantsResult as ParticipantRecord[]);
      cascadeContext = cascadeResult;
      console.log(`✅ Loaded ${sessions.length} participants for study "${studyName}"${cascadeContext ? ` (cascade: ${cascadeContext.barrierCount} barriers, ${cascadeContext.questionCount} questions)` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Warning: Could not fetch participants:", message);
    }

    const studies = await getStudiesByUser(body.user.id);

    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      view: analyzeNotesModal(studies, [], sessions, {
        showStudy: true,
        showSession: true,
        showNotes: false,
        selectedStudy: studyId,
        cascadeContext,
      })
    });

  } catch (error) {
    console.error("Error handling study selection change:", error);
  }
};

// ─── Session selection change handler ───────────────────────────

const handleSessionSelectionChange = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    await ack();
    console.log("🎯 Session selection change handler triggered!");

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_test?.selected_option;
    const selectedSessionOption = view.state.values.session_select_block?.analyze_notes_session_select?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      console.log("🚀 ~ No study selected");
      return;
    }

    const studyId = parseInt(selectedStudyOption.value);
    const studyName: string = selectedStudyOption.text.text;

    const resolved = await resolveStudyFromName(studyName);
    const [studies, participantsResult, cascadeContext] = await Promise.all([
      getStudiesByUser(body.user.id),
      studyParticipantService.getParticipantsByStudy(studyId).catch((err: Error) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("Warning: Could not fetch participants:", message);
        return [];
      }),
      resolved ? getCascadeContext({ projectId: resolved.projectId, studyId: resolved.studyId }) : Promise.resolve(null),
    ]);
    const sessions = mapParticipantsToSessions(participantsResult as ParticipantRecord[]);

    if (!selectedSessionOption || selectedSessionOption.value === "no_sessions") {
      console.log("🚀 ~ No session selected, showing sessions only");
      await client.views.update({
        view_id: view.id,
        hash: view.hash,
        view: analyzeNotesModal(studies, [], sessions, {
          showStudy: true,
          showSession: true,
          showNotes: false,
          selectedStudy: studyId,
          cascadeContext,
        })
      });
      return;
    }

    const sessionId = parseInt(selectedSessionOption.value);
    const sessionName: string = selectedSessionOption.text.text;

    // Get the participant to extract participant_name
    let participantName: string | null = null;
    try {
      const allParticipants = await studyParticipantService.getParticipantsByStudy(studyId);
      const participant = allParticipants.find((p) => p.id.toString() === selectedSessionOption.value);
      participantName = participant?.participant_name || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Warning: Could not fetch participant details:", message);
    }

    // Fetch notes for the specific participant, scoped to this study.
    // Bug fix: without studyId, participant "Alice" in Study A would see notes from Study B.
    let studyNotes: NoteDetail[] = [];
    try {
      if (participantName) {
        studyNotes = await studyNotesService.getStudyNotesByParticipantName(participantName, studyId);
        console.log(`✅ Loaded ${studyNotes.length} notes for participant "${participantName}" in study ${studyId} (session: "${sessionName}")`);
      } else {
        // No participant_name means notes can't be scoped — show empty list
        console.warn(`No participant_name found for session "${sessionName}" — notes dropdown will be empty`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Warning: Could not fetch study notes:", message);
    }

    // Transform notes to the format expected by the modal
    const noteFiles: NoteFile[] = studyNotes.map((note: NoteDetail) => ({
      id: note.id.toString(),
      filename: note.filename,
      transcript: note.transcript || false,
      author: note.created_by,
      participant_name: note.participant_name,
      session_date: note.session_date,
      session_time: null,
      study_name: studyName,
      file_url: note.file_url
    }));

    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      view: analyzeNotesModal(studies, noteFiles, sessions, {
        showStudy: true,
        showSession: true,
        showNotes: true,
        selectedStudy: studyId,
        selectedSession: sessionId,
        cascadeContext,
      })
    });

  } catch (error) {
    console.error("Error handling session selection change:", error);
  }
};

export {
  analyzeNotesHandler,
  handleAnalyzeNotesSubmission,
  handleStudySelectionChange,
  handleSessionSelectionChange,
};

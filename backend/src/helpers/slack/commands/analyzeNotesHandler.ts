/**
 * analyzeNotesHandler.ts — /qori-analyze command and modal handlers
 *
 * Opens a progressive-disclosure modal (study → session → notes),
 * then processes selected session transcripts + observer notes through
 * the session_summary YAML template.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { ResearchQuestion, TargetBarrier } from '../../../types/cascade';

import { analyzeNotesModal, type AnalyzeNotesModalMetadata } from "../ui/analyzeNotesModal";
import { getStudiesByUser, resolveStudyFromName } from "../../../services/research_study.service";
import { getActiveStudy, setActiveStudy } from "../../../services/slack-user-state.service";
import { studyNotesService } from "../../../services";
import studyParticipantService from "../../../services/study_participant.service";
import { readStudyVariablesByContext, type VariableContext } from '../../studyVariables';
import { assertStudyAccess, AuthorizationError } from '../../../services/authorization.service';
import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { analyzeSession as analyzeSessionAppService, type AnalyzeSessionInput } from '../../../application/transcript.app-service';

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

// ─── Note detail types ──────────────────────────────────────────

interface NoteDetail {
  id: number;
  filename: string;
  transcript: boolean;
  pii_reviewed?: boolean;  // PII review gate: transcripts must be reviewed before analysis
  participant_id: number | null;  // H6: FK to study_participants
  session_date: Date | null;  // R2: DATEONLY returns Date
  created_by: string;
  file_path: string | null;
  file_url: string | null;
  githubContent?: string;
  dataValues?: Record<string, unknown>;
  get?: (key: string) => unknown;
  participant?: { id: number; participant_code: string; participant_name: string | null };  // H6: association
}

interface NoteFile {
  id: string;
  filename: string;
  transcript: boolean;
  author: string;
  participant_name: string | null;
  session_date: Date | null;  // R2: DATEONLY returns Date
  session_time: string | null;  // TIME returns string (HH:MM:SS)
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

// ─── Dynamic block_id helpers ────────────────────────────────────
// Session block_id is dynamic (includes study ID) to reset Slack's view state on study change.
// These helpers find the session selection regardless of which study's block_id is in use.

type ViewStateValues = Record<string, Record<string, { selected_option?: { value?: string; text?: { text?: string } } }>>;

const findSessionSelection = (values: ViewStateValues): { value?: string; text?: string } | null => {
  // Search all blocks for the session action_id
  for (const blockId of Object.keys(values)) {
    if (blockId.startsWith('session_select_block')) {
      const action = values[blockId]?.analyze_notes_session_select;
      if (action?.selected_option) {
        return {
          value: action.selected_option.value,
          text: action.selected_option.text?.text,
        };
      }
    }
  }
  return null;
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

  // Parse metadata for auto-selected transcript (when exactly 1 transcript exists)
  let metadata: AnalyzeNotesModalMetadata = { source: 'slack' };
  try {
    metadata = JSON.parse(view.private_metadata || '{}');
  } catch {
    // Default to empty metadata if parsing fails
  }

  const studyId = values.study_select_block?.study_select_test?.selected_option?.value as string | undefined;
  const sessionSelection = findSessionSelection(values as ViewStateValues);
  const sessionId = sessionSelection?.value;
  const selectedNotes = values.notes_select_block?.notes_select?.selected_options || [];

  // Transcript: check form value first (>1 transcripts), fall back to auto-selected (1 transcript)
  const selectedTranscriptId =
    values.transcript_select_block?.transcript_select?.selected_option?.value ||
    metadata.autoSelectedTranscriptId;

  // Transcript is required
  if (!selectedTranscriptId) {
    // This only happens if 0 transcripts (submit should be disabled, but defensive)
    await (ack as Function)({
      response_action: "errors",
      errors: {
        transcript_selection_header: "No transcript available. Upload one via /qori-notes first."
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
      text: '*Analyzing session* — this takes a minute or two. You\'ll see a confirmation when it\'s done.',
    });

    if (!studyId || studyId === "no_studies") {
      throw new Error("No research study selected");
    }

    // Authorization check: verify user has access to this study (ADR 0024)
    await assertStudyAccess(body.user.id, parseInt(studyId, 10), client);

    // Update active study for cross-command pre-fill
    await setActiveStudy(body.user.id, parseInt(studyId, 10));

    // sessionId from dropdown IS the participant database ID (see mapParticipantsToSessions)
    // Fetch participant to get system-assigned participant_code for cascade isolation
    // AND participant_name for pre-transmission PII redaction (H9)
    let participantCode = 'PT-UNKNOWN';
    let participantName: string | null = null;
    if (sessionId && sessionId !== "no_sessions") {
      console.log("Selected session ID (participant DB ID):", sessionId);
      const participantDbId = parseInt(sessionId, 10);
      if (!isNaN(participantDbId)) {
        const participant = await studyParticipantService.getParticipantById(participantDbId);
        if (participant?.participant_code) {
          participantCode = participant.participant_code;
          console.log("Resolved participant_code:", participantCode);
        }
        if (participant?.participant_name) {
          participantName = participant.participant_name;
          // H9: Do NOT log participant_name — it's PII. Log only that we have it.
          console.log("Resolved participant_name for PII redaction: [REDACTED]");
        }
      }
    }

    const studyName: string = values.study_select_block?.study_select_test?.selected_option?.text?.text || "Unknown Study";
    const sessionName: string | null = sessionSelection?.text || null;

    // Extract observer note IDs (needed by both app-service and legacy paths)
    const observerNoteIds: number[] = selectedNotes.map((note: any) => parseInt(note.value));

    // ── PLAT-3: App service is the ONLY business path ──
    const analyzeCtx = await buildSlackApplicationContext(body.user.id, body.team?.id || '');

    if (!analyzeCtx) {
      // FAIL CLOSED — no identity resolution means no business logic
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: '❌ Unable to resolve identity. Please contact your workspace administrator.',
      });
      return;
    }

    // ── APP SERVICE PATH: delegate analysis orchestration ──
    const resolved = await resolveStudyFromName(studyName);
    if (!resolved) throw new Error(`Study "${studyName}" not found`);
    const { study, projectId, studyId: resolvedStudyId } = resolved;
    const studyPath = study?.path;
    if (!studyPath) throw new Error('Unexpected: study.path missing after resolution');

    const analyzeInput: AnalyzeSessionInput = {
      studyId: resolvedStudyId,
      projectId,
      studyName,
      studyPath,
      participantCode,
      participantName,
      sessionName,
      transcriptNoteId: parseInt(selectedTranscriptId),
      observerNoteIds,
      analyzerActorId: String(analyzeCtx.actor.id),
    };

    const analyzeResult = await analyzeSessionAppService(analyzeCtx, analyzeInput);

    // Post success message (Slack-specific)
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `✅ *Note Analysis Completed!*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Note Analysis Completed!*\n\n*Study:* ${studyName}\n${sessionName ? `*Session:* ${sessionName}\n` : ''}*Notes Processed:* ${analyzeResult.noteCount} files`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${analyzeResult.url}|View Session Summary on GitHub>`,
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
    const sessionSelection = findSessionSelection(view.state.values as ViewStateValues);

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
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

    if (!sessionSelection || sessionSelection.value === "no_sessions") {
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

    const participantId = parseInt(sessionSelection.value!);
    const sessionName: string = sessionSelection.text || 'Unknown Session';

    // H6: Fetch notes by participant_id FK (replaces text-match on participant_name).
    // Bug fix preserved: scoped by studyId to prevent cross-study data leakage.
    let studyNotes: NoteDetail[] = [];
    try {
      if (participantId) {
        studyNotes = await studyNotesService.getStudyNotesByParticipant(participantId, studyId);
        console.log(`✅ Loaded ${studyNotes.length} notes for participant ${participantId} in study ${studyId}`);
      } else {
        console.warn(`No participant ID found for session "${sessionName}" — notes dropdown will be empty`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Warning: Could not fetch study notes:", message);
    }

    // Transform notes to the format expected by the modal
    // H6: participant_name now comes from the included participant association
    const noteFiles: NoteFile[] = studyNotes.map((note: NoteDetail) => ({
      id: note.id.toString(),
      filename: note.filename,
      transcript: note.transcript || false,
      author: note.created_by,
      participant_name: (note as any).participant?.participant_name || null,
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
        selectedSession: participantId,
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

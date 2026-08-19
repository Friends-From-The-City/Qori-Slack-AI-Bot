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
import sessionSummaryService from "../../../services/session-summary.service";
import studyParticipantService from "../../../services/study_participant.service";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepoByPath, fetchFileFromRepo } from "../../../helpers/github";
import { processYamlTemplate } from "../../../helpers/yamlProcessor";
import type { PiiRedactionContext } from "../../../helpers/langchain";
import { readStudyVariablesByContext, type VariableContext } from '../../studyVariables';
import { assertStudyAccess, AuthorizationError } from '../../../services/authorization.service';
import { redactTranscript } from '../../../helpers/piiRedaction';
import { resolveSessionSource, createNuggetConstructs, type NuggetInput } from '../../../services/session-evidence.service';
import { attachEvidenceRefsVerified } from '../../../services/artifact.service';
import { getDefaultModelName } from '../../modelProvider';
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

    // ── PLAT-3: Dual-path — app service or legacy ──
    const analyzeCtx = await buildSlackApplicationContext(body.user.id, body.team?.id || '');

    if (analyzeCtx) {
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
      return;
    }

    // ── LEGACY PATH: no PLAT-2 workspace binding ──

    // Fetch the transcript (required)
    const noteDetails: NoteDetail[] = [];
    try {
      const transcript = await studyNotesService.getStudyNoteById(parseInt(selectedTranscriptId));
      if (transcript) {
        // ── PII REVIEW GATE ──
        // Transcripts must be PII-reviewed before analysis to prevent PII from
        // propagating into cascade variables (nuggets, themes, findings).
        // Manual notes (transcript=false) are exempt (structured observations, not raw transcript).
        if (transcript.transcript && !transcript.pii_reviewed) {
          await client.chat.postEphemeral({
            channel: body.user.id,
            user: body.user.id,
            text: `❌ *PII Review Required*\n\nThis transcript has not been PII-reviewed. ` +
              `To protect participant privacy, transcripts must go through the scrubbing and ` +
              `review process before analysis.\n\n` +
              `*To fix:* Re-upload the transcript using \`/qori-notes\` with the "Upload Transcript" tab. ` +
              `Enter the participant's real name for scrubbing, then review and approve before saving.`,
          });
          return;
        }
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

    // NOTE: participant_id is now resolved from sessionId (participant DB ID) → participant_code
    // NOT extracted from note.participant_name (which is freeform and non-unique)
    // See ADR 0020: System-Assigned Per-Study Participant Codes

    // H9: Pre-transmission PII redaction — replace participant name with code in content
    // This happens BEFORE content goes to the LLM template
    const formatNoteContent = (note: NoteDetail): string => {
      const filename = note.filename || 'Unknown File';
      // Redact participant name from GitHub content before embedding
      const rawContent = note.githubContent || '[No content available]';
      const redactedContent = redactTranscript(rawContent, participantName, participantCode);
      // Use participant CODE in header, not participant NAME (H9)
      return `# ${filename}\n\n` +
        `**Participant:** ${participantCode}\n` +
        `**Date:** ${note.session_date || 'Unknown Date'}\n` +
        `**Note Taker:** ${note.created_by || 'Unknown User'}\n\n` +
        `${redactedContent}`;
    };

    const transcriptNotes = notesWithContent.filter((note: NoteDetail) => note.transcript === true);
    const regularNotes = notesWithContent.filter((note: NoteDetail) => note.transcript !== true);

    const coded_transcript_content: string = transcriptNotes.length > 0
      ? transcriptNotes.map(formatNoteContent).join('\n\n---\n\n')
      : '';

    const notes_content: string = regularNotes.length > 0
      ? regularNotes.map(formatNoteContent).join('\n\n---\n\n')
      : '';

    // Log redaction stats for debugging (H9: do NOT log the actual name)
    if (participantName) {
      console.log(`[PII] Pre-transmission redaction applied: [REDACTED] → "${participantCode}"`);
    }

    const templateData: SessionSummaryTemplateInput = {
      study_folder: studyName,
      study_name: studyName,
      session_name: sessionName || 'No specific session selected',
      session_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      selected_note_files: notesWithContent.map((note: NoteDetail) => note.filename || 'Unknown File'),
      coded_transcript_content: coded_transcript_content,
      notes_content: notes_content,
      note_takers: noteTakers.join(', '),
      participant_id: participantCode,
      researcher_contact: study?.researcher_name || study?.researcher_email || '',
      analyzer: (body.user as Record<string, string>).username || body.user.name || body.user.id
    };

    const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "session_summary.yaml");

    const studyPath = study?.path;
    if (!studyPath) throw new Error('Unexpected: study.path missing after resolution');

    // PH-5A: Resolve canonical evidence_source BEFORE model generation.
    // Source identity must exist before derived evidence is generated.
    const governedContent = [coded_transcript_content, notes_content].filter(Boolean).join('\n\n---\n\n');
    let evidenceSourceId: number | null = null;
    let evidenceSourcePublicId: string | null = null;
    if (transcriptNotes.length > 0) {
      try {
        const primaryTranscript = transcriptNotes[0];
        const resolvedSource = await resolveSessionSource({
          projectId,
          studyId: resolvedStudyId,
          studyNotesId: primaryTranscript.id,
          sourceType: primaryTranscript.transcript ? 'session_transcript' : 'session_notes',
          label: primaryTranscript.filename || 'Session transcript',
          governedContent,
          createdBy: body.user.id,
        });
        evidenceSourceId = resolvedSource.id;
        evidenceSourcePublicId = resolvedSource.publicId;
        console.log(`✅ Evidence source ${resolvedSource.isNew ? 'created' : 'reused'}: ${evidenceSourcePublicId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Evidence source creation failed (non-blocking): ${message}`);
      }
    }

    // PH-6B: Artifact identity context for session summary
    (templateData as unknown as Record<string, unknown>).__artifactContext = {
      projectId,
      studyId: resolvedStudyId,
      artifactType: 'fieldwork',
      title: `Session summary — ${participantCode}`,
      canonicalUpstreamInputs: evidenceSourcePublicId
        ? [`source:${evidenceSourcePublicId}`]
        : [],
      createdBy: body.user.id,
    };

    // H9: Construct PII context for pre-transmission assertion in langchain
    const piiContext: PiiRedactionContext | undefined = participantName
      ? { knownNames: [participantName], participantCode }
      : undefined;

    // PH-6D2: Use prepare/finalize flow for single GitHub write
    const { prepareYamlTemplate, finalizeArtifactWrite } = require('../../../helpers/yamlProcessor');
    const prepared = await prepareYamlTemplate(
      yamlTemplateFile.content, templateData, studyPath, '', variableContext, piiContext,
    );

    if (!prepared.extractionOutcome.success) {
      throw new Error(`Cascade variable extraction failed: ${prepared.extractionOutcome.error}. Generation complete but variables were not written.`);
    }
    console.log(`✅ Cascade variables committed: ${prepared.extractionOutcome.variableCount} items (${prepared.extractionKeys.join(', ')})`);

    // PH-5A: Create nugget evidence_constructs from extracted atomic_nugget_core.
    // Nugget anchoring deferred to PH-7 (nuggets are table-embedded, not individual sections).
    if (evidenceSourceId && prepared.extractionKeys.includes('atomic_nugget_core')) {
      try {
        const vars = await readStudyVariablesByContext({ projectId, studyId: resolvedStudyId });
        const nuggetCoreItems = vars.variables?.atomic_nugget_core;
        if (Array.isArray(nuggetCoreItems) && nuggetCoreItems.length > 0) {
          const thisParticipantNuggets = nuggetCoreItems.filter(
            (n: Record<string, unknown>) => n.participant === participantCode,
          );
          const nuggetInputs: NuggetInput[] = thisParticipantNuggets.map((n: Record<string, unknown>) => ({
            displayId: (n.id as string) || `nugget-${participantCode}-unknown`,
            nuggetType: (n.nugget_type as string) || 'unknown',
            severity: (n.severity as number) ?? 0,
            text: (n.text as string) || '',
            participantCode: (n.participant as string) || participantCode,
            session: (n.session as string) || '',
          }));

          const createdNuggets = await createNuggetConstructs(
            evidenceSourceId, projectId, resolvedStudyId, nuggetInputs,
            { templateId: 'session_summary', templateVersion: 'v7.2', modelName: getDefaultModelName() },
            body.user.id,
          );
          console.log(`✅ Evidence lineage: ${createdNuggets.length} nugget constructs linked to source ${evidenceSourcePublicId}`);

          // Store nugget IDs for post-finalize attachment
          (templateData as unknown as Record<string, unknown>).__createdNuggetIds = createdNuggets.map(c => c.constructId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ Nugget evidence construct creation failed (non-blocking): ${message}`);
      }
    }

    // FINALIZE: Single GitHub write (no canonical ref section for session summaries — deferred to PH-7)
    const renderedYaml = await finalizeArtifactWrite(prepared);

    // PH-6C: Attach nugget evidence refs (artifact now status=written)
    const nuggetIds = (templateData as unknown as Record<string, unknown>).__createdNuggetIds as number[] | undefined;
    if (nuggetIds && nuggetIds.length > 0) {
      const attachResult = await attachEvidenceRefsVerified(
        renderedYaml.artifactPublicId, nuggetIds,
        { projectId, studyId: resolvedStudyId, templateId: 'session_summary', workflow: 'analyze' },
      );
      if (attachResult.attached > 0) {
        console.log(`✅ Artifact→evidence: ${attachResult.attached} nugget refs attached to artifact ${renderedYaml.artifactPublicId}`);
      }
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
            text: `<${result.url}|View Session Summary on GitHub>`,
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

/**
 * sessionNotesHandler.ts — /qori-notes command and modal handlers
 *
 * Handles session notes upload (file upload or manual entry).
 * Two tabs: "manual" (structured observations) and "upload" (transcript files).
 * Manual notes go through session_notes.yaml; uploads save raw to GitHub.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { buildSessionNotesView } from "../ui/sessionNotesModal";
import { buildTranscriptReviewModal, type TranscriptReviewModalMetadata } from "../ui/transcriptReviewModal";
import sessionObserverService from "../../../services/session_observer.service";
import sessionParticipantService from "../../../services/study_participant.service";
import { resolveStudyFromName } from "../../../services/research_study.service";
import type { VariableContext } from "../../studyVariables";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, createOrUpdateFileOnGitHub } from "../../github";
import { processYamlTemplate } from "../../yamlProcessor";
import { studyNotesService } from "../../../services";
import { processSlackFiles } from "../../pdfProcessor";
import { postEphemeralOrDM } from "../slackHelpers";
import { scrubTranscript, type ScrubContext } from "../../transcriptScrubber";

// ─── Types ──────────────────────────────────────────────────────

interface SessionInfo {
  id: number;
  session_id: string;
  study?: { id?: number; name?: string; researcher_name?: string };
  participant?: {
    id?: number;  // H6: participant FK
    participant_name?: string;
    scheduled_date?: string;
    scheduled_time?: string;
  };
}

interface SessionDisplayInfo {
  id: number;
  displayName: string;
  study: SessionInfo['study'];
  participant: SessionInfo['participant'];
  session_id: string;
}

interface ModalState {
  tab: 'manual' | 'upload';
  method?: string;
  sessions: SessionInfo[];
  session?: SessionDisplayInfo;
  origin: {
    team: string;
    channel: string;
    user: string;
    ts?: string;
  };
}

interface ViewMetadata {
  tab?: string;
  method?: string;
  mode?: 'researcher' | 'observer';
  userId: string;
  teamId: string;
  channelId: string;
  selectedSessionId?: string;
}

/** Data shape passed to session_notes YAML template. */
interface SessionNotesTemplateInput {
  session_id: string;
  participant_name: string;
  observer_name: string;
  session_date: string;
  session_time: string;
  researcher: string;
  slack_user_id: string;
  study_name: string;
  participant_id: string;
  slack_ts?: string;
  structured_notes?: string;
  input_text?: string;
  transcript_files?: string;
  filename?: string;
  folder_context?: string;
  upload_date_utc?: string;
  transcript_source?: string;
  manual_notes_text_or_blank?: string;
}

interface ProcessedFile {
  name: string;
  content: string;
  type: string;
  size: number;
}

interface GitHubResult {
  path: string;
  url: string;
}

// ─── Helper: build display name for a session ───────────────────

function buildSessionDisplayName(session: SessionInfo): string {
  return `${session.study?.name || 'Unknown Study'} - ${session.participant?.participant_name || 'Unknown Participant'} (${session.session_id || 'Unknown Session'})`;
}

// ─── Command handler ────────────────────────────────────────────

const uploadNotesHandler = async ({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> => {
  console.log("🚀 ~ uploadNotesHandler ~ body:", body);

  try {
    await ack();

    const userId = command.user_id;
    const sessions: any[] = await sessionObserverService.getObserverByUser(userId);
    console.log("🚀 ~ uploadNotesHandler ~ sessions:", sessions);

    if (!sessions || sessions.length === 0) {
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        `❌ You don't have any approved sessions to observe. Please contact your research coordinator to be assigned to sessions.`
      );
      return;
    }

    let initialSession: SessionDisplayInfo | null = null;
    if (sessions.length > 0) {
      const firstSession = sessions[0];
      initialSession = {
        id: firstSession.id,
        displayName: buildSessionDisplayName(firstSession),
        study: firstSession.study,
        participant: firstSession.participant,
        session_id: firstSession.session_id
      };
    }

    const initialState: ModalState = {
      tab: 'manual',
      session: initialSession || undefined,
      sessions: sessions,
      origin: {
        team: command.team_id,
        channel: command.channel_id,
        user: command.user_id,
        ts: command.trigger_id
      }
    };

    await client.views.open({
      trigger_id: command.trigger_id,
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      view: buildSessionNotesView(initialState)
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error opening upload notes modal:", error);

    try {
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        `❌ Failed to open upload notes modal: ${message}`,
      );
    } catch (chatError) {
      console.error("Could not send error message to user:", chatError);
    }
  }
};

// ─── Tab handlers ───────────────────────────────────────────────

const handleTabManual = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();
  const metadata = JSON.parse(body.view?.private_metadata || '{}') as ViewMetadata;

  const sessions: any[] = await sessionObserverService.getObserverByUser(metadata.userId);

  const state: ModalState = {
    tab: 'manual',
    method: metadata.method || 'files',
    sessions: sessions,
    origin: {
      team: metadata.teamId,
      channel: metadata.channelId,
      user: metadata.userId
    }
  };

  if (metadata.selectedSessionId) {
    const selectedSession = sessions.find((s: SessionInfo) => s.id.toString() === metadata.selectedSessionId!.toString());
    if (selectedSession) {
      state.session = {
        id: selectedSession.id,
        displayName: buildSessionDisplayName(selectedSession),
        study: selectedSession.study,
        participant: selectedSession.participant,
        session_id: selectedSession.session_id
      };
    }
  }

  await client.views.update({
    view_id: body.view!.id,
    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    view: buildSessionNotesView(state)
  });
};

const handleTabUpload = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();
  const metadata = JSON.parse(body.view?.private_metadata || '{}') as ViewMetadata;

  const sessions: any[] = await sessionObserverService.getObserverByUser(metadata.userId);

  const state: ModalState = {
    tab: 'upload',
    method: metadata.method || 'files',
    sessions: sessions,
    origin: {
      team: metadata.teamId,
      channel: metadata.channelId,
      user: metadata.userId
    }
  };

  if (metadata.selectedSessionId) {
    const selectedSession = sessions.find((s: SessionInfo) => s.id.toString() === metadata.selectedSessionId!.toString());
    if (selectedSession) {
      state.session = {
        id: selectedSession.id,
        displayName: buildSessionDisplayName(selectedSession),
        study: selectedSession.study,
        participant: selectedSession.participant,
        session_id: selectedSession.session_id
      };
    }
  }

  await client.views.update({
    view_id: body.view!.id,
    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    view: buildSessionNotesView(state)
  });
};

// ─── Session selection change ───────────────────────────────────

const handleSessionSelectionChange = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();

  try {
    const selectedSessionId: string = (body as unknown as { actions: Array<{ selected_option: { value: string } }> }).actions[0].selected_option.value;
    const metadata = JSON.parse(body.view?.private_metadata || '{}') as ViewMetadata;

    const sessions: any[] = await sessionObserverService.getObserverByUser(metadata.userId);
    const selectedSession = sessions.find((s: SessionInfo) => s.id.toString() === selectedSessionId);

    if (selectedSession) {
      const updatedState: ModalState = {
        tab: (metadata.tab as 'manual' | 'upload') || 'upload',
        method: metadata.method || 'files',
        sessions: sessions,
        origin: {
          team: metadata.teamId,
          channel: metadata.channelId,
          user: metadata.userId
        },
        session: {
          id: selectedSession.id,
          displayName: buildSessionDisplayName(selectedSession),
          study: selectedSession.study,
          participant: selectedSession.participant,
          session_id: selectedSession.session_id
        }
      };

      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      const updatedView = buildSessionNotesView(updatedState);

      await client.views.update({
        view_id: body.view!.id,
        view: updatedView
      });
    }
  } catch (error) {
    console.error('Error handling session selection:', error);
  }
};

// ─── Submission handler ─────────────────────────────────────────

const handleSessionNotesSubmission = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    const values = view.state.values;
    console.log("🚀 ~ handleSessionNotesSubmission ~ values:", values);
    const metadata = JSON.parse(view.private_metadata || '{}') as ViewMetadata;
    const isManual = metadata.tab === 'manual';

    const selectedSessionId: string | undefined = values.session_select?.session_select_change?.selected_option?.value;

    // Resolve selected session — observer path or researcher path
    let selectedSession: SessionInfo | undefined;
    if (metadata.mode === 'researcher' && selectedSessionId?.startsWith('p_')) {
      const participantId = parseInt(selectedSessionId.replace('p_', ''), 10);
      const participant = await sessionParticipantService.getParticipantById(participantId);
      if (participant) {
        selectedSession = {
          id: participantId,
          session_id: participant.participant_code,
          study: participant.study || { name: 'Unknown Study' },
          // @ts-expect-error — pre-existing type mismatch from require() → import migration
          participant,
        };
      }
    } else {
      const sessions: any[] = await sessionObserverService.getObserverByUser(metadata.userId);
      selectedSession = sessions.find((s: SessionInfo) => s.id.toString() === selectedSessionId);
    }

    if (!selectedSession || selectedSessionId === 'no_sessions') {
      await ack();
      await client.chat.postMessage({
        channel: body.user.id,
        text: `❌ Please select a valid session before submitting notes. No sessions are currently available.`,
      });
      return;
    }

    let templateData: SessionNotesTemplateInput = {
      session_id: selectedSession.session_id || 'Unknown Session',
      participant_name: selectedSession.participant?.participant_name || 'Unknown Participant',
      observer_name: (body.user as Record<string, string>).username || 'Unknown User',
      session_date: selectedSession.participant?.scheduled_date || 'Unknown Date',
      session_time: selectedSession.participant?.scheduled_time || 'Unknown Time',
      researcher: selectedSession.study?.researcher_name || 'Unknown Researcher',
      slack_user_id: body.user.id || 'Unknown',
      study_name: selectedSession.study?.name || 'Unknown Study',
      participant_id: selectedSession.session_id || 'PT-UNKNOWN',
    };

    let renderedYaml: { result: GitHubResult } | undefined;
    let yamlTemplateName: string | undefined;

    if (isManual) {
      const observations: string = values.observations?.observations_text?.value || '';

      if (!observations || observations.trim() === '') {
        await ack();
        await client.chat.postMessage({
          channel: body.user.id,
          text: `❌ Please enter your observations before submitting.`,
        });
        return;
      }

      // Ack early for manual notes (no review modal needed)
      await ack();

      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');

      templateData = {
        ...templateData,
        slack_ts: `${hours}:${minutes}`,
        structured_notes: observations,
      };

      yamlTemplateName = "session_notes.yaml";
    } else {
      // ── TRANSCRIPT UPLOAD PATH ──
      // PII scrubbing happens here: extract real name, scrub, push review modal
      const filesInput = values.transcript_files?.files as { files?: Array<{ name: string; mimetype: string; url_private?: string; [key: string]: unknown }> } | undefined;
      const filesList = filesInput?.files || [];
      console.log("🚀 ~ handleSessionNotesSubmission ~ files:", filesList);
      const pastedText: string = values.transcript_paste?.text?.value || '';

      // ── Extract participant real name for scrubbing (TRANSIENT — never stored) ──
      // PRIVACY: This variable is used ONLY for in-memory find/replace.
      // It is NEVER: logged, stored to DB, written to temp file, or included in error messages.
      const participantRealName: string = values.pii_real_name?.real_name_input?.value?.trim() || '';
      // NOTE: Do NOT log participantRealName — it's PII

      let rawContent: string = '';

      if (filesList.length > 0) {
        const processedFiles: ProcessedFile[] = await processSlackFiles(filesList, process.env.SLACK_BOT_TOKEN!);
        rawContent = processedFiles.map((file: ProcessedFile) => file.content).join('\n\n---\n\n');

        templateData = {
          ...templateData,
          transcript_files: filesList.map((f: { name: string }) => f.name).join(', '),
          filename: filesList[0]?.name || 'transcript_upload.md',
          folder_context: templateData.study_name || '',
          upload_date_utc: new Date().toISOString(),
          transcript_source: 'file_upload',
          manual_notes_text_or_blank: '',
        };
      } else if (pastedText) {
        rawContent = pastedText;
        templateData = {
          ...templateData,
          manual_notes_text_or_blank: pastedText
        };
      } else {
        await ack();
        await client.chat.postMessage({
          channel: body.user.id,
          text: `❌ Please either upload files or paste transcript content.`,
        });
        return;
      }

      // ── Run PII scrubbing ──
      const scrubCtx: ScrubContext = {
        participantRealName: participantRealName,
        participantCode: templateData.participant_id,
        moderatorName: templateData.researcher,
      };

      const scrubResult = scrubTranscript(rawContent, scrubCtx);
      console.log(`[PII] Scrubbing complete: ${scrubResult.stats.participantName + scrubResult.stats.moderatorName + scrubResult.stats.speakerLabels + scrubResult.stats.phoneNumbers + scrubResult.stats.emailAddresses} items scrubbed`);
      // NOTE: Do NOT log the actual content or names

      // ── Build scrubbed transcript content ──
      const scrubbedTranscriptContent = `# Session Transcript: ${templateData.participant_id}

**Study:** ${templateData.study_name}
**Session date:** ${templateData.session_date}
**Session time:** ${templateData.session_time}
**Researcher:** [Moderator]
**Uploaded:** ${new Date().toISOString()}
**PII Status:** Auto-scrubbed, pending human review

---

${scrubResult.content}`;

      // ── Save scrubbed transcript to GitHub immediately ──
      // Content is already PII-scrubbed, safe to save. We mark pii_reviewed=false in DB
      // until human approves. Analysis gate blocks unreviewed transcripts.
      const resolved = await resolveStudyFromName(templateData.study_name);
      if (!resolved) throw new Error(`Study "${templateData.study_name}" not found`);

      const transcriptFileName = `transcript_${templateData.session_id}_${Date.now()}.md`;
      const transcriptPath = `${resolved.study?.path}/03-sessions/${transcriptFileName}`;

      const githubResult = await createOrUpdateFileOnGitHub(
        transcriptPath,
        scrubbedTranscriptContent,
      );

      // Create DB record with pii_reviewed=false (blocks analysis until approved)
      const studyNoteData = {
        study_id: selectedSession.study?.id || null,
        study_name: templateData.study_name,
        filename: transcriptFileName,
        file_path: transcriptPath,
        file_url: githubResult.url,
        session_date: templateData.session_date,
        session_time: templateData.session_time,
        participant_id: selectedSession.participant?.id || null,
        created_by: body.user.id,
        transcript: true,
        pii_reviewed: false,  // Will be set true on approval
        pii_reviewed_at: null,
        pii_reviewed_by: null,
      };

      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      const createdNote = await studyNotesService.createStudyNote(studyNoteData);
      console.log(`[PII] Transcript saved pending review: ID=${createdNote.id}`);

      // ── Build review modal with minimal metadata (avoids 3001 char limit) ──
      const reviewMetadata: TranscriptReviewModalMetadata = {
        noteId: createdNote.id,
        participantCode: templateData.participant_id,
        studyName: templateData.study_name,
        fileUrl: githubResult.url,
      };

      const reviewModal = buildTranscriptReviewModal({
        scrubbedPreview: scrubResult.content,
        stats: scrubResult.stats,
        warnings: scrubResult.warnings,
        participantCode: templateData.participant_id,
        studyName: templateData.study_name,
        fileUrl: githubResult.url,
      });

      // Store minimal metadata in private_metadata (just IDs, not content)
      reviewModal.private_metadata = JSON.stringify(reviewMetadata);

      // ── Push review modal via ack response_action ──
      // IMPORTANT: Must use ack({ response_action: 'push' }) instead of client.views.push
      // because trigger_id expires after 3 seconds and file processing takes time.
      await ack({
        response_action: 'push',
        view: reviewModal,
      });

      // ── participantRealName is now out of scope — NEVER stored anywhere ──
      return;
    }

    // ── MANUAL NOTES PATH (unchanged) ──
    let result: GitHubResult;
    let fileName: string;

    // Manual notes don't go through PII scrubbing (structured observations, not raw transcript)
    const resolved = await resolveStudyFromName(templateData.study_name);
    if (!resolved) throw new Error(`Study "${templateData.study_name}" not found`);
    const study = resolved.study;
    const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlTemplateName!);
    renderedYaml = await processYamlTemplate(file.content, templateData, study!.path ?? '', '', false, variableContext);
    console.log("🚀 ~ handleSessionNotesSubmission ~ renderedYaml:", renderedYaml);
    result = renderedYaml!.result;
    const urlParts: string[] = result.path.split('/');
    fileName = urlParts[urlParts.length - 1];

    // Store the study note in the database
    // H6: Use participant_id FK instead of denormalized participant_name.
    // To get participant info, join to study_participants via participant_id.
    const studyNoteData = {
      study_id: selectedSession.study?.id || null,
      study_name: templateData.study_name,
      filename: fileName,
      file_path: result.path,
      file_url: result.url,
      session_date: templateData.session_date,
      session_time: templateData.session_time,
      participant_id: selectedSession.participant?.id || null,
      created_by: body.user.id,
      transcript: false,
      pii_reviewed: true,  // Manual notes don't need PII review
      pii_reviewed_at: new Date(),
      pii_reviewed_by: body.user.id,
    };

    console.log("Study note data to be stored:", studyNoteData);

    try {
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      const createdNote = await studyNotesService.createStudyNote(studyNoteData);
      console.log("Study note stored in database:", createdNote);
    } catch (dbError) {
      console.error("Error storing study note in database:", dbError);
    }

    const sessionInfo = `${selectedSession.session_id} - ${selectedSession.study?.name}`;

    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ Session notes submitted successfully`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ Session notes submitted successfully for session: ${sessionInfo}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${result.url}|:github: View on GitHub>`,
          },
        },
      ],
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling session notes submission:", error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error submitting session notes: ${message}`,
    });
  }
};

// ─── Transcript Review Approval Handler ─────────────────────────

/**
 * Handle transcript review approval.
 *
 * Called when user clicks "Approve & Save" on the transcript review modal.
 * The transcript is already saved to GitHub; this just marks it as PII-reviewed.
 */
const handleTranscriptReviewApprove = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    // Parse metadata first (before ack, in case we need to handle errors)
    const metadata: TranscriptReviewModalMetadata = JSON.parse(view.private_metadata || '{}');
    const { noteId, participantCode, studyName, fileUrl } = metadata;

    if (!noteId) {
      await ack();
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Error: Missing transcript record. Please try uploading again.',
      });
      return;
    }

    // Update the existing record to mark as PII-reviewed
    await studyNotesService.updateStudyNote(noteId, {
      pii_reviewed: true,
      pii_reviewed_at: new Date(),
      pii_reviewed_by: body.user.id,
    });
    console.log(`✅ Transcript marked as PII-reviewed: ID=${noteId}`);

    // Close all modals (clear the modal stack) — this is a terminal action
    await ack({ response_action: 'clear' });

    // Notify user
    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ PII-scrubbed transcript approved`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Transcript uploaded and PII-reviewed*\n\n*Study:* ${studyName}\n*Participant:* ${participantCode}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${fileUrl}|View on GitHub>`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '✅ This transcript is now eligible for `/qori-analyze`.',
            },
          ],
        },
      ],
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling transcript review approval:", error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error saving transcript: ${message}`,
    });
  }
};

export {
  uploadNotesHandler,
  handleTabManual,
  handleTabUpload,
  handleSessionSelectionChange,
  handleSessionNotesSubmission,
  handleTranscriptReviewApprove
};

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
  mode?: 'researcher' | 'observer';
  studyId?: string | null;
}

interface ViewMetadata {
  tab?: string;
  method?: string;
  mode?: 'researcher' | 'observer';
  userId: string;
  teamId: string;
  channelId: string;
  selectedSessionId?: string;
  studyId?: string;
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
  try {
    await ack();

    const userId = command.user_id;
    const sessions: any[] = await sessionObserverService.getObserverByUser(userId);

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

// ─── Helper: load sessions based on mode ────────────────────

async function loadSessionsForMode(metadata: ViewMetadata): Promise<any[]> {
  // Observer path: user has observer sessions
  const observerSessions = await sessionObserverService.getObserverByUser(metadata.userId);
  if (observerSessions && observerSessions.length > 0) {
    return observerSessions;
  }

  // Researcher fallback: use study participants if mode is researcher and studyId is available
  if (metadata.mode === 'researcher' && metadata.studyId) {
    const participants = await sessionParticipantService.getParticipantsByStudy(parseInt(metadata.studyId, 10));
    if (participants && participants.length > 0) {
      return participants.map((p: any) => ({
        id: `p_${p.id}`,
        study: p.study || { id: metadata.studyId, name: 'Unknown Study' },
        participant: p,
        session_id: p.participant_code,
      }));
    }
  }

  return [];
}

// ─── Tab handlers ───────────────────────────────────────────

const handleTabManual = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();
  const metadata = JSON.parse(body.view?.private_metadata || '{}') as ViewMetadata;

  const sessions: any[] = await loadSessionsForMode(metadata);

  const state: ModalState = {
    tab: 'manual',
    method: metadata.method || 'files',
    sessions: sessions,
    origin: {
      team: metadata.teamId,
      channel: metadata.channelId,
      user: metadata.userId
    },
    mode: metadata.mode,
    studyId: metadata.studyId,
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

  const sessions: any[] = await loadSessionsForMode(metadata);

  const state: ModalState = {
    tab: 'upload',
    method: metadata.method || 'files',
    sessions: sessions,
    origin: {
      team: metadata.teamId,
      channel: metadata.channelId,
      user: metadata.userId
    },
    mode: metadata.mode,
    studyId: metadata.studyId,
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

    const sessions: any[] = await loadSessionsForMode(metadata);
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
        },
        mode: metadata.mode,
        studyId: metadata.studyId,
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
  let ackCalled = false;  // Track if ack was called to avoid double-ack

  try {
    const values = view.state.values;
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
      ackCalled = true;
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
        ackCalled = true;
        await client.chat.postMessage({
          channel: body.user.id,
          text: `❌ Please enter your observations before submitting.`,
        });
        return;
      }

      // Ack early for manual notes (no review modal needed)
      await ack();
      ackCalled = true;

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
        ackCalled = true;
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

      // ── Build scrubbed transcript content with PII marker ──
      // GREPPABLE MARKER: allows finding unreviewed files with a simple grep
      // On approval, marker is flipped to REVIEWED-CLEARED
      const piiMarkerPending = '<!-- PII-STATUS: PENDING-REVIEW -->';

      const scrubbedTranscriptContent = `${piiMarkerPending}
# Session Transcript: ${templateData.participant_id}

**Study:** ${templateData.study_name}
**Session date:** ${templateData.session_date}
**Session time:** ${templateData.session_time}
**Researcher:** [Moderator]
**Uploaded:** ${new Date().toISOString()}
**PII Status:** Auto-scrubbed, pending human review

---

${scrubResult.content}`;

      // ── Save scrubbed transcript to QUARANTINE location ──
      // IMPORTANT: Transcript goes to .pending-review/ NOT 03-sessions/.
      // Human must review full transcript before it reaches the final location.
      // Auto-scrub is PARTIAL by design (name variants, incidental PII slip through).
      // Review GATES the commit to final location - it's not rubber-stamping.
      const resolved = await resolveStudyFromName(templateData.study_name);
      if (!resolved) throw new Error(`Study "${templateData.study_name}" not found`);

      // DETERMINISTIC filename: re-uploads of same session REPLACE the pending file
      const transcriptFileName = `transcript_${templateData.session_id}.md`;
      // Quarantine path - NOT analyzable, NOT the final transcript location
      const quarantinePath = `${resolved.study?.path}/.pending-review/${transcriptFileName}`;
      // Final path - where it goes AFTER human approval
      const finalPath = `${resolved.study?.path}/03-sessions/${transcriptFileName}`;

      // Save to quarantine (NOT the final location)
      const githubResult = await createOrUpdateFileOnGitHub(
        quarantinePath,
        scrubbedTranscriptContent,
      );
      console.log(`[PII] Transcript saved to quarantine: ${quarantinePath}`);

      // NO database record yet - record is created only on approval
      // This ensures /qori-analyze cannot find this transcript until reviewed

      // ── Build review modal with metadata for approval flow ──
      // NO database record exists yet - created only on approval
      const reviewMetadata: TranscriptReviewModalMetadata = {
        quarantinePath,
        finalPath,
        filename: transcriptFileName,
        participantCode: templateData.participant_id,
        studyName: templateData.study_name,
        fileUrl: githubResult.url,
        studyId: selectedSession.study?.id || null,
        participantId: selectedSession.participant?.id || null,
        sessionDate: templateData.session_date,
        sessionTime: templateData.session_time,
        userId: body.user.id,
      };

      const reviewModal = buildTranscriptReviewModal({
        stats: scrubResult.stats,
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
      ackCalled = true;

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

    // Must ack() before sending error message, otherwise Slack shows timeout error
    if (!ackCalled) {
      try {
        await ack();
      } catch {
        // ack() might fail if already called or timed out, ignore
      }
    }

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
 * Called when user clicks "Approve" on the transcript review modal.
 * MOVES the transcript from quarantine (.pending-review/) to final location (03-sessions/).
 * This is the gate - transcript only reaches final location AFTER human review.
 */
const handleTranscriptReviewApprove = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    // Parse metadata
    const metadata: TranscriptReviewModalMetadata = JSON.parse(view.private_metadata || '{}');
    const {
      quarantinePath,
      finalPath,
      filename,
      participantCode,
      studyName,
      studyId,
      participantId,
      sessionDate,
      sessionTime,
      userId,
    } = metadata;

    if (!quarantinePath || !finalPath) {
      await ack();
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Error: Missing transcript paths. Please try uploading again.',
      });
      return;
    }

    // Close all modals first — this is a terminal action
    await ack({ response_action: 'clear' });

    // ── MOVE from quarantine to final location ──
    // 1. Read content from quarantine
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = process.env.GITHUB_OWNER!;
    const repo = process.env.GITHUB_REPO!;

    // Read quarantined file
    const quarantineFile = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: quarantinePath,
    });

    if (!('content' in quarantineFile.data)) {
      throw new Error('Quarantine file not found or is a directory');
    }

    const rawContent = Buffer.from(quarantineFile.data.content, 'base64').toString('utf-8');
    const quarantineSha = quarantineFile.data.sha;

    // 2. Flip PII marker from PENDING-REVIEW to REVIEWED-CLEARED
    // Use regex for more robust matching (handles whitespace/encoding variations)
    const reviewedContent = rawContent
      .replace(/<!--\s*PII-STATUS:\s*PENDING-REVIEW\s*-->/gi, '<!-- PII-STATUS: REVIEWED-CLEARED -->')
      .replace(/\*\*PII Status:\*\*\s*Auto-scrubbed,?\s*pending human review/gi, `**PII Status:** Reviewed and cleared by <@${body.user.id}>`);

    // 3. Write to final location with updated marker
    const finalResult = await createOrUpdateFileOnGitHub(finalPath, reviewedContent);
    console.log(`✅ Transcript moved to final location: ${finalPath}`);

    // 3. Delete quarantine file
    await octokit.rest.repos.deleteFile({
      owner,
      repo,
      path: quarantinePath,
      message: `Remove quarantine file after PII review approval`,
      sha: quarantineSha,
    });
    console.log(`✅ Quarantine file deleted: ${quarantinePath}`);

    // 4. Create DB record NOW (only after approval)
    const studyNoteData = {
      study_id: studyId,
      study_name: studyName,
      filename,
      file_path: finalPath,
      file_url: finalResult.url,
      session_date: sessionDate,
      session_time: sessionTime,
      participant_id: participantId,
      created_by: userId,
      transcript: true,
      pii_reviewed: true,
      pii_reviewed_at: new Date(),
      pii_reviewed_by: body.user.id,
    };

    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    const createdNote = await studyNotesService.createStudyNote(studyNoteData);
    console.log(`✅ Study note created with pii_reviewed=true: ID=${createdNote.id}`);

    // Notify user
    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ Transcript approved and saved`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Transcript approved and saved*\n\n*Study:* ${studyName}\n*Participant:* ${participantCode}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${finalResult.url}|View on GitHub>`,
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

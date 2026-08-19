/**
 * sessionNotesHandler.ts — /qori-notes command and modal handlers
 *
 * Handles session notes upload (file upload or manual entry).
 * Two tabs: "manual" (structured observations) and "upload" (transcript files).
 * Manual notes go through session_notes.yaml; uploads save raw to GitHub.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { buildSessionNotesView, type PreservedInputs } from "../ui/sessionNotesModal";
import {
  type TranscriptReviewMetadata,
  type TranscriptReviewModalMetadata,
  type ScrubStats,
  buildReviewUrl,
  buildTranscriptReviewDmBlocks,
  buildApprovedDmBlocks,
  buildRejectedDmBlocks,
  buildRescrubModal,
  buildApproveModal,
  buildRejectModal,
} from "../ui/transcriptReviewModal";
import { logDispositionAction } from "../../../services/audit.service";
import sessionObserverService from "../../../services/session_observer.service";
import sessionParticipantService from "../../../services/study_participant.service";
import { resolveStudyFromName } from "../../../services/research_study.service";
import { assertStudyAccess, AuthorizationError } from "../../../services/authorization.service";
import { studyNotesService } from "../../../services";
import { processSlackFiles } from "../../pdfProcessor";
import { postEphemeralOrDM } from "../slackHelpers";
import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import {
  uploadTranscript as uploadTranscriptAppService,
  approveTranscript as approveTranscriptAppService,
  approveManualNotes as approveManualNotesAppService,
  type TranscriptUploadInput,
  type TranscriptApprovalInput,
  type ManualNotesApprovalInput,
} from '../../../application/transcript.app-service';

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
  preserved?: PreservedInputs;
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
  preserved?: PreservedInputs;
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

// ─── Helper: extract input values to preserve across view rebuilds ───
// PRIVACY: piiRealName transits through private_metadata during rebuilds only.
// It is used for scrubbing, then discarded — never persisted to database or logged.

function extractPreservedInputs(values: Record<string, Record<string, { value?: string | null; selected_option?: { value: string } | null }>>): PreservedInputs {
  // Extract only fields that exist in the current view's state.values.
  // IMPORTANT: Only include keys that have actual values — undefined values would
  // overwrite previously preserved values when merged with spread operator.
  const result: PreservedInputs = {};

  // Upload tab fields (only present when Upload tab is active)
  const piiRealName = values.pii_real_name?.real_name_input?.value;
  if (piiRealName) result.piiRealName = piiRealName;

  const pastedText = values.transcript_paste?.text?.value;
  if (pastedText) result.pastedText = pastedText;

  const transcriptSource = values.transcript_source_block?.transcript_source?.selected_option?.value;
  if (transcriptSource) result.transcriptSource = transcriptSource;

  // Manual tab fields (only present when Manual tab is active)
  const observations = values.observations?.observations_text?.value;
  if (observations) result.observations = observations;

  return result;
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
  const values = body.view?.state?.values || {};

  // Preserve input values across tab switch (merge current + previously preserved)
  // extractPreservedInputs only returns keys with actual values, so spread won't overwrite
  const preserved = {
    ...metadata.preserved,
    ...extractPreservedInputs(values)
  };

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
    preserved,
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
  const values = body.view?.state?.values || {};

  // Preserve input values across tab switch (merge current + previously preserved)
  // extractPreservedInputs only returns keys with actual values, so spread won't overwrite
  const preserved = {
    ...metadata.preserved,
    ...extractPreservedInputs(values)
  };

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
    preserved,
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
    const values = body.view?.state?.values || {};

    // Preserve input values across session selection change
    const preserved = {
      ...metadata.preserved,
      ...extractPreservedInputs(values)
    };

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
        preserved,
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
      // 5f pattern: inline errors instead of ack()+DM — modal stays open
      await (ack as Function)({
        response_action: "errors",
        errors: {
          session_select: "Please select a valid session. No sessions are currently available."
        }
      });
      return;
    }

    // ── GOV-1: Authorization check ──
    // Resolve canonical study from persisted session state, not metadata.
    const sessionStudyId = selectedSession.study?.id;
    if (!sessionStudyId) {
      // Unresolved study scope → fail closed (correction #1)
      await (ack as Function)({
        response_action: "errors",
        errors: {
          session_select: "Cannot determine study scope for this session. Contact your research coordinator."
        }
      });
      return;
    }
    try {
      await assertStudyAccess(body.user.id, sessionStudyId, client);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        console.warn(`[AUTH] Session notes submission denied: user=${body.user.id} study=${sessionStudyId}`);
        await (ack as Function)({
          response_action: "errors",
          errors: {
            session_select: "Access denied: you are not a member of this study's project."
          }
        });
        return;
      }
      throw err;
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
        // 5f pattern: inline errors instead of ack()+DM — modal stays open
        await (ack as Function)({
          response_action: "errors",
          errors: {
            observations: "Please enter your observations before submitting."
          }
        });
        return;
      }

      // Ack immediately to avoid Slack timeout (AI generation takes >3 sec)
      // Review will be sent via DM after processing completes
      await ack();
      ackCalled = true;

      // Send processing notification
      await client.chat.postMessage({
        channel: body.user.id,
        text: '⏳ Processing your session notes... This will take a moment.',
      });

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
      // 5f fix (b): trim for validation only — whitespace-only must fail
      // Raw content preserved for storage (both paste and file paths save unmodified input)
      // NOTE: Slack's plain_text_input strips leading/trailing whitespace at the API level.
      // Confirmed via WHITESPACE-DIAG test (2026-07-10): even when user pastes content with
      // a leading blank line, startsWithWhitespace=false arrives here. This is Slack behavior,
      // not application code — we cannot preserve whitespace that Slack removes before delivery.
      const pastedTextRaw: string = values.transcript_paste?.text?.value || '';
      const pastedTextTrimmed: string = pastedTextRaw.trim();

      // ── Extract participant real name for scrubbing (TRANSIENT — never stored) ──
      // PRIVACY: This variable is used ONLY for in-memory find/replace.
      // It is NEVER: logged, stored to DB, written to temp file, or included in error messages.
      const participantRealName: string = values.pii_real_name?.real_name_input?.value?.trim() || '';
      // NOTE: Do NOT log participantRealName — it's PII

      let rawContent: string = '';

      if (filesList.length > 0) {
        const processedFiles: ProcessedFile[] = await processSlackFiles(filesList, process.env.SLACK_BOT_TOKEN!);
        rawContent = processedFiles.map((file: ProcessedFile) => file.content).join('\n\n---\n\n');

        // 5f fix (c): validate non-empty content AFTER download
        if (!rawContent.trim()) {
          await (ack as Function)({
            response_action: "errors",
            errors: {
              transcript_files: "Uploaded file(s) contain no text content. Check that the file isn't empty or corrupted."
            }
          });
          return;
        }

        templateData = {
          ...templateData,
          transcript_files: filesList.map((f: { name: string }) => f.name).join(', '),
          filename: filesList[0]?.name || 'transcript_upload.md',
          folder_context: templateData.study_name || '',
          upload_date_utc: new Date().toISOString(),
          transcript_source: 'file_upload',
          manual_notes_text_or_blank: '',
        };
      } else if (pastedTextTrimmed) {
        // Store raw content (preserves leading/trailing whitespace from user input)
        rawContent = pastedTextRaw;
        templateData = {
          ...templateData,
          manual_notes_text_or_blank: pastedTextRaw
        };
      } else {
        // 5f fix (a): inline errors instead of ack()+DM — modal stays open
        await (ack as Function)({
          response_action: "errors",
          errors: {
            transcript_paste: "Please either upload files or paste transcript content."
          }
        });
        return;
      }

      // ── PLAT-3: App service is the ONLY business path ──
      const transcriptAppCtx = await buildSlackApplicationContext(body.user.id, body.team?.id || '');

      if (!transcriptAppCtx) {
        // FAIL CLOSED — no identity resolution means no business logic
        if (!ackCalled) { await ack(); ackCalled = true; }
        await client.chat.postMessage({
          channel: body.user.id,
          text: '❌ Unable to resolve identity. Please contact your workspace administrator.',
        });
        return;
      }

      // ── APP SERVICE PATH: delegate scrubbing + quarantine write ──
      const resolvedForUpload = await resolveStudyFromName(templateData.study_name);
      if (!resolvedForUpload) throw new Error(`Study "${templateData.study_name}" not found`);

      const uploadInput: TranscriptUploadInput = {
        studyId: resolvedForUpload.studyId,
        projectId: resolvedForUpload.projectId,
        studyName: templateData.study_name,
        studyPath: resolvedForUpload.study?.path || '',
        sessionId: templateData.session_id,
        participantName: templateData.participant_name,
        participantCode: templateData.participant_id,
        sessionDate: templateData.session_date,
        sessionTime: templateData.session_time,
        researcherName: templateData.researcher,
        rawContent,
        isTranscript: true,
        participantRealName,
        createdByActorId: String(transcriptAppCtx.actor.id),
      };

      const uploadResult = await uploadTranscriptAppService(transcriptAppCtx, uploadInput);

      // Close the upload modal
      if (!ackCalled) { await ack(); ackCalled = true; }

      // Derive review URL from quarantine path
      const appFileUrl = buildReviewUrl(uploadResult.quarantinePath!);

      // ── DM-FIRST ORDERING: Post review DM using app service result ──
      const appPartialMeta: Omit<TranscriptReviewMetadata, 'dmChannelId' | 'messageTs'> = {
        quarantinePath: uploadResult.quarantinePath!,
        finalPath: uploadResult.finalPath,
        filename: `transcript_${templateData.session_id}.md`,
        participantCode: templateData.participant_id,
        studyName: templateData.study_name,
        fileUrl: appFileUrl,
        studyId: selectedSession.study?.id || null,
        participantId: selectedSession.participant?.id || null,
        sessionDate: templateData.session_date,
        sessionTime: templateData.session_time,
        userId: body.user.id,
      };

      let appDmResult: { channel: string; ts: string };
      try {
        const placeholderMeta = JSON.stringify({ ...appPartialMeta, dmChannelId: '', messageTs: '' });
        const dmBlocks = buildTranscriptReviewDmBlocks({
          stats: uploadResult.scrubStats,
          participantCode: templateData.participant_id,
          studyName: templateData.study_name,
          fileUrl: appFileUrl,
          nameProvided: Boolean(participantRealName),
          buttonMetadata: placeholderMeta,
        });

        const postResult = await client.chat.postMessage({
          channel: body.user.id,
          text: `PII Review: ${templateData.study_name} - ${templateData.participant_id}`,
          blocks: dmBlocks,
        });

        if (!postResult.ok || !postResult.ts || !postResult.channel) {
          throw new Error('DM post returned no ts/channel');
        }
        appDmResult = { channel: postResult.channel, ts: postResult.ts };
        console.log(`[PII-SEQ] 1/2 DM posted: channel=${appDmResult.channel} ts=${appDmResult.ts}`);
      } catch (dmErr) {
        const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
        console.error('[PII] Review DM failed:', dmMessage);
        await postEphemeralOrDM(client, body.user.id, metadata.channelId || body.user.id,
          'Could not deliver the review message. Transcript was saved to quarantine but review DM failed. Please try again.');
        return;
      }

      // Update DM with real button metadata
      const appFullMeta: TranscriptReviewMetadata = {
        ...appPartialMeta as any,
        dmChannelId: appDmResult.channel,
        messageTs: appDmResult.ts,
      };
      const appButtonMeta = JSON.stringify(appFullMeta);

      const appFinalDmBlocks = buildTranscriptReviewDmBlocks({
        stats: uploadResult.scrubStats,
        participantCode: templateData.participant_id,
        studyName: templateData.study_name,
        fileUrl: appFileUrl,
        nameProvided: Boolean(participantRealName),
        buttonMetadata: appButtonMeta,
      });
      await client.chat.update({
        channel: appDmResult.channel,
        ts: appDmResult.ts,
        text: `PII Review: ${templateData.study_name} - ${templateData.participant_id}`,
        blocks: appFinalDmBlocks,
      });
      console.log(`[PII-SEQ] 2/2 DM button metadata attached`);

      // ── participantRealName is now out of scope — NEVER stored anywhere ──
      // NO database record yet — record is created only on approval
      return;
    }

    // ── MANUAL NOTES PATH — DB-held quarantine (no git until approval) ──
    // Manual notes are MORE prone to incidental free-text PII ("her husband Mike",
    // "near the Denver VA") that auto-scrub cannot catch. Human review is the
    // primary protection here, not the auto-scrub.
    //
    // DB-HELD QUARANTINE: Content stored in pending_content column, NOT git.
    // Git history only contains approved/reviewed content (no quarantine commits).
    // On approval: read from DB, write to git for FIRST time, clear pending_content.

    // ── PLAT-3: App service is the ONLY business path ──
    const manualAppCtx = await buildSlackApplicationContext(body.user.id, body.team?.id || '');

    if (!manualAppCtx) {
      // FAIL CLOSED — no identity resolution means no business logic
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Unable to resolve identity. Please contact your workspace administrator.',
      });
      return;
    }

    // ── APP SERVICE PATH: delegate manual notes processing ──
    const manualResolved = await resolveStudyFromName(templateData.study_name);
    if (!manualResolved) throw new Error(`Study "${templateData.study_name}" not found`);

    const manualUploadInput: TranscriptUploadInput = {
      studyId: manualResolved.studyId,
      projectId: manualResolved.projectId,
      studyName: templateData.study_name,
      studyPath: manualResolved.study?.path || '',
      sessionId: templateData.session_id,
      participantName: templateData.participant_name,
      participantCode: templateData.participant_id,
      sessionDate: templateData.session_date,
      sessionTime: templateData.session_time,
      researcherName: templateData.researcher,
      rawContent: templateData.structured_notes || '',
      isTranscript: false,
      participantRealName: '',
      createdByActorId: String(manualAppCtx.actor.id),
    };

    const manualUploadResult = await uploadTranscriptAppService(manualAppCtx, manualUploadInput);

    // Build honest status text from app service result
    const manualPhoneCount = manualUploadResult.scrubStats.phoneNumbers;
    const manualEmailCount = manualUploadResult.scrubStats.emailAddresses;
    const manualScrubParts: string[] = [];
    if (manualPhoneCount > 0) manualScrubParts.push(`${manualPhoneCount} phone number${manualPhoneCount !== 1 ? 's' : ''} → [PHONE]`);
    if (manualEmailCount > 0) manualScrubParts.push(`${manualEmailCount} email${manualEmailCount !== 1 ? 's' : ''} → [EMAIL]`);
    const manualStatsText = manualScrubParts.length > 0
      ? `Auto-scrub applied: ${manualScrubParts.join(' · ')}`
      : 'Auto-scrub applied: no phone/email patterns found';

    // Read pending content from DB for inline display
    const manualPendingNote = await studyNotesService.getStudyNoteById(manualUploadResult.noteId!);
    const manualScrubbedContent: string = manualPendingNote.pending_content || '';
    const manualDisplayContent = manualScrubbedContent.length > 2800
      ? manualScrubbedContent.slice(0, 2800) + '\n\n... (truncated for display)'
      : manualScrubbedContent;

    const manualApprovalMeta = {
      noteId: manualUploadResult.noteId!,
      finalPath: manualUploadResult.finalPath,
      filename: `notes_${templateData.session_id}.md`,
      participantCode: templateData.participant_id,
      studyName: templateData.study_name,
    };

    await client.chat.postMessage({
      channel: body.user.id,
      text: `PII Review Required: ${templateData.study_name} - ${templateData.participant_id}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: 'PII Review Required' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `*Study:* ${templateData.study_name} · *Participant:* ${templateData.participant_id}` }] },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: manualStatsText } },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Not covered by auto-scrub: names of other people, places, dates, or details mentioned in conversation. Finding these is your review.' }] },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '```\n' + manualDisplayContent + '\n```' } },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Approve & Commit to Git' }, style: 'primary', action_id: 'manual_notes_approve', value: JSON.stringify(manualApprovalMeta) },
            { type: 'button', text: { type: 'plain_text', text: 'Reject — needs source fix' }, style: 'danger', action_id: 'manual_notes_reject', value: JSON.stringify({ noteId: manualUploadResult.noteId }) },
          ]
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '*Approve* — commits to GitHub, eligible for `/qori-analyze`.\n*Reject* — deletes from DB, nothing committed to git.' }] },
      ],
    });

    // Manual notes now go through human review — approval via button click
    return;

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

// ─── Transcript DM button handlers ──────────────────────────────────────────
// Each button opens a sub-modal via views.open (fresh trigger_id from the click).
// Sub-modal submit does the work + updates the DM to terminal state.

/** Open the rescrub modal from DM button click.
 * GOV-1: UI-only (opens sub-modal, no state mutation). Auth enforced at sub-modal submission. */
const handleTranscriptRescrubButton = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();
  try {
    const metadata = (body.actions[0] as any).value;
    const modal = buildRescrubModal(metadata);
    await client.views.open({ trigger_id: body.trigger_id, view: modal });
  } catch (err) {
    console.error('[PII] Failed to open rescrub modal:', err instanceof Error ? err.message : String(err));
  }
};

/** Open the approve modal from DM button click.
 * GOV-1: UI-only (opens sub-modal, no state mutation). Auth enforced at sub-modal submission. */
const handleTranscriptApproveButton = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();
  try {
    const metadata = (body.actions[0] as any).value;
    const modal = buildApproveModal(metadata);
    await client.views.open({ trigger_id: body.trigger_id, view: modal });
  } catch (err) {
    console.error('[PII] Failed to open approve modal:', err instanceof Error ? err.message : String(err));
  }
};

/** Open the reject modal from DM button click.
 * GOV-1: UI-only (opens sub-modal, no state mutation). Auth enforced at sub-modal submission. */
const handleTranscriptRejectButton = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();
  try {
    const metadata = (body.actions[0] as any).value;
    const modal = buildRejectModal(metadata);
    await client.views.open({ trigger_id: body.trigger_id, view: modal });
  } catch (err) {
    console.error('[PII] Failed to open reject modal:', err instanceof Error ? err.message : String(err));
  }
};

// ─── Transcript sub-modal submit handlers ───────────────────────────────────

/**
 * Handle transcript approval (from approve sub-modal submit).
 *
 * Validates attestation → reads quarantine → flips marker → writes to final
 * location → deletes quarantine → creates DB record → writes audit row →
 * updates DM to approved terminal state.
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
        text: 'Error: Missing transcript paths. Please try uploading again.',
      });
      return;
    }

    // ── GOV-1: Authorization check ──
    if (!studyId) {
      // Unresolved study scope → fail closed
      await ack();
      console.warn(`[AUTH] Transcript approve denied: unresolved study scope, user=${body.user.id}`);
      await client.chat.postMessage({
        channel: body.user.id,
        text: 'Access denied: cannot determine study scope for this transcript.',
      });
      return;
    }
    try {
      await assertStudyAccess(body.user.id, studyId, client);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        await ack();
        console.warn(`[AUTH] Transcript approve denied: user=${body.user.id} study=${studyId}`);
        await client.chat.postMessage({
          channel: body.user.id,
          text: 'Access denied: you are not a member of this study\'s project.',
        });
        return;
      }
      throw err;
    }

    // ── Attestation validation (PII redesign item c) ──
    const attestationChecked = (view.state.values as any)
      ?.attestation_block?.attestation_checkbox?.selected_options?.length > 0;
    if (!attestationChecked) {
      return ack({
        response_action: 'errors',
        errors: { attestation_block: 'You must confirm you have reviewed the full transcript.' },
      } as any);
    }

    // Close all modals — this is a terminal action
    // NOTE: Rescrub loop (item b) deferred to follow-up PR — requires
    // re-scrub → regenerate quarantine → reopen modal, fully automated.
    await ack({ response_action: 'clear' });

    // ── PLAT-3: App service is the ONLY business path ──
    const approveCtx = await buildSlackApplicationContext(body.user.id, body.team?.id || '');

    if (!approveCtx) {
      // FAIL CLOSED — no identity resolution means no business logic
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Unable to resolve identity. Please contact your workspace administrator.',
      });
      return;
    }

    // ── APP SERVICE PATH: delegate approval orchestration ──
    const approvalInput: TranscriptApprovalInput = {
      quarantinePath,
      finalPath,
      filename,
      studyId: studyId,
      studyName,
      participantCode,
      participantId: participantId,
      sessionDate,
      sessionTime,
      originalUploaderId: userId,
      reviewerActorId: String(approveCtx.actor.id),
    };

    const approvalResult = await approveTranscriptAppService(approveCtx, approvalInput);

    // Update the review DM to approved terminal state (buttons removed)
    if (metadata.dmChannelId && metadata.messageTs) {
      const appApprovedBlocks = buildApprovedDmBlocks(studyName, participantCode, approvalResult.finalUrl, body.user.id);
      await client.chat.update({
        channel: metadata.dmChannelId,
        ts: metadata.messageTs,
        text: `Transcript approved: ${studyName} - ${participantCode}`,
        blocks: appApprovedBlocks,
      });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling transcript review approval:", error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error saving transcript: ${message}`,
    });
  }
};

// ─── Rescrub loop — re-scrub quarantine with additional terms ─────────────────────

/**
 * Build a regex from a reviewer-typed term. Single audit point for all
 * reviewer-supplied text → regex conversions.
 *
 * Escapes metacharacters, then anchors with lookarounds (not \b) so terms
 * match at word edges without failing on non-word-char boundaries like
 * "Dr. Patel" (where \b between "." and " " is not a word boundary).
 */
function buildTermRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'gi');
}

/**
 * Handle rescrub sub-modal submit.
 *
 * Reads quarantine from GitHub, applies word-boundary-anchored find/replace,
 * regenerates quarantine, writes audit row, updates the review DM with new stats.
 * Terms are transient — used in memory, then discarded (§2.1).
 */
const handleTranscriptRescrubSubmit = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    const rescrubTermsRaw = (view.state.values as any)?.rescrub_terms_block?.rescrub_terms?.value?.trim() || '';
    if (!rescrubTermsRaw) {
      await ack({ response_action: 'clear' } as any);
      return;
    }

    const terms = rescrubTermsRaw.split(',').map((t: string) => t.trim()).filter(Boolean);
    if (terms.length === 0) {
      await ack({ response_action: 'clear' } as any);
      return;
    }

    const metadata: TranscriptReviewMetadata = JSON.parse(view.private_metadata || '{}');
    const { quarantinePath, participantCode, studyName, fileUrl, dmChannelId, messageTs, studyId: rescrubStudyId } = metadata;

    if (!quarantinePath) {
      await ack({ response_action: 'clear' } as any);
      return;
    }

    // ── GOV-1: Authorization check ──
    if (!rescrubStudyId) {
      await ack({ response_action: 'clear' } as any);
      console.warn(`[AUTH] Rescrub denied: unresolved study scope, user=${body.user.id}`);
      await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: cannot determine study scope for this transcript.' });
      return;
    }
    try {
      await assertStudyAccess(body.user.id, rescrubStudyId, client);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        await ack({ response_action: 'clear' } as any);
        console.warn(`[AUTH] Rescrub denied: user=${body.user.id} study=${rescrubStudyId}`);
        await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: you are not a member of this study\'s project.' });
        return;
      }
      throw err;
    }

    await ack({ response_action: 'clear' } as any);

    // Read current quarantine content from GitHub
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = process.env.GITHUB_OWNER!;
    const repo = process.env.GITHUB_REPO!;

    const fileResponse = await octokit.rest.repos.getContent({
      owner, repo, path: quarantinePath, ref: 'main',
    });
    const fileData = fileResponse.data as { content: string; sha: string };
    const quarantineContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const quarantineSha = fileData.sha;

    // Apply find/replace (word-boundary anchored via buildTermRegex)
    let scrubbedContent = quarantineContent;
    let totalReplacements = 0;
    const perTermCounts: number[] = [];
    for (const term of terms) {
      const regex = buildTermRegex(term);
      const matches = scrubbedContent.match(regex);
      const count = matches ? matches.length : 0;
      perTermCounts.push(count);
      if (count > 0) {
        totalReplacements += count;
        scrubbedContent = scrubbedContent.replace(regex, '[REDACTED]');
      }
    }
    // Terms go out of scope after this block — §2.1 discipline

    // Regenerate quarantine file
    await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path: quarantinePath,
      message: `Rescrub: ${terms.length} additional term(s) applied`,
      content: Buffer.from(scrubbedContent).toString('base64'),
      sha: quarantineSha,
    });

    // Disposition audit row — counts only, no term text (§2.1)
    await logDispositionAction({
      action: 'rescrub_transcript',
      record_type: 'transcript',
      target_identifier: `${participantCode}/${metadata.filename}`,
      study_name: studyName,
      participant_code: participantCode,
      actor_user_id: body.user.id,
      authorization_basis: 'PII rescrub — reviewer-applied find/replace on quarantined transcript',
      outcome: 'success',
      outcome_detail: `terms_submitted=${terms.length} total_replacements=${totalReplacements}`,
    });

    // Count PII markers in the CURRENT file for cumulative status
    const phoneCount = (scrubbedContent.match(/\[PHONE\]/g) || []).length;
    const emailCount = (scrubbedContent.match(/\[EMAIL\]/g) || []).length;
    const participantNameCount = (scrubbedContent.match(new RegExp(participantCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const redactedCount = (scrubbedContent.match(/\[REDACTED\]/g) || []).length;

    const updatedStats: ScrubStats = {
      participantName: participantNameCount,
      moderatorName: (scrubbedContent.match(/\[Moderator\]/g) || []).length,
      speakerLabels: 0,
      phoneNumbers: phoneCount,
      emailAddresses: emailCount,
      redactedTerms: redactedCount,
    };

    // Build positional match summary (aggregate numbers only, no term text)
    const matchParts: string[] = [];
    for (let i = 0; i < perTermCounts.length; i++) {
      matchParts.push(`term ${i + 1} matched ${perTermCounts[i]} time${perTermCounts[i] !== 1 ? 's' : ''}`);
    }
    const rescrubSummary = `${terms.length} term${terms.length !== 1 ? 's' : ''} submitted · ${matchParts.join(' · ')} · ${redactedCount} redaction${redactedCount !== 1 ? 's' : ''} in this file`;

    // Update the review DM with new status (buttons preserved for next action)
    if (dmChannelId && messageTs) {
      const buttonMetadata = JSON.stringify(metadata);
      const updatedBlocks = buildTranscriptReviewDmBlocks({
        stats: updatedStats,
        participantCode,
        studyName,
        fileUrl,
        nameProvided: participantNameCount > 0,
        buttonMetadata,
        rescrubSummary,
      });
      await client.chat.update({
        channel: dmChannelId,
        ts: messageTs,
        text: `PII Review: ${studyName} - ${participantCode}`,
        blocks: updatedBlocks,
      });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PII] Rescrub error:', message);
  }
};

/**
 * Handle transcript rejection (from reject sub-modal submit).
 *
 * Deletes quarantine file from working tree, writes audit row,
 * notifies uploader with reviewer's note, updates DM to rejected terminal state.
 * Git history retains the quarantine version per ADR 0026 §6.
 */
const handleTranscriptRejectSubmit = async ({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => {
  try {
    const rejectNote = (view.state.values as any)?.reject_note_block?.reject_note?.value?.trim() || '';
    if (!rejectNote) {
      return ack({
        response_action: 'errors',
        errors: { reject_note_block: 'Please describe what needs to be fixed.' },
      } as any);
    }

    const metadata: TranscriptReviewMetadata = JSON.parse(view.private_metadata || '{}');
    const { quarantinePath, participantCode, studyName, userId, dmChannelId, messageTs, filename, studyId: rejectStudyId } = metadata;

    // ── GOV-1: Authorization check ──
    if (!rejectStudyId) {
      await ack({ response_action: 'clear' } as any);
      console.warn(`[AUTH] Transcript reject denied: unresolved study scope, user=${body.user.id}`);
      await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: cannot determine study scope for this transcript.' });
      return;
    }
    try {
      await assertStudyAccess(body.user.id, rejectStudyId, client);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        await ack({ response_action: 'clear' } as any);
        console.warn(`[AUTH] Transcript reject denied: user=${body.user.id} study=${rejectStudyId}`);
        await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: you are not a member of this study\'s project.' });
        return;
      }
      throw err;
    }

    await ack({ response_action: 'clear' } as any);

    // Delete quarantine file from working tree
    // Git history retains it permanently — ADR 0026 §6, accepted residual
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = process.env.GITHUB_OWNER!;
    const repo = process.env.GITHUB_REPO!;

    try {
      const fileResponse = await octokit.rest.repos.getContent({
        owner, repo, path: quarantinePath,
      });
      const sha = (fileResponse.data as { sha: string }).sha;
      await octokit.rest.repos.deleteFile({
        owner, repo, path: quarantinePath,
        message: `Reject quarantine file after PII review rejection`,
        sha,
      });
    } catch (delErr) {
      // File may not exist (already deleted or commit failed) — continue
      console.warn('[PII] Quarantine file deletion failed (may not exist):', delErr instanceof Error ? delErr.message : String(delErr));
    }

    // Disposition audit row — note_length only, NOT note content (M2)
    await logDispositionAction({
      action: 'reject_transcript',
      record_type: 'transcript',
      target_identifier: `${participantCode}/${filename}`,
      study_name: studyName,
      participant_code: participantCode,
      actor_user_id: body.user.id,
      authorization_basis: 'PII review rejection — reviewer found issues requiring source fix',
      outcome: 'success',
      outcome_detail: `quarantine=${quarantinePath} deletion_confirmed=true note_length=${rejectNote.length}`,
    });

    // Notify the uploader with the reviewer's note (mirror manual notes :1258-1267)
    // Note text goes ONLY here — not to audit row, not to console, not to metadata
    if (userId) {
      await client.chat.postMessage({
        channel: userId,
        text: `Your transcript for ${participantCode} (${studyName}) was not approved.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Your transcript for *${participantCode}* (*${studyName}*) was not approved.`,
            },
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Reviewer's note:*\n${rejectNote}`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: 'Fix the source and re-upload via `/qori-notes`.' },
            ],
          },
        ],
      });
    }

    // Update the review DM to rejected terminal state (buttons removed)
    if (dmChannelId && messageTs) {
      const rejectedBlocks = buildRejectedDmBlocks(studyName, participantCode, body.user.id);
      await client.chat.update({
        channel: dmChannelId,
        ts: messageTs,
        text: `Transcript rejected: ${studyName} - ${participantCode}`,
        blocks: rejectedBlocks,
      });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PII] Transcript rejection error:', message);
  }
};

// ─── Manual notes approval via button click (DB-held quarantine) ─────────────────────

/**
 * Handle manual notes approval via button click in DM.
 *
 * DB-HELD QUARANTINE: Reads pending_content from DB, writes to git for FIRST time,
 * updates DB record (pii_reviewed=true, clears pending_content).
 * Git history only contains approved content — no quarantine commits.
 */
const handleManualNotesApprove = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();

  try {
    // Extract metadata from button value
    const action = body.actions[0] as { value?: string };
    if (!action.value) {
      throw new Error('Missing metadata in approval button');
    }

    interface ManualNotesApprovalMetadata {
      noteId: number;
      finalPath: string;
      filename: string;
      participantCode: string;
      studyName: string;
    }
    const metadata: ManualNotesApprovalMetadata = JSON.parse(action.value);
    const { noteId, finalPath, filename, participantCode, studyName } = metadata;

    if (!noteId || !finalPath) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Error: Missing note information. Please try submitting again.',
      });
      return;
    }

    // ── Read pending_content from DB ──
    const note = await studyNotesService.getStudyNoteById(noteId);

    // ── GOV-1: Authorization check ──
    // Derive scope from persisted note record, not button metadata.
    const noteStudyId = note.study_id;
    if (!noteStudyId) {
      console.warn(`[AUTH] Manual notes approve denied: unresolved study scope, noteId=${noteId}, user=${body.user.id}`);
      await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: cannot determine study scope for this note.' });
      return;
    }
    try {
      await assertStudyAccess(body.user.id, noteStudyId, client);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        console.warn(`[AUTH] Manual notes approve denied: user=${body.user.id} study=${noteStudyId}`);
        await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: you are not a member of this study\'s project.' });
        return;
      }
      throw err;
    }

    // ── PLAT-3: App service is the ONLY business path ──
    const manualApproveCtx = await buildSlackApplicationContext(body.user.id, body.team?.id || '');

    if (!manualApproveCtx) {
      // FAIL CLOSED — no identity resolution means no business logic
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Unable to resolve identity. Please contact your workspace administrator.',
      });
      return;
    }

    // ── APP SERVICE PATH: delegate manual notes approval ──
    const manualApprovalInput: ManualNotesApprovalInput = {
      noteId,
      finalPath,
      reviewerActorId: String(manualApproveCtx.actor.id),
    };

    const manualApprovalResult = await approveManualNotesAppService(manualApproveCtx, manualApprovalInput);

    // Notify user (Slack-specific)
    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ Notes approved and saved`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `✅ *Notes approved and committed to GitHub*\n\n*Study:* ${studyName}\n*Participant:* ${participantCode}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `<${manualApprovalResult.finalUrl}|View on GitHub>` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '✅ These notes are now eligible for `/qori-analyze`.' }] },
      ],
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling manual notes approval:", error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error saving notes: ${message}`,
    });
  }
};

// ─── Manual notes rejection via button click ─────────────────────

/**
 * Handle manual notes rejection via button click in DM.
 * Deletes the pending DB record — nothing was ever committed to git.
 */
const handleManualNotesReject = async ({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => {
  await ack();

  try {
    // Extract metadata from button value
    const action = body.actions[0] as { value?: string };
    if (!action.value) {
      throw new Error('Missing metadata in reject button');
    }

    const metadata: { noteId: number } = JSON.parse(action.value);
    const { noteId } = metadata;

    if (!noteId) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Error: Missing note information.',
      });
      return;
    }

    // ── GOV-1: Authorization check ──
    // Derive scope from persisted note record, not button metadata.
    const rejectNote = await studyNotesService.getStudyNoteById(noteId);
    const rejectNoteStudyId = rejectNote?.study_id;
    if (!rejectNoteStudyId) {
      console.warn(`[AUTH] Manual notes reject denied: unresolved study scope, noteId=${noteId}, user=${body.user.id}`);
      await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: cannot determine study scope for this note.' });
      return;
    }
    try {
      await assertStudyAccess(body.user.id, rejectNoteStudyId, client);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        console.warn(`[AUTH] Manual notes reject denied: user=${body.user.id} study=${rejectNoteStudyId}`);
        await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: you are not a member of this study\'s project.' });
        return;
      }
      throw err;
    }

    // ── Delete pending note from DB ──
    await studyNotesService.deleteStudyNote(noteId);
    console.log(`🗑️ Pending note rejected and deleted: ID=${noteId}`);

    // Notify user
    await client.chat.postMessage({
      channel: body.user.id,
      text: '🗑️ Notes rejected and discarded. Nothing was committed to GitHub.',
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error handling manual notes rejection:", error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error rejecting notes: ${message}`,
    });
  }
};

export {
  uploadNotesHandler,
  handleTabManual,
  handleTabUpload,
  handleSessionSelectionChange,
  handleSessionNotesSubmission,
  handleTranscriptRescrubButton,
  handleTranscriptApproveButton,
  handleTranscriptRejectButton,
  handleTranscriptRescrubSubmit,
  handleTranscriptReviewApprove,
  handleTranscriptRejectSubmit,
  handleManualNotesApprove,
  handleManualNotesReject,
};

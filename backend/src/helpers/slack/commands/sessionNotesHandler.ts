/**
 * sessionNotesHandler.ts — /qori-notes command and modal handlers
 *
 * Handles session notes upload (file upload or manual entry).
 * Two tabs: "manual" (structured observations) and "upload" (transcript files).
 * Manual notes go through session_notes.yaml; uploads save raw to GitHub.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { buildSessionNotesView, type PreservedInputs } from "../ui/sessionNotesModal";
import { buildTranscriptReviewModal, type TranscriptReviewModalMetadata } from "../ui/transcriptReviewModal";
import sessionObserverService from "../../../services/session_observer.service";
import sessionParticipantService from "../../../services/study_participant.service";
import { resolveStudyFromName } from "../../../services/research_study.service";
import type { VariableContext } from "../../studyVariables";
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, createOrUpdateFileOnGitHub } from "../../github";
import { processYamlTemplate, type DryRunResult } from "../../yamlProcessor";
import { studyNotesService } from "../../../services";
import { processSlackFiles } from "../../pdfProcessor";
import { postEphemeralOrDM } from "../slackHelpers";
import { scrubTranscript, type ScrubContext } from "../../transcriptScrubber";
import { STUDY_FOLDERS } from "../../../config/folderStructure";

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
  return {
    // Upload tab fields
    piiRealName: values.pii_real_name?.real_name_input?.value || undefined,
    pastedText: values.transcript_paste?.text?.value || undefined,
    transcriptSource: values.transcript_source_block?.transcript_source?.selected_option?.value || undefined,
    // Manual tab fields
    observations: values.observations?.observations_text?.value || undefined,
  };
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
      // IMPORTANT: Transcript goes to .pending-review/ first, NOT final location.
      // Human must review full transcript before it reaches the final location.
      // Auto-scrub is PARTIAL by design (name variants, incidental PII slip through).
      // Review GATES the commit to final location - it's not rubber-stamping.
      const resolved = await resolveStudyFromName(templateData.study_name);
      if (!resolved) throw new Error(`Study "${templateData.study_name}" not found`);

      // DETERMINISTIC filename: re-uploads of same session REPLACE the pending file
      const transcriptFileName = `transcript_${templateData.session_id}.md`;
      // Quarantine path - NOT analyzable, NOT the final transcript location
      const quarantinePath = `${resolved.study?.path}/.pending-review/${transcriptFileName}`;
      // Final path - where it goes AFTER human approval (matches readout scanner path)
      const finalPath = `${resolved.study?.path}/${STUDY_FOLDERS.FIELDWORK_TRANSCRIPTS}/${transcriptFileName}`;

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

    // ── MANUAL NOTES PATH — DB-held quarantine (no git until approval) ──
    // Manual notes are MORE prone to incidental free-text PII ("her husband Mike",
    // "near the Denver VA") that auto-scrub cannot catch. Human review is the
    // primary protection here, not the auto-scrub.
    //
    // DB-HELD QUARANTINE: Content stored in pending_content column, NOT git.
    // Git history only contains approved/reviewed content (no quarantine commits).
    // On approval: read from DB, write to git for FIRST time, clear pending_content.

    const resolved = await resolveStudyFromName(templateData.study_name);
    if (!resolved) throw new Error(`Study "${templateData.study_name}" not found`);
    const study = resolved.study;
    const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlTemplateName!);

    // Use dryRun to get rendered content WITHOUT writing to GitHub
    const dryResult = await processYamlTemplate(
      file.content,
      templateData,
      study!.path ?? '',
      '',
      false,
      variableContext,
      undefined,
      true, // dryRun = true
    ) as DryRunResult;

    // ── Run basic PII scrubbing (phone/email only) ──
    // Manual notes typically use PT-XXX codes, so name decomposition finds little.
    // But phone/email regex still applies. Human review is the main gate.
    const scrubCtx: ScrubContext = {
      participantRealName: '', // No real name to decompose for manual notes
      participantCode: templateData.participant_id,
      moderatorName: templateData.researcher,
    };

    const scrubResult = scrubTranscript(dryResult.content, scrubCtx);
    console.log(`[PII] Manual notes scrubbing: ${scrubResult.stats.phoneNumbers + scrubResult.stats.emailAddresses} items scrubbed (phone/email only)`);

    // ── Build scrubbed content (NO git write yet) ──
    // DB-HELD: Content stays in DB until human approval, then first git commit
    const scrubbedContent = scrubResult.content;

    // ── Compute final path (where content will go AFTER approval) ──
    const notesFileName = `notes_${templateData.session_id}.md`;
    const finalPath = dryResult.path;

    // ── Store in DB with pending_content (NOT git) ──
    // pii_reviewed=false: NOT eligible for /qori-analyze
    // pending_content holds scrubbed content until approval
    // NO git commit happens here — git history stays clean
    const studyNoteData = {
      study_id: selectedSession.study?.id,
      study_name: templateData.study_name,
      filename: notesFileName,
      file_path: finalPath,
      file_url: null, // No git URL yet — created on approval
      session_date: templateData.session_date,
      session_time: templateData.session_time,
      participant_id: selectedSession.participant?.id,
      created_by: body.user.id,
      transcript: false, // Manual notes, not transcript
      pii_reviewed: false, // NOT approved yet
      pii_reviewed_at: null,
      pii_reviewed_by: null,
      pending_content: scrubbedContent, // DB-held until approval
    };

    const pendingNote = await studyNotesService.createStudyNote(studyNoteData);
    console.log(`[PII] Manual notes saved to DB (pending_content): ID=${pendingNote.id}`);

    // ── Build review metadata for approval flow ──
    // Uses note ID to retrieve pending_content on approval
    interface ManualNotesApprovalMetadata {
      noteId: number;
      finalPath: string;
      filename: string;
      participantCode: string;
      studyName: string;
    }
    const approvalMetadata: ManualNotesApprovalMetadata = {
      noteId: pendingNote.id,
      finalPath,
      filename: notesFileName,
      participantCode: templateData.participant_id,
      studyName: templateData.study_name,
    };

    // Build scrub stats text
    const totalScrubs = scrubResult.stats.phoneNumbers + scrubResult.stats.emailAddresses;
    const statsText = totalScrubs > 0
      ? `*${totalScrubs} PII items scrubbed* (phone/email)`
      : '*No PII items auto-scrubbed.* Manual notes typically contain incidental PII that requires human review.';

    // ── Truncate content for Slack display (Block Kit limit: 3000 chars) ──
    const displayContent = scrubbedContent.length > 2800
      ? scrubbedContent.slice(0, 2800) + '\n\n... (truncated for display)'
      : scrubbedContent;

    // ── Send review message via DM with INLINE content ──
    // DB-held quarantine: content shown inline, no GitHub link (not committed yet)
    await client.chat.postMessage({
      channel: body.user.id,
      text: `🔍 PII Review Required: ${templateData.study_name} - ${templateData.participant_id}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🔍 PII Review Required', emoji: true }
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `*Study:* ${templateData.study_name} · *Participant:* ${templateData.participant_id}` }
          ]
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: statsText }
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '⚠️ *Review the notes below for incidental PII before approving:*\n' +
              '• Names mentioned in observations ("her husband Mike...")\n' +
              '• Locations ("near the Denver VA...")\n' +
              '• Dates with context ("mentioned her birthday...")'
          }
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '```\n' + displayContent + '\n```'
          }
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Approve & Commit to Git', emoji: true },
              style: 'primary',
              action_id: 'manual_notes_approve',
              value: JSON.stringify(approvalMetadata),
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '🗑️ Reject', emoji: true },
              style: 'danger',
              action_id: 'manual_notes_reject',
              value: JSON.stringify({ noteId: pendingNote.id }),
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '✅ *Approve* — commits to GitHub, eligible for analysis.\n' +
                '🗑️ *Reject* — deletes from DB, nothing committed to git.'
            }
          ]
        }
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

/**
 * Handle transcript review approval.
 *
 * Called when user clicks "Approve" on the transcript review modal.
 * MOVES the transcript from quarantine (.pending-review/) to final location (03-fieldwork/transcripts/).
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
    console.log(`✅ File moved to final location: ${finalPath}`);

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
    // Detect transcript vs manual notes by filename pattern
    const isTranscript = filename.startsWith('transcript_');
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
      transcript: isTranscript,
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
    const pendingContent: string | null = note.pending_content;

    if (!pendingContent) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Error: Note content not found or already approved.',
      });
      return;
    }

    // ── Build final content with REVIEWED-CLEARED marker ──
    const piiMarkerCleared = '<!-- PII-STATUS: REVIEWED-CLEARED -->';
    const reviewedContent = `${piiMarkerCleared}\n${pendingContent}`;

    // ── FIRST git commit — clean history, no quarantine commits ──
    const finalResult = await createOrUpdateFileOnGitHub(finalPath, reviewedContent);
    console.log(`✅ Manual notes committed to git (first commit): ${finalPath}`);

    // ── Update DB record: pii_reviewed=true, clear pending_content ──
    await studyNotesService.updateStudyNote(noteId, {
      file_url: finalResult.url,
      pii_reviewed: true,
      pii_reviewed_at: new Date(),
      pii_reviewed_by: body.user.id,
      pending_content: null, // Clear pending content
    });
    console.log(`✅ Study note updated: pii_reviewed=true, pending_content cleared: ID=${noteId}`);

    // Notify user
    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ Notes approved and saved`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Notes approved and committed to GitHub*\n\n*Study:* ${studyName}\n*Participant:* ${participantCode}`,
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
              text: '✅ These notes are now eligible for `/qori-analyze`.',
            },
          ],
        },
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
  handleTranscriptReviewApprove,
  handleManualNotesApprove,
  handleManualNotesReject,
};

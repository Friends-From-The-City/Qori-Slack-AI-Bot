/**
 * events.ts — Slack handler registration manifest
 *
 * This file ONLY registers handlers. No inline business logic.
 * Handler bodies live under commands/.
 *
 * Error handling: TemplateContractError is caught globally via
 * slackApp.error() middleware and sent as a DM to the researcher.
 * Handlers throw TemplateContractError without catching it.
 *
 * Errors are captured to Sentry (with PII scrubbed) and posted to
 * #qori-alerts channel for ops visibility.
 */

import express from 'express';
import { App, LogLevel, SocketModeReceiver } from '@slack/bolt';
import * as Sentry from '@sentry/node';
import { scrubPII } from '../../config/sentry';
import type { View } from '@slack/types';
// ── Extracted handlers (TypeScript) ─────────────────────────────

// study_select action (used by /qori-plan modal). /qori command removed in GOV-1B.
import { handleStudySelect } from './commands/qoriMainHandler';

// Project creation (Phase 2C)
import { projectStartCommand, handleProjectCreateSubmission } from './commands/projectStartHandler';
import { handleViewClosed, handleUserSelectOptions } from './commands/study/studyLifecycleHandler';

// Admin Center (ADR 0025)
import { adminCenterCommand } from './commands/admin/adminCenterHandler';
import {
  handleDsarOpen,
  handleDsarStudySelect,
  handleDsarParticipantSelect,
  handleDsarActionSelect,
  handleDsarDeleteConfirm,
  handleDeleteStudyOpen,
  handleDeleteStudySelect,
  handleDeleteStudyConfirm,
  handleStakeholderManage,
  handleStakeholderSubmit,
} from './commands/admin/adminActionsHandler';

// Research brief
import { openResearchBriefModal } from './commands/modal-openers/briefModalOpener';
import { handleBriefSubmission } from './commands/briefHandler';

// Shared helpers
import { postEphemeralOrDM } from './slackHelpers';

// Research plan
import { openResearchPlanModal } from './commands/modal-openers/planModalOpener';
import { handlePlanSubmission } from './commands/planHandler';

// Brief → plan/study transitions
import { openPlanFromBrief } from './commands/modal-openers/briefToStudyHandler';

// Approval flows (plan approval removed — brief is the only gate)
import { handleApproveBrief as approveBrief, handleConfirmApproveBrief as confirmApproveBrief, handleRequestChangesBrief as requestChangesBrief, handleRequestChangesBriefModal as requestChangesBriefSubmission } from './commands/approval/approvalFlowHandler';
import { handleMarkChangesCompleteAction, handleMarkChangesCompleteModal, handleApproveChanges } from './markChangesCompleteHandler';
import { handleBriefResubmit } from './resubmitBriefHandler';

// Discussion guide
import { openDiscussionGuideModal, handleDiscussionGuideSubmission } from './commands/discussion-guide/discussionGuideHandler';

// Discovery
import { discoverHandler, openDiscoverTypeModal, handleDiscoverSubmission } from './commands/discoverHandler';

// Fieldwork
import { fieldworkHandler, handleFieldworkStudyPickerSubmit, handleFieldworkAddParticipant, handleFieldworkUpdateStatus, handleFieldworkObserve, handleFieldworkOutreach, handleFieldworkUploadNotes } from './commands/fieldworkHandler';
import { handleUpdateParticipantSubmission, handleLoadParticipantsButton, handleAddParticipantStudySelect } from './commands/participantHandler';
import { handleParticipantOutreachSubmit, handleInitialRecruitmentSubmit, handleReschedulingRequestSubmit, handleSessionConfirmationSubmit, handleThankYouSubmit, handleFollowUpSubmit, handleSessionReminderSubmit, handleAddParticipantSubmit, handleObserverModalButton } from './commands/participantOutreachHandler';
import { handleAddObserverSubmission, handleSelfJoinObserver, handleSelfJoinSubmission } from './commands/addObserverHandler';

// Session notes
import { handleTabManual, handleTabUpload, handleSessionSelectionChange, handleSessionNotesSubmission, handleTranscriptRescrubButton, handleTranscriptApproveButton, handleTranscriptRejectButton, handleTranscriptRescrubSubmit, handleTranscriptReviewApprove, handleTranscriptRejectSubmit, handleManualNotesApprove, handleManualNotesReject } from './commands/sessionNotesHandler';

// Analysis
import { analyzeNotesHandler, handleAnalyzeNotesSubmission, handleStudySelectionChange as handleAnalyzeNotesStudyChange, handleSessionSelectionChange as handleAnalyzeNotesSessionChange } from './commands/analyzeNotesHandler';
import { researchSynthesisHandler, handleResearchSynthesisSubmission, handleStudySelectionChange, handleAnalysisMethodChange } from './commands/researchSynthesisHandler';

// Readouts & tickets
import { openReadoutModal, handleReadoutModalInteraction, handleReadoutModalSubmission } from './commands/readoutHandler';
import { ticketHandler, handleStep1Submit, handleStep2Submit } from './commands/ticketHandler';

// Q&A
import { askHandler, handleAskSubmit, handleShowMore } from './commands/askHandler';
// /ask-study removed — RAG disabled, hardcoded beta-test/ path deleted
import { runTemplateCommand, handleTypeSelect, handleShareoutSubmission } from './commands/qa/runTemplateHandler';

// Learn/onboarding
import { learnCommand, learnNext, learnPrev, learnRestartTour, handleLearnCeremonySubmit, handleLearnCeremonyNoop } from './commands/learn/learnHandler';

// Repo/sync
import { repoCommand, repoSelected, folderSelected, folderOptions, subfolderOptions, handleRepoSubmission } from './commands/repo/repoConfigHandler';
import { syncCommand, syncFolderSelected, syncFolderOptions, syncSubfolderSelected, syncSubfolderOptions, syncResearchOptions, handleSyncSubmission } from './commands/repo/syncHandler';

// Messaging
import { copyEmailFormatted } from './commands/messaging/messagingHandler';

// Events
import { handleMessageEvent } from './commands/messageEventHandler';

// UI modals and services (used by inline /qori-plan and /qori-brief command handlers)
import { studySetupModalPlanStudy } from './ui/studySetupModal';
import { buildBriefEntryModal } from './ui/researchBriefEntryModal';
import { getStudiesByUser } from '../../services/research_study.service';
import { getProjectByChannelId } from '../../services/project.service';

// ── Express router for Slack routes ─────────────────────────────

const slackExpressRouter = express.Router();

// ── Initialize Bolt app ─────────────────────────────────────────

// Log Socket Mode connection events to help diagnose connection issues
console.log('Initializing Bolt app with Socket Mode...');
console.log(`Bot token present: ${!!process.env.SLACK_BOT_TOKEN}`);
console.log(`App token present: ${!!process.env.SLACK_APP_TOKEN}`);

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  extendedErrorHandler: true,
  // SLACK_LOG_LEVEL=DEBUG to see every Socket Mode envelope
  logLevel: (process.env.SLACK_LOG_LEVEL?.toUpperCase() === 'DEBUG' ? LogLevel.DEBUG : LogLevel.INFO),
});

// ── Graceful shutdown (incident 2026-07-28) ────────────────────
// Explicitly disconnect Socket Mode on SIGTERM/SIGINT so the websocket
// closes cleanly and Slack removes this connection immediately, instead
// of leaving a zombie that steals command envelopes via round-robin.
function gracefulShutdown(signal: string): void {
  console.log(`Received ${signal} — disconnecting Socket Mode...`);
  // receiver is private on App — cast through unknown to access it
  const receiver = (slackApp as unknown as { receiver: SocketModeReceiver }).receiver;
  // SocketModeClient.disconnect() sends a close frame and resolves
  receiver.client.disconnect().then(() => {
    console.log('Socket Mode disconnected cleanly.');
    process.exit(0);
  }).catch((err: Error) => {
    console.error('Socket Mode disconnect error:', err.message);
    process.exit(1);
  });
  // Force exit after 5s if disconnect hangs
  setTimeout(() => {
    console.error('Graceful shutdown timed out after 5s, forcing exit.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── Alerts channel configuration ─────────────────────────────────

const ALERTS_CHANNEL_ID = process.env.QORI_ALERTS_CHANNEL_ID;

// ── num_connections tripwire (incident 2026-07-28) ─────────────
// Socket Mode hello frame reports how many active websocket connections
// exist for this app token. If >1, another process shares the token and
// Slack round-robins commands — most will never be acked.
// receiver is private in Bolt's types but accessible at runtime — cast through unknown (not as-any)
const socketModeReceiver = (slackApp as unknown as { receiver: SocketModeReceiver }).receiver;
socketModeReceiver.client.on('hello', (event: { num_connections: number; debug_info?: { host?: string }; connection_info?: { app_id?: string } }) => {
  if (event.num_connections > 1) {
    console.warn(
      `[CRITICAL] Socket Mode hello: num_connections=${event.num_connections} — ` +
      `expected 1. Another process is sharing this app token. ` +
      `Commands will be lost. (host=${event.debug_info?.host || 'unknown'}, app=${event.connection_info?.app_id || 'unknown'})`
    );
    // Also post to alerts channel if configured
    if (ALERTS_CHANNEL_ID) {
      slackApp.client.chat.postMessage({
        channel: ALERTS_CHANNEL_ID,
        text: `:rotating_light: *Socket Mode: ${event.num_connections} connections detected* — expected 1. Another process is sharing the prod app token. Commands will be round-robined and most will fail. Check Railway dev environment and local .env files for the prod app token (A08U0FLM4AG).`,
      }).catch((err: Error) => {
        console.error('Failed to post num_connections alert:', err.message);
      });
    }
  } else {
    console.log(`Socket Mode hello: num_connections=${event.num_connections} (healthy)`);
  }
});

/**
 * Post an error alert to the #qori-alerts channel.
 * PII is scrubbed from BOTH the message AND context before posting.
 */
async function postErrorAlert(
  errorType: string,
  errorMessage: string,
  context: Record<string, unknown>,
): Promise<void> {
  if (!ALERTS_CHANNEL_ID) {
    console.log('QORI_ALERTS_CHANNEL_ID not set, skipping alert channel post');
    return;
  }

  try {
    // Scrub PII from BOTH message and context before posting to Slack
    const scrubbedMessage = scrubPII(errorMessage) as string;
    const scrubbedContext = scrubPII(context) as Record<string, unknown>;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Error: ${errorType}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error:* \`${scrubbedMessage.substring(0, 200)}${scrubbedMessage.length > 200 ? '...' : ''}\``,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Time:* ${new Date().toISOString()} | *User:* ${scrubbedContext.userId || 'unknown'} | *Command:* ${scrubbedContext.command || 'unknown'}`,
          },
        ],
      },
    ];

    await slackApp.client.chat.postMessage({
      channel: ALERTS_CHANNEL_ID,
      text: `Error ${errorType}: ${scrubbedMessage.substring(0, 100)}`,
      blocks,
    });
  } catch (alertErr) {
    // Don't let alert failures break error handling
    console.error('Failed to post to alerts channel:', alertErr instanceof Error ? alertErr.message : String(alertErr));
  }
}

// ── Global error middleware ─────────────────────────────────────

// Type annotation uses 'any' for body/logger (Bolt's types are complex unions)
// Pattern enforcement allows ': any' annotations, just not 'as any' casts
slackApp.error(async ({ error, body, logger }: { error: Error; body: any; logger: any }) => {
  // Bolt wraps errors — unwrap to find the original thrown error
  interface TemplateContractErrorShape extends Error {
    userMessage?: string;
    templateId?: string;
    variableKey?: string;
  }
  interface BoltError extends Error {
    original?: TemplateContractErrorShape;
  }
  const boltError = error as BoltError;
  const original: TemplateContractErrorShape = boltError.original || error;

  const userId = body?.user?.id || body?.user_id;
  const command = body?.command || body?.view?.callback_id || 'unknown';

  // ── Capture to Sentry (PII is scrubbed in beforeSend) ──────────
  Sentry.withScope((scope) => {
    scope.setTag('slack_error', 'true');
    scope.setTag('error_type', original.name || 'Error');
    scope.setTag('command', command);
    if (userId) {
      scope.setUser({ id: userId });
    }
    // Add scrubbed context as extra data
    scope.setExtra('body', scrubPII(body));
    Sentry.captureException(original);
  });

  // ── Handle TemplateContractError (cascade contract violations) ──
  if (original.name === 'TemplateContractError') {
    logger.warn(`Cascade contract error: ${original.message}`);

    // Post to alerts channel
    await postErrorAlert('Cascade Contract Error', original.message, {
      userId,
      command,
      templateId: original.templateId,
      variableKey: original.variableKey,
    });

    // Send user-friendly DM
    const userMessage = (original as BoltError['original'] & { userMessage?: string }).userMessage;
    if (userId && userMessage) {
      try {
        const client = slackApp.client;
        const im = await client.conversations.open({ users: userId });
        if (im.channel?.id) {
          await client.chat.postMessage({
            channel: im.channel.id,
            text: `*Could not complete that action*\n\n${userMessage}`,
          });
        }
      } catch (dmErr) {
        const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
        logger.error('Failed to send TemplateContractError DM:', dmMessage);
      }
    }
    return;
  }

  // ── Handle PiiRedactionError (H9 fail-closed) ──────────────────────
  // SECURITY: Alert is distinguishable ("PII Redaction Failure") so ops
  // can spot repeated failures fast. User message stays generic — don't
  // leak that it's a PII issue to the researcher.
  if (original.name === 'PiiRedactionError') {
    logger.error(`PII redaction failure: ${original.message}`);

    // Post DISTINGUISHABLE alert — not buried in "Unhandled Error"
    await postErrorAlert('PII Redaction Failure', original.message, {
      userId,
      command,
      // Note: error.detectedCount is available but we don't need it here —
      // the message already contains the count ("N found")
    });

    // User gets generic message — don't reveal it's a PII/redaction issue
    if (userId) {
      try {
        const client = slackApp.client;
        const im = await client.conversations.open({ users: userId });
        if (im.channel?.id) {
          await client.chat.postMessage({
            channel: im.channel.id,
            text: '*Something went wrong on our end*\n\nYour request did not complete. The team has been notified. Please try again, and if it keeps happening, let us know.',
          });
        }
      } catch (dmErr) {
        const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
        logger.error('Failed to send PiiRedactionError DM:', dmMessage);
      }
    }
    return;
  }

  // ── Generic error — notify the user so they aren't left waiting ──
  logger.error('Unhandled error:', error);

  // Post to alerts channel
  await postErrorAlert('Unhandled Error', original.message || String(original), {
    userId,
    command,
    stack: original.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
  });

  // Send user DM
  if (userId) {
    try {
      const client = slackApp.client;
      const im = await client.conversations.open({ users: userId });
      if (im.channel?.id) {
        await client.chat.postMessage({
          channel: im.channel.id,
          text: '*Something went wrong on our end*\n\nYour request did not complete. The team has been notified. Please try again, and if it keeps happening, let us know.',
        });
      }
    } catch (dmErr) {
      const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
      logger.error('Failed to send generic error DM:', dmMessage);
    }
  }
});

// ── URL verification (Express middleware) ────────────────────────

slackExpressRouter.post('/events', async (req: any, res: any) => {
  const { type, challenge } = req.body;
  if (type === 'url_verification') {
    console.log('Slack URL verification successful!');
    return res.status(200).send({ challenge });
  }
});

slackExpressRouter.post('/commands', (req: any, res: any) => {
  const { text } = req.body;
  if (text === 'hello') {
    return res.status(200).send('Hello from Qori!');
  }
});

// ═════════════════════════════════════════════════════════════════
// REGISTRATIONS — grouped by feature area
//
// All handlers use Bolt's native middleware types
// (SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, etc.)
// so no `as any` casts are needed at registration boundaries.
// ═════════════════════════════════════════════════════════════════

// ─── Slash commands (entry points) ──────────────────────────────

// /qori command removed in GOV-1B — /qori-learn supersedes. Remove from Slack app manifest separately.
slackApp.command('/qori-start', projectStartCommand);
slackApp.command('/qori-brief', async ({ ack, client, command }) => {
  await ack();

  try {
    // Phase 2D: Check if channel is bound to a project
    const project = await getProjectByChannelId(command.channel_id);
    if (!project) {
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        `This channel isn't linked to a project yet.\n\n*Option 1:* Run \`/qori-start\` to create a new project with a dedicated channel, then run \`/qori-brief\` there.\n*Option 2:* Run \`/qori-brief\` in an existing project channel.`,
      );
      return;
    }

    let leadResearcher: string | null = null;
    try {
      const userInfo = await client.users.info({ user: command.user_id });
      leadResearcher = userInfo.user?.real_name || userInfo.user?.profile?.display_name || null;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.warn('Could not fetch Slack profile for brief modal:', errMessage);
    }

    try {
      const modal = await buildBriefEntryModal({
        leadResearcher,
        channelId: command.channel_id,
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        source: 'qori_brief_command',
        client,
      });
      // @ts-expect-error — modal blocks are Record<string,unknown>[] from JSON.parse; structurally valid at runtime
      await client.views.open({ trigger_id: command.trigger_id, view: modal });
    } catch (err: unknown) {
      const errData = (err as Record<string, unknown>)?.data;
      const messages = (errData as Record<string, unknown>)?.response_metadata as Record<string, unknown>;
      console.error('❌ Error opening brief modal:');
      console.error('Error data:', JSON.stringify(errData, null, 2));
      if (messages?.messages) {
        console.error('Validation errors:', JSON.stringify(messages.messages, null, 2));
      }
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        `❌ Error opening research brief modal. Check server logs for details.`,
      );
    }
  } catch (outerErr) {
    // Catch-all for any unexpected error
    const errMsg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    console.error('❌ Unexpected error in /qori-brief:', outerErr);
    await postEphemeralOrDM(
      client,
      command.channel_id,
      command.user_id,
      `❌ Unexpected error: ${errMsg}`,
    );
  }
});
slackApp.command('/qori-plan', async ({ ack, client, command }) => {
  await ack();
  const studies = await getStudiesByUser(command.user_id);
  const modal = studySetupModalPlanStudy(studies, command.channel_id);
  await client.views.open({ trigger_id: command.trigger_id, view: modal as View });
});
slackApp.command('/qori-discover', discoverHandler);
slackApp.command('/qori-fieldwork', fieldworkHandler);
slackApp.command('/qori-analyze', analyzeNotesHandler);
slackApp.command('/qori-synthesis', researchSynthesisHandler);
slackApp.command('/qori-report', openReadoutModal);
slackApp.command('/qori-tickets', ticketHandler);
slackApp.command('/qori-ask', askHandler);
slackApp.command('/qori-learn', learnCommand);
slackApp.command('/qori-repo', repoCommand);
slackApp.command('/qori-sync', syncCommand);
slackApp.command('/qori-admin', adminCenterCommand);
slackApp.command('/run-template', runTemplateCommand);

// ─── Study creation & lifecycle ─────────────────────────────────

slackApp.options('user_select', handleUserSelectOptions);
// Bolt type gap: 'view_closed' isn't a recognized SlackEvent subtype, so
// EventFromType<'view_closed'> resolves to BaseSlackEvent which lacks .view.
// The handler uses an inline type with { event: { view: { callback_id } } }.
slackApp.event('view_closed', handleViewClosed as any);

// ─── Project creation ────────────────────────────────────────────

slackApp.view('project_create_modal', handleProjectCreateSubmission);

// ─── Admin Center (ADR 0025) ─────────────────────────────────────

// Button actions
slackApp.action('admin-dsar-open', handleDsarOpen);
slackApp.action('admin-delete-study-open', handleDeleteStudyOpen);

// DSAR flow views
slackApp.view('admin-dsar-study-select', handleDsarStudySelect);
slackApp.view('admin-dsar-participant-select', handleDsarParticipantSelect);
slackApp.view('admin-dsar-action-select', handleDsarActionSelect);
slackApp.view('admin-dsar-delete-confirm', handleDsarDeleteConfirm);

// Delete study flow views
slackApp.view('admin-delete-study-select', handleDeleteStudySelect);
slackApp.view('admin-delete-study-confirm', handleDeleteStudyConfirm);

// Stakeholder management
slackApp.action('admin-stakeholder-manage', handleStakeholderManage);
slackApp.view('admin-stakeholder-submit', handleStakeholderSubmit);

// ─── Research brief ─────────────────────────────────────────────

slackApp.action('create_research_brief', openResearchBriefModal);
slackApp.view('research_brief_modal', handleBriefSubmission);

// ─── Research plan ──────────────────────────────────────────────

slackApp.action('study_select', handleStudySelect);
slackApp.action('create_research_plan', openResearchPlanModal);
slackApp.view('research_plan_modal', handlePlanSubmission);

// ─── Brief → plan transition ─────────────────────────────────────

slackApp.action('create_research_plan_from_brief', openPlanFromBrief);

// ─── Approval flows ────────────────────────────────────────────
// Plan approval removed — brief (scope) is the only approval gate.

slackApp.action('approve_brief', approveBrief);
slackApp.view('confirm_approve_brief', confirmApproveBrief);
slackApp.action('request_changes_brief', requestChangesBrief);
slackApp.view('request_changes_brief_modal', requestChangesBriefSubmission);
slackApp.action('brief_resubmit', handleBriefResubmit);
slackApp.action('mark_changes_complete', handleMarkChangesCompleteAction);
slackApp.view('mark_changes_complete_modal', handleMarkChangesCompleteModal);
slackApp.action('approve_changes', handleApproveChanges);

// ─── Discussion guide ───────────────────────────────────────────

slackApp.action('create_discussion_guide', openDiscussionGuideModal);
slackApp.view('discussion_guide_modal', handleDiscussionGuideSubmission);

// ─── Discovery ──────────────────────────────────────────────────

slackApp.action('discover_desk_research', openDiscoverTypeModal);
slackApp.action('discover_stakeholder_synthesis', openDiscoverTypeModal);
slackApp.action('discover_survey_synthesis', openDiscoverTypeModal);
slackApp.view('discover_desk_research_modal', handleDiscoverSubmission);
slackApp.view('discover_stakeholder_modal', handleDiscoverSubmission);
slackApp.view('discover_survey_modal', handleDiscoverSubmission);

// Survey schema review (Survey Slice 1)
import { handleSurveySchemaReviewAction, handleSurveySchemaConfirmation } from './commands/surveySubmissionHandler';
slackApp.action('survey_review_schema', handleSurveySchemaReviewAction);
slackApp.view('survey_schema_review_modal', handleSurveySchemaConfirmation);

// Survey privacy review + qualitative synthesis (Slice 2A)
import { handlePrivacyReviewAction, handlePrivacyReviewSubmission } from './commands/surveyPrivacyHandler';
import { handleGenerateCodebook, handleOpenGroupingReview, handleCodebookReviewSubmission } from './commands/codebookHandler';
import { handleRunSynthesisAction } from './commands/surveySynthesisAction';
slackApp.action('survey_privacy_review', handlePrivacyReviewAction);
slackApp.view('survey_privacy_review_modal', handlePrivacyReviewSubmission);
slackApp.action('survey_run_synthesis', handleRunSynthesisAction);
slackApp.action('survey_generate_codebook', handleGenerateCodebook);
slackApp.action('survey_open_grouping_review', handleOpenGroupingReview);
slackApp.view('codebook_review_modal', handleCodebookReviewSubmission);

// Survey match review (Slice 2B)
import { handleGenerateAssignments, handleOpenMatchReview, handleMatchReviewSubmission } from './commands/matchReviewHandler';
slackApp.action('survey_generate_assignments', handleGenerateAssignments);
slackApp.action('survey_open_match_review', handleOpenMatchReview);
slackApp.view('match_review_modal', handleMatchReviewSubmission);

// ─── Fieldwork & participants ───────────────────────────────────

slackApp.view('fieldwork_study_picker', handleFieldworkStudyPickerSubmit);
slackApp.action('fieldwork_add_participant', handleFieldworkAddParticipant);
slackApp.action('fieldwork_update_status', handleFieldworkUpdateStatus);
slackApp.action('fieldwork_observe', handleFieldworkObserve);
slackApp.action('fieldwork_outreach', handleFieldworkOutreach);
slackApp.action('fieldwork_upload_notes', handleFieldworkUploadNotes);
slackApp.action('load_participants_button', handleLoadParticipantsButton);
slackApp.action('add_participant_study_select', handleAddParticipantStudySelect);
slackApp.view('add-participant-modal', handleAddParticipantSubmit);
slackApp.view('update-participant-status', handleUpdateParticipantSubmission);

// ─── Participant outreach ───────────────────────────────────────

slackApp.view('participant-outreach-modal', handleParticipantOutreachSubmit);
slackApp.view('outreach_initial_recruitment_modal', handleInitialRecruitmentSubmit);
slackApp.view('outreach_rescheduling_modal', handleReschedulingRequestSubmit);
slackApp.view('outreach_session_confirmation_modal', handleSessionConfirmationSubmit);
slackApp.view('outreach_thank_you_modal', handleThankYouSubmit);
slackApp.view('outreach_follow_up_modal', handleFollowUpSubmit);
slackApp.view('outreach_session_reminder_modal', handleSessionReminderSubmit);
slackApp.action('copy_email_formatted', copyEmailFormatted);

// ─── Observers ──────────────────────────────────────────────────

slackApp.view('add_observer_modal', handleAddObserverSubmission);
slackApp.view('self_join_session_picker_modal', handleSelfJoinSubmission);
slackApp.action('open_observer_modal', handleObserverModalButton);
slackApp.action('self_join_observer', handleSelfJoinObserver);

// ─── Session notes ──────────────────────────────────────────────

slackApp.action('tab_manual', handleTabManual);
slackApp.action('tab_upload', handleTabUpload);
slackApp.action('session_select_change', handleSessionSelectionChange);
slackApp.view('session_notes_submit', handleSessionNotesSubmission);
// Transcript review — DM-based surface with three sub-modals
slackApp.action('transcript_rescrub', handleTranscriptRescrubButton);
slackApp.action('transcript_approve', handleTranscriptApproveButton);
slackApp.action('transcript_reject', handleTranscriptRejectButton);
slackApp.view('transcript_rescrub_submit', handleTranscriptRescrubSubmit);
slackApp.view('transcript_approve_submit', handleTranscriptReviewApprove);
slackApp.view('transcript_reject_submit', handleTranscriptRejectSubmit);
slackApp.action('manual_notes_approve', handleManualNotesApprove);
slackApp.action('manual_notes_reject', handleManualNotesReject);

// ─── Analysis ───────────────────────────────────────────────────

slackApp.view('analyze_notes_submit', handleAnalyzeNotesSubmission);
slackApp.action('study_select_test', handleAnalyzeNotesStudyChange);
slackApp.action('analyze_notes_session_select', handleAnalyzeNotesSessionChange);

// ─── Research synthesis (ADR 0018: cascade-aware) ────────────────

slackApp.view('research-synthesis-modal', handleResearchSynthesisSubmission);
slackApp.action('study_select_synthesize', handleStudySelectionChange);
slackApp.action('analysis_method', handleAnalysisMethodChange);

// ─── Readouts & tickets ─────────────────────────────────────────

slackApp.view('readout_modal_submit', handleReadoutModalSubmission);
slackApp.action(/^(select_research_readout|select_targeted_readouts|study_selection_change|audience_checkboxes)$/, handleReadoutModalInteraction);
slackApp.view('tickets_step1_submit', handleStep1Submit);
slackApp.view('tickets_step2_submit', handleStep2Submit);

// ─── Q&A ────────────────────────────────────────────────────────

// ask-study-modal removed — /ask-study unregistered
slackApp.view('ask_qori_submit', handleAskSubmit);
slackApp.action('ask_show_more', handleShowMore);
slackApp.action('type_select', handleTypeSelect);
slackApp.view('research-shareout-submit', handleShareoutSubmission);

// ─── Learn / onboarding ─────────────────────────────────────────

slackApp.action('learn_next', learnNext);
slackApp.action('learn_prev', learnPrev);
slackApp.action('learn_restart_tour', learnRestartTour);
slackApp.view('learn_ceremony_submit', handleLearnCeremonySubmit);
slackApp.view('learn_ceremony_noop', handleLearnCeremonyNoop);

// ─── Repo config & sync ─────────────────────────────────────────

slackApp.action('repo_selected', repoSelected);
slackApp.action('folder_selected', folderSelected);
slackApp.options('folder_selected', folderOptions);
slackApp.options('subfolder_selected', subfolderOptions);
slackApp.view('repo-folder-subfolder-modal', handleRepoSubmission);
slackApp.action('sync_folder_selected', syncFolderSelected);
slackApp.options('sync_folder_selected', syncFolderOptions);
slackApp.action('sync_subfolder_selected', syncSubfolderSelected);
slackApp.options('sync_subfolder_selected', syncSubfolderOptions);
slackApp.options('sync_research_selected', syncResearchOptions);
slackApp.view('sync-folder-modal', handleSyncSubmission);

// ─── Events ─────────────────────────────────────────────────────

slackApp.event('message', handleMessageEvent);

// ─── Export ─────────────────────────────────────────────────────

export { slackApp, slackExpressRouter };

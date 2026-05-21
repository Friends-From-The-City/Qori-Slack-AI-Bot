/**
 * events.ts — Slack handler registration manifest
 *
 * This file ONLY registers handlers. No inline business logic.
 * Handler bodies live under commands/.
 *
 * Error handling: TemplateContractError is caught globally via
 * slackApp.error() middleware and sent as a DM to the researcher.
 * Handlers throw TemplateContractError without catching it.
 */

import express from 'express';
import { App } from '@slack/bolt';
import type { View } from '@slack/types';
// ── Extracted handlers (TypeScript) ─────────────────────────────

// Main /qori command
import { qoriMainCommand, handleStudySelect } from './commands/qoriMainHandler';

// Study creation
import { startResearchHandler, handleAddTeamMember, handleCreateStudySubmission } from './commands/createStudyHandler';
import { handleViewClosed, handlePlanStudyNoop, handleStudySetupSkip, handleUserSelectOptions } from './commands/study/studyLifecycleHandler';
import { deleteStudyCommand, handleDeleteStudySubmission } from './commands/study/deleteStudyHandler';

// Research brief
import { openResearchBriefModal } from './commands/modal-openers/briefModalOpener';
import { handleBriefSubmission } from './commands/briefHandler';

// Research plan
import { openResearchPlanModal } from './commands/modal-openers/planModalOpener';
import { handlePlanSubmission } from './commands/planHandler';

// Brief → plan/study transitions
import { openPlanFromBrief, openStudyFromBrief } from './commands/modal-openers/briefToStudyHandler';

// Approval flows
import { handleApprovePlan as approvePlan, handleConfirmApprovePlan as confirmApprovePlan, handleRequestChangesPlan as requestChangesPlan, handleRequestChangesPlanModal as requestChangesPlanSubmission, handleApproveBrief as approveBrief, handleConfirmApproveBrief as confirmApproveBrief, handleRequestChangesBrief as requestChangesBrief, handleRequestChangesBriefModal as requestChangesBriefSubmission } from './commands/approval/approvalFlowHandler';
import { handleMarkChangesCompleteAction, handleMarkChangesCompleteModal, handleApproveChanges } from './markChangesCompleteHandler';

// Discussion guide
import { openDiscussionGuideModal, handleDiscussionGuideSubmission } from './commands/discussion-guide/discussionGuideHandler';

// Discovery
import { openStakeholderGuideModal, handleStakeholderGuideSubmission } from './commands/discovery/stakeholderHandler';
import { discoverHandler, handleDiscoverSubmission } from './commands/discoverHandler';

// Fieldwork
import { fieldworkHandler, handleFieldworkStudyPickerSubmit, handleFieldworkAddParticipant, handleFieldworkUpdateStatus, handleFieldworkObserve, handleFieldworkOutreach, handleFieldworkUploadNotes } from './commands/fieldworkHandler';
import { handleUpdateParticipantSubmission, handleLoadParticipantsButton } from './commands/participantHandler';
import { handleParticipantOutreachSubmit, handleInitialRecruitmentSubmit, handleReschedulingRequestSubmit, handleSessionConfirmationSubmit, handleThankYouSubmit, handleFollowUpSubmit, handleSessionReminderSubmit, handleAddParticipantSubmit, handleObserverModalButton } from './commands/participantOutreachHandler';
import { handleAddObserverSubmission, handleSelfJoinObserver, handleSelfJoinSubmission } from './commands/addObserverHandler';

// Session notes
import { handleTabManual, handleTabUpload, handleSessionSelectionChange, handleSessionNotesSubmission } from './commands/sessionNotesHandler';

// Analysis
import { analyzeNotesHandler, handleAnalyzeNotesSubmission, handleStudySelectionChange as handleAnalyzeNotesStudyChange, handleSessionSelectionChange as handleAnalyzeNotesSessionChange } from './commands/analyzeNotesHandler';
import { researchSynthesisHandler, handleResearchSynthesisSubmission, handleStudySelectionChange, handleFileCheckboxChange, handleLoadSynthesisFiles } from './commands/researchSynthesisHandler';

// Readouts & tickets
import { openReadoutModal, handleReadoutModalInteraction, handleReadoutModalSubmission } from './commands/readoutHandler';
import { ticketHandler, handleStep1Submit, handleStep2Submit } from './commands/ticketHandler';

// Q&A
import { askHandler, handleAskSubmit, handleShowMore } from './commands/askHandler';
import { askStudyCommand, handleAskStudySubmission } from './commands/qa/askStudyHandler';
import { runTemplateCommand, handleTypeSelect, handleShareoutSubmission } from './commands/qa/runTemplateHandler';

// Learn/onboarding
import { learnCommand, learnNext, learnPrev, learnRestartTour, handleLearnCeremonySubmit, handleLearnCeremonyNoop } from './commands/learn/learnHandler';

// Repo/sync
import { repoCommand, repoSelected, folderSelected, folderOptions, subfolderOptions, handleRepoSubmission } from './commands/repo/repoConfigHandler';
import { syncCommand, syncFolderSelected, syncFolderOptions, syncSubfolderSelected, syncSubfolderOptions, syncResearchOptions, handleSyncSubmission } from './commands/repo/syncHandler';

// Messaging
import { generateOtherMessageType, copyEmailFormatted } from './commands/messaging/messagingHandler';

// Events
import { handleMessageEvent } from './commands/messageEventHandler';

// UI modals and services (used by inline /qori-plan and /qori-brief command handlers)
import { studySetupModalPlanStudy } from './ui/studySetupModal';
import { buildBriefEntryModal } from './ui/researchBriefEntryModal';
import { getStudiesByUser } from '../../services/research_study.service';

// ── Express router for Slack routes ─────────────────────────────

const slackExpressRouter = express.Router();

// ── Initialize Bolt app ─────────────────────────────────────────

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  extendedErrorHandler: true,
});

// ── Global error middleware ─────────────────────────────────────

slackApp.error(async ({ error, body, logger }: { error: Error; body: any; logger: any }) => {
  // Bolt wraps errors — unwrap to find the original thrown error
  interface BoltError extends Error {
    original?: Error & { userMessage?: string };
  }
  const boltError = error as BoltError;
  const original = boltError.original || error;

  if (original.name === 'TemplateContractError') {
    logger.warn(`⚠️ Cascade contract error: ${original.message}`);
    const userId = body?.user?.id || body?.user_id;
    const userMessage = (original as BoltError['original'] & { userMessage?: string }).userMessage;
    if (userId && userMessage) {
      try {
        const client = slackApp.client;
        const im = await client.conversations.open({ users: userId });
        if (im.channel?.id) {
          await client.chat.postMessage({
            channel: im.channel.id,
            text: `⚠️ *Could not complete that action*\n\n${userMessage}`,
          });
        }
      } catch (dmErr) {
        const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
        logger.error('Failed to send TemplateContractError DM:', dmMessage);
      }
    }
    return;
  }

  // Generic error — notify the user so they aren't left waiting
  logger.error('Unhandled error:', error);
  const userId = body?.user?.id || body?.user_id;
  if (userId) {
    try {
      const client = slackApp.client;
      const im = await client.conversations.open({ users: userId });
      if (im.channel?.id) {
        await client.chat.postMessage({
          channel: im.channel.id,
          text: '❌ *Something went wrong on our end*\n\nYour request didn\u2019t complete. The team has been notified. Please try again, and if it keeps happening, let us know.',
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
    console.log('🔐 Slack URL verification successful!');
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

slackApp.command('/qori', qoriMainCommand);
slackApp.command('/qori-start', startResearchHandler);
slackApp.command('/qori-brief', async ({ ack, client, command }) => {
  await ack();
  let leadResearcher = '';
  try {
    const userInfo = await client.users.info({ user: command.user_id });
    leadResearcher = userInfo.user?.real_name || userInfo.user?.profile?.display_name || '';
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.warn('Could not fetch Slack profile for brief modal:', errMessage);
  }
  const modal = await buildBriefEntryModal(leadResearcher, command.channel_id);
  // @ts-expect-error — modal blocks are Record<string,unknown>[] from JSON.parse; structurally valid at runtime
  await client.views.open({ trigger_id: command.trigger_id, view: modal });
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
slackApp.command('/qori-delete', deleteStudyCommand);
slackApp.command('/ask-study', askStudyCommand);
slackApp.command('/run-template', runTemplateCommand);

// ─── Study creation & lifecycle ─────────────────────────────────

slackApp.action('add_user', handleAddTeamMember);
slackApp.options('user_select', handleUserSelectOptions);
slackApp.view('create_study_modal', handleCreateStudySubmission);
slackApp.view('plan_study_modal', handlePlanStudyNoop);
slackApp.view('study-setup-modal-start-research', handleStudySetupSkip);
slackApp.view('delete-study-modal', handleDeleteStudySubmission);
// Bolt type gap: 'view_closed' isn't a recognized SlackEvent subtype, so
// EventFromType<'view_closed'> resolves to BaseSlackEvent which lacks .view.
// The handler uses an inline type with { event: { view: { callback_id } } }.
slackApp.event('view_closed', handleViewClosed as any);

// ─── Research brief ─────────────────────────────────────────────

slackApp.action('create_research_brief', openResearchBriefModal);
slackApp.view('research_brief_modal', handleBriefSubmission);

// ─── Research plan ──────────────────────────────────────────────

slackApp.action('study_select', handleStudySelect);
slackApp.action('create_research_plan', openResearchPlanModal);
slackApp.view('research_plan_modal', handlePlanSubmission);

// ─── Brief → plan/study transitions ────────────────────────────

slackApp.action('create_research_plan_from_brief', openPlanFromBrief);
slackApp.action('create_study_from_brief', openStudyFromBrief);

// ─── Approval flows ────────────────────────────────────────────

slackApp.action('approve_plan', approvePlan);
slackApp.view('confirm_approve_plan', confirmApprovePlan);
slackApp.action('request_changes_plan', requestChangesPlan);
slackApp.view('request_changes_plan_modal', requestChangesPlanSubmission);
slackApp.action('approve_brief', approveBrief);
slackApp.view('confirm_approve_brief', confirmApproveBrief);
slackApp.action('request_changes_brief', requestChangesBrief);
slackApp.view('request_changes_brief_modal', requestChangesBriefSubmission);
slackApp.action('mark_changes_complete', handleMarkChangesCompleteAction);
slackApp.view('mark_changes_complete_modal', handleMarkChangesCompleteModal);
slackApp.action('approve_changes', handleApproveChanges);

// ─── Discussion guide ───────────────────────────────────────────

slackApp.action('create_discussion_guide', openDiscussionGuideModal);
slackApp.view('discussion_guide_modal', handleDiscussionGuideSubmission);

// ─── Discovery ──────────────────────────────────────────────────

slackApp.action('create_stakeholder_guide', openStakeholderGuideModal);
slackApp.view('stakeholder_interview_guide_modal', handleStakeholderGuideSubmission);
slackApp.view('discover_modal', handleDiscoverSubmission);

// ─── Fieldwork & participants ───────────────────────────────────

slackApp.view('fieldwork_study_picker', handleFieldworkStudyPickerSubmit);
slackApp.action('fieldwork_add_participant', handleFieldworkAddParticipant);
slackApp.action('fieldwork_update_status', handleFieldworkUpdateStatus);
slackApp.action('fieldwork_observe', handleFieldworkObserve);
slackApp.action('fieldwork_outreach', handleFieldworkOutreach);
slackApp.action('fieldwork_upload_notes', handleFieldworkUploadNotes);
slackApp.action('load_participants_button', handleLoadParticipantsButton);
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
slackApp.action('generate_other_message_type', generateOtherMessageType);
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

// ─── Analysis ───────────────────────────────────────────────────

slackApp.view('analyze_notes_submit', handleAnalyzeNotesSubmission);
slackApp.action('study_select_test', handleAnalyzeNotesStudyChange);
slackApp.action('analyze_notes_session_select', handleAnalyzeNotesSessionChange);

// ─── Research synthesis ─────────────────────────────────────────

slackApp.view('research-synthesis-modal', handleResearchSynthesisSubmission);
slackApp.action('study_select_synthesize', handleStudySelectionChange);
slackApp.action('load_synthesis_files', handleLoadSynthesisFiles);
slackApp.action(/^file_checkbox_/, handleFileCheckboxChange);

// ─── Readouts & tickets ─────────────────────────────────────────

slackApp.view('readout_modal_submit', handleReadoutModalSubmission);
slackApp.action(/^(select_research_readout|select_targeted_readouts|study_selection_change|audience_checkboxes)$/, handleReadoutModalInteraction);
slackApp.view('tickets_step1_submit', handleStep1Submit);
slackApp.view('tickets_step2_submit', handleStep2Submit);

// ─── Q&A ────────────────────────────────────────────────────────

slackApp.view('ask-study-modal', handleAskStudySubmission);
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

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
import { openDeskResearchModal, handleDeskResearchSubmission } from './commands/discovery/deskResearchHandler';
import { openStakeholderGuideModal, openStakeholderInterviewGuideModal, handleStakeholderGuideSubmission, openUploadStakeholderNotesModal, handleStakeholderNotesSubmission } from './commands/discovery/stakeholderHandler';
import { openUploadSurveyDataModal, handleSurveyDataSubmission } from './commands/discovery/surveyHandler';
import { discoverHandler, handleDiscoverSubmission } from './commands/discoverHandler';

// Fieldwork
import { fieldworkHandler, handleFieldworkStudyPickerSubmit, handleFieldworkAddParticipant, handleFieldworkUpdateStatus, handleFieldworkObserve, handleFieldworkOutreach, handleFieldworkUploadNotes } from './commands/fieldworkHandler';
import { handleAddParticipantSubmit, handleUpdateParticipantSubmission, handleLoadParticipantsButton } from './commands/participantHandler';
import { handleParticipantOutreachSubmit, handleInitialRecruitmentSubmit, handleReschedulingRequestSubmit, handleSessionConfirmationSubmit, handleThankYouSubmit, handleFollowUpSubmit, handleSessionReminderSubmit, handleObserverModalButton } from './commands/participantOutreachHandler';
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
// Handler functions use simplified context types (SlashCommandContext,
// ActionContext, ViewContext, etc.) that don't exactly match Bolt's
// Middleware<> generics. The handlers are functionally correct — they
// destructure the same properties Bolt provides — but TypeScript
// can't prove the structural compatibility through Bolt's complex
// overloads. We cast handlers `as any` at the registration boundary
// rather than forcing every handler to import and satisfy Bolt's
// internal generic types.
// ═════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Slash commands (entry points) ──────────────────────────────

slackApp.command('/qori', qoriMainCommand as any);
slackApp.command('/qori-start', startResearchHandler as any);
slackApp.command('/qori-brief', async ({ ack, body, client, command }: any) => {
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
  await client.views.open({ trigger_id: command.trigger_id, view: modal });
});
slackApp.command('/qori-plan', async ({ ack, body, client, command }: any) => {
  await ack();
  const studies = await getStudiesByUser(command.user_id);
  const modal = studySetupModalPlanStudy(studies, command.channel_id);
  await client.views.open({ trigger_id: command.trigger_id, view: modal });
});
slackApp.command('/qori-discover', discoverHandler as any);
slackApp.command('/qori-fieldwork', fieldworkHandler as any);
slackApp.command('/qori-analyze', analyzeNotesHandler as any);
slackApp.command('/qori-synthesis', researchSynthesisHandler as any);
slackApp.command('/qori-report', openReadoutModal as any);
slackApp.command('/qori-tickets', ticketHandler as any);
slackApp.command('/qori-ask', askHandler as any);
slackApp.command('/qori-learn', learnCommand as any);
slackApp.command('/qori-repo', repoCommand as any);
slackApp.command('/qori-sync', syncCommand as any);
slackApp.command('/qori-delete', deleteStudyCommand as any);
slackApp.command('/ask-study', askStudyCommand as any);
slackApp.command('/run-template', runTemplateCommand as any);

// ─── Study creation & lifecycle ─────────────────────────────────

slackApp.action('add_user', handleAddTeamMember as any);
slackApp.options('user_select', handleUserSelectOptions as any);
slackApp.view('create_study_modal', handleCreateStudySubmission as any);
slackApp.view('plan_study_modal', handlePlanStudyNoop as any);
slackApp.view('study-setup-modal-start-research', handleStudySetupSkip as any);
slackApp.view('delete-study-modal', handleDeleteStudySubmission as any);
slackApp.event('view_closed', handleViewClosed as any);

// ─── Research brief ─────────────────────────────────────────────

slackApp.action('create_research_brief', openResearchBriefModal as any);
slackApp.view('research_brief_modal', handleBriefSubmission as any);

// ─── Research plan ──────────────────────────────────────────────

slackApp.action('study_select', handleStudySelect as any);
slackApp.action('create_research_plan', openResearchPlanModal as any);
slackApp.view('research_plan_modal', handlePlanSubmission as any);

// ─── Brief → plan/study transitions ────────────────────────────

slackApp.action('create_research_plan_from_brief', openPlanFromBrief as any);
slackApp.action('create_study_from_brief', openStudyFromBrief as any);

// ─── Approval flows ────────────────────────────────────────────

slackApp.action('approve_plan', approvePlan as any);
slackApp.view('confirm_approve_plan', confirmApprovePlan as any);
slackApp.action('request_changes_plan', requestChangesPlan as any);
slackApp.view('request_changes_plan_modal', requestChangesPlanSubmission as any);
slackApp.action('approve_brief', approveBrief as any);
slackApp.view('confirm_approve_brief', confirmApproveBrief as any);
slackApp.action('request_changes_brief', requestChangesBrief as any);
slackApp.view('request_changes_brief_modal', requestChangesBriefSubmission as any);
slackApp.action('mark_changes_complete', handleMarkChangesCompleteAction as any);
slackApp.view('mark_changes_complete_modal', handleMarkChangesCompleteModal as any);
slackApp.action('approve_changes', handleApproveChanges as any);

// ─── Discussion guide ───────────────────────────────────────────

slackApp.action('create_discussion_guide', openDiscussionGuideModal as any);
slackApp.view('discussion_guide_modal', handleDiscussionGuideSubmission as any);

// ─── Discovery uploads ──────────────────────────────────────────

slackApp.action('upload_desk_research', openDeskResearchModal as any);
slackApp.view('upload_desk_research_modal', handleDeskResearchSubmission as any);
slackApp.action('create_stakeholder_guide', openStakeholderGuideModal as any);
slackApp.action('create_stakeholder_interview_guide', openStakeholderInterviewGuideModal as any);
slackApp.view('stakeholder_interview_guide_modal', handleStakeholderGuideSubmission as any);
slackApp.action('upload_stakeholder_notes', openUploadStakeholderNotesModal as any);
slackApp.view('upload_stakeholder_notes_modal', handleStakeholderNotesSubmission as any);
slackApp.action('upload_survey_data', openUploadSurveyDataModal as any);
slackApp.view('upload_survey_data_modal', handleSurveyDataSubmission as any);
slackApp.view('discover_modal', handleDiscoverSubmission as any);

// ─── Fieldwork & participants ───────────────────────────────────

slackApp.view('fieldwork_study_picker', handleFieldworkStudyPickerSubmit as any);
slackApp.action('fieldwork_add_participant', handleFieldworkAddParticipant as any);
slackApp.action('fieldwork_update_status', handleFieldworkUpdateStatus as any);
slackApp.action('fieldwork_observe', handleFieldworkObserve as any);
slackApp.action('fieldwork_outreach', handleFieldworkOutreach as any);
slackApp.action('fieldwork_upload_notes', handleFieldworkUploadNotes as any);
slackApp.action('load_participants_button', handleLoadParticipantsButton as any);
slackApp.view('add-participant-modal', handleAddParticipantSubmit as any);
slackApp.view('update-participant-status', handleUpdateParticipantSubmission as any);

// ─── Participant outreach ───────────────────────────────────────

slackApp.view('participant-outreach-modal', handleParticipantOutreachSubmit as any);
slackApp.view('outreach_initial_recruitment_modal', handleInitialRecruitmentSubmit as any);
slackApp.view('outreach_rescheduling_modal', handleReschedulingRequestSubmit as any);
slackApp.view('outreach_session_confirmation_modal', handleSessionConfirmationSubmit as any);
slackApp.view('outreach_thank_you_modal', handleThankYouSubmit as any);
slackApp.view('outreach_follow_up_modal', handleFollowUpSubmit as any);
slackApp.view('outreach_session_reminder_modal', handleSessionReminderSubmit as any);
slackApp.action('generate_other_message_type', generateOtherMessageType as any);
slackApp.action('copy_email_formatted', copyEmailFormatted as any);

// ─── Observers ──────────────────────────────────────────────────

slackApp.view('add_observer_modal', handleAddObserverSubmission as any);
slackApp.view('self_join_session_picker_modal', handleSelfJoinSubmission as any);
slackApp.action('open_observer_modal', handleObserverModalButton as any);
slackApp.action('self_join_observer', handleSelfJoinObserver as any);

// ─── Session notes ──────────────────────────────────────────────

slackApp.action('tab_manual', handleTabManual as any);
slackApp.action('tab_upload', handleTabUpload as any);
slackApp.action('session_select_change', handleSessionSelectionChange as any);
slackApp.view('session_notes_submit', handleSessionNotesSubmission as any);

// ─── Analysis ───────────────────────────────────────────────────

slackApp.view('analyze_notes_submit', handleAnalyzeNotesSubmission as any);
slackApp.action('study_select_test', handleAnalyzeNotesStudyChange as any);
slackApp.action('analyze_notes_session_select', handleAnalyzeNotesSessionChange as any);

// ─── Research synthesis ─────────────────────────────────────────

slackApp.view('research-synthesis-modal', handleResearchSynthesisSubmission as any);
slackApp.action('study_select_synthesize', handleStudySelectionChange as any);
slackApp.action('load_synthesis_files', handleLoadSynthesisFiles as any);
slackApp.action(/^file_checkbox_/, handleFileCheckboxChange as any);

// ─── Readouts & tickets ─────────────────────────────────────────

slackApp.view('readout_modal_submit', handleReadoutModalSubmission as any);
slackApp.action(/^(select_research_readout|select_targeted_readouts|study_selection_change|audience_checkboxes)$/, handleReadoutModalInteraction as any);
slackApp.view('tickets_step1_submit', handleStep1Submit as any);
slackApp.view('tickets_step2_submit', handleStep2Submit as any);

// ─── Q&A ────────────────────────────────────────────────────────

slackApp.view('ask-study-modal', handleAskStudySubmission as any);
slackApp.view('ask_qori_submit', handleAskSubmit as any);
slackApp.action('ask_show_more', handleShowMore as any);
slackApp.action('type_select', handleTypeSelect as any);
slackApp.view('research-shareout-submit', handleShareoutSubmission as any);

// ─── Learn / onboarding ─────────────────────────────────────────

slackApp.action('learn_next', learnNext as any);
slackApp.action('learn_prev', learnPrev as any);
slackApp.action('learn_restart_tour', learnRestartTour as any);
slackApp.view('learn_ceremony_submit', handleLearnCeremonySubmit as any);
slackApp.view('learn_ceremony_noop', handleLearnCeremonyNoop as any);

// ─── Repo config & sync ─────────────────────────────────────────

slackApp.action('repo_selected', repoSelected as any);
slackApp.action('folder_selected', folderSelected as any);
slackApp.options('folder_selected', folderOptions as any);
slackApp.options('subfolder_selected', subfolderOptions as any);
slackApp.view('repo-folder-subfolder-modal', handleRepoSubmission as any);
slackApp.action('sync_folder_selected', syncFolderSelected as any);
slackApp.options('sync_folder_selected', syncFolderOptions as any);
slackApp.action('sync_subfolder_selected', syncSubfolderSelected as any);
slackApp.options('sync_subfolder_selected', syncSubfolderOptions as any);
slackApp.options('sync_research_selected', syncResearchOptions as any);
slackApp.view('sync-folder-modal', handleSyncSubmission as any);

// ─── Events ─────────────────────────────────────────────────────

slackApp.event('message', handleMessageEvent as any);

/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Export ─────────────────────────────────────────────────────

export { slackApp, slackExpressRouter };

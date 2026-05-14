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

const express = require('express');
const { App } = require('@slack/bolt');
import { TemplateContractError } from '../../types/handlers';

// ── Extracted handlers (TypeScript) ─────────────────────────────

// Main /qori command
const { qoriMainCommand, handleStudySelect } = require('./commands/qoriMainHandler');

// Study creation
const { startResearchHandler, handleAddTeamMember, handleCreateStudySubmission } = require('./commands/createStudyHandler');
const { handleViewClosed, handlePlanStudyNoop, handleStudySetupSkip, handleUserSelectOptions } = require('./commands/study/studyLifecycleHandler');
const { deleteStudyCommand, handleDeleteStudySubmission } = require('./commands/study/deleteStudyHandler');

// Research brief
const { openResearchBriefModal } = require('./commands/modal-openers/briefModalOpener');
const { handleBriefSubmission } = require('./commands/briefHandler');

// Research plan
const { openResearchPlanModal } = require('./commands/modal-openers/planModalOpener');
const { handlePlanSubmission } = require('./commands/planHandler');

// Brief → plan/study transitions
const { openPlanFromBrief, openStudyFromBrief } = require('./commands/modal-openers/briefToStudyHandler');

// Approval flows
const { approvePlan, confirmApprovePlan, requestChangesPlan, requestChangesPlanSubmission, approveBrief, confirmApproveBrief, requestChangesBrief, requestChangesBriefSubmission } = require('./commands/approval/approvalFlowHandler');
const { handleMarkChangesCompleteAction, handleMarkChangesCompleteModal, handleApproveChanges } = require('./markChangesCompleteHandler');

// Discussion guide
const { openDiscussionGuideModal, handleDiscussionGuideSubmission } = require('./commands/discussion-guide/discussionGuideHandler');

// Discovery
const { openDeskResearchModal, handleDeskResearchSubmission } = require('./commands/discovery/deskResearchHandler');
const { openStakeholderGuideModal, openStakeholderInterviewGuideModal, handleStakeholderGuideSubmission, openUploadStakeholderNotesModal, handleStakeholderNotesSubmission } = require('./commands/discovery/stakeholderHandler');
const { openUploadSurveyDataModal, handleSurveyDataSubmission } = require('./commands/discovery/surveyHandler');
const { discoverHandler, handleDiscoverSubmission } = require('./commands/discoverHandler');

// Fieldwork
const { fieldworkHandler, handleFieldworkStudyPickerSubmit, handleFieldworkAddParticipant, handleFieldworkUpdateStatus, handleFieldworkObserve, handleFieldworkOutreach, handleFieldworkUploadNotes } = require('./commands/fieldworkHandler');
const { handleAddParticipantSubmit, handleUpdateParticipantSubmission, handleLoadParticipantsButton } = require('./commands/participantHandler');
const { handleParticipantOutreachSubmit, handleInitialRecruitmentSubmit, handleReschedulingRequestSubmit, handleSessionConfirmationSubmit, handleThankYouSubmit, handleFollowUpSubmit, handleSessionReminderSubmit, handleObserverModalButton } = require('./commands/participantOutreachHandler');
const { handleAddObserverSubmission, handleSelfJoinObserver, handleSelfJoinSubmission } = require('./commands/addObserverHandler');

// Session notes
const { handleTabManual, handleTabUpload, handleSessionSelectionChange, handleSessionNotesSubmission } = require('./commands/sessionNotesHandler');

// Analysis
const { analyzeNotesHandler, handleAnalyzeNotesSubmission, handleStudySelectionChange: handleAnalyzeNotesStudyChange, handleSessionSelectionChange: handleAnalyzeNotesSessionChange } = require('./commands/analyzeNotesHandler');
const { researchSynthesisHandler, handleResearchSynthesisSubmission, handleStudySelectionChange, handleFileCheckboxChange, handleLoadSynthesisFiles } = require('./commands/researchSynthesisHandler');

// Readouts & tickets
const { openReadoutModal, handleReadoutModalInteraction, handleReadoutModalSubmission } = require('./commands/readoutHandler');
const { ticketHandler, handleStep1Submit, handleStep2Submit } = require('./commands/ticketHandler');

// Q&A
const { askHandler, handleAskSubmit, handleShowMore } = require('./commands/askHandler');
const { askStudyCommand, handleAskStudySubmission } = require('./commands/qa/askStudyHandler');
const { runTemplateCommand, handleTypeSelect, handleShareoutSubmission } = require('./commands/qa/runTemplateHandler');

// Learn/onboarding
const { learnCommand, learnNext, learnPrev, learnRestartTour, handleLearnCeremonySubmit, handleLearnCeremonyNoop } = require('./commands/learn/learnHandler');

// Repo/sync
const { repoCommand, repoSelected, folderSelected, folderOptions, subfolderOptions, handleRepoSubmission } = require('./commands/repo/repoConfigHandler');
const { syncCommand, syncFolderSelected, syncFolderOptions, syncSubfolderSelected, syncSubfolderOptions, syncResearchOptions, handleSyncSubmission } = require('./commands/repo/syncHandler');

// Messaging
const { generateOtherMessageType, copyEmailFormatted } = require('./commands/messaging/messagingHandler');

// Events
const { handleMessageEvent } = require('./commands/messageEventHandler');

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
  if (error instanceof TemplateContractError) {
    logger.warn(`⚠️ Cascade contract error: ${error.message}`);
    const userId = body?.user?.id || body?.user_id;
    if (userId && error.userMessage) {
      try {
        const client = slackApp.client;
        const im = await client.conversations.open({ users: userId });
        if (im.channel?.id) {
          await client.chat.postMessage({
            channel: im.channel.id,
            text: `⚠️ *Could not complete that action*\n\n${error.userMessage}`,
          });
        }
      } catch (dmErr: any) {
        logger.error('Failed to send TemplateContractError DM:', dmErr.message);
      }
    }
    return;
  }
  logger.error('Unhandled error:', error);
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
// ═════════════════════════════════════════════════════════════════

// ─── Slash commands (entry points) ──────────────────────────────

slackApp.command('/qori', qoriMainCommand);
slackApp.command('/qori-start', startResearchHandler);
slackApp.command('/qori-brief', async ({ ack, body, client, command }: any) => {
  await ack();
  const { buildBriefEntryModal } = require('./ui/researchBriefEntryModal');
  const { getStudiesByUser } = require('../../services/research_study.service');
  const studies = await getStudiesByUser(command.user_id);
  const modal = buildBriefEntryModal(studies, command.channel_id);
  await client.views.open({ trigger_id: command.trigger_id, view: modal });
});
slackApp.command('/qori-plan', async ({ ack, body, client, command }: any) => {
  await ack();
  const { studySetupModalPlanStudy } = require('./ui/studySetupModal');
  const { getStudiesByUser } = require('../../services/research_study.service');
  const studies = await getStudiesByUser(command.user_id);
  const modal = studySetupModalPlanStudy(studies, command.channel_id);
  await client.views.open({ trigger_id: command.trigger_id, view: modal });
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
slackApp.event('view_closed', handleViewClosed);

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

// ─── Discovery uploads ──────────────────────────────────────────

slackApp.action('upload_desk_research', openDeskResearchModal);
slackApp.view('upload_desk_research_modal', handleDeskResearchSubmission);
slackApp.action('create_stakeholder_guide', openStakeholderGuideModal);
slackApp.action('create_stakeholder_interview_guide', openStakeholderInterviewGuideModal);
slackApp.view('stakeholder_interview_guide_modal', handleStakeholderGuideSubmission);
slackApp.action('upload_stakeholder_notes', openUploadStakeholderNotesModal);
slackApp.view('upload_stakeholder_notes_modal', handleStakeholderNotesSubmission);
slackApp.action('upload_survey_data', openUploadSurveyDataModal);
slackApp.view('upload_survey_data_modal', handleSurveyDataSubmission);
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

module.exports = { slackApp, slackExpressRouter };

// slack.js

const express = require("express");
const { App } = require("@slack/bolt"); // Slack Bolt SDK
const { punchService } = require("../../services");
const { getTeamInfo, getAllMembers } = require("../utils");
const { getConfigRepo, YAML_TEMPLATE_PATH, readFolderContents, listAllTopLevelFolders, listOrgRepos, fetchFileFromRepo, readFolders, deleteStudyFolderFromGitHub } = require("../github");
const { addChannelConfig } = require("../../services/channel-config.service");
const { getResearchStudyWithRoles, getStudiesByUser, deleteResearchStudy } = require("../../services/research_study.service");
const { studySetupModal, studySetupModalPlanStudy } = require("./ui/studySetupModal");
const { researchPlanGeneratorModal } = require("./ui/researchPlanGeneratorModal");
const { researchBriefModal } = require("./ui/researchBriefModal");
const { buildBriefEntryModal } = require("./ui/researchBriefEntryModal");
const { uploadDeskResearchModal } = require("./ui/uploadDeskResearchModal");
const { researchShareoutModal } = require("./ui/researchShareoutModal");
const { processYamlTemplate } = require("../yamlProcessor");
const { addStudyStatus } = require("../../services/study-status.service");
const { requestStudyChangesModal } = require("./ui/requestStudyChangesModal");
const { discussionGuideModal } = require("./ui/discussionGuideModal");
const { stakeholderInterviewGuideModal } = require("./ui/stakeholderInterviewGuideModal");
const { buildCascadeReadiness, buildCascadeBlocks } = require("./ui/cascadeReadinessBlocks");
const { readStudyVariables } = require("../../helpers/studyVariables");
const { uploadStakeholderNotesModal } = require("./ui/uploadStakeholderNotesModal");
const { uploadSurveyDataModal } = require("./ui/uploadSurveyDataModal");
const { handleMarkChangesCompleteAction, handleMarkChangesCompleteModal, handleApproveChanges } = require("./markChangesCompleteHandler");
const { handleApprove, handleApproveSubmission, handleRequestChanges, handleRequestChangesSubmission } = require("./requestChangesHandler");
const { sendStudyResultMessage, generateStudyResultBlocks } = require("./ui/studyResultBlocks");
const { QORI_LEARN_TOPICS, buildWelcomeMessage, buildTopicPickerMessage, buildConfirmationMessage } = require("./ui/qoriLearnModal");
const { participantOutreachHandler, handleParticipantOutreachSubmit, handleInitialRecruitmentSubmit, handleReschedulingRequestSubmit, handleSessionConfirmationSubmit, handleThankYouSubmit, handleFollowUpSubmit, handleSessionReminderSubmit, handleAddParticipantSubmit, handleObserverModalButton } = require("./commands/participantOutreachHandler");
const { participantHandler, updateParticipantHandler, handleParticipantStudySelectionChange, handleLoadParticipantsButton, handleUpdateParticipantSubmission } = require("./commands/participantHandler");
const { observeSessionHandler, handleObserveSessionSubmission, handleObserverApproval, handleObserverDenial } = require("./commands/observeSessionHandler");
const { copyEmailModal } = require("./ui/outreach/copyEmailModal");
const { sessionConfirmationModal } = require("./ui/outreach/sessionConfirmationModal");
const { sessionReminderModal } = require("./ui/outreach/sessionReminderModal");
const { reschedulingRequestModal } = require("./ui/outreach/reschedulingRequestModal");
const { followupModal } = require("./ui/outreach/followupModal");
const { thankyouModal } = require("./ui/outreach/thankyouModal");
const { uploadNotesHandler, handleTabManual, handleTabUpload, handleSessionSelectionChange, handleSessionNotesSubmission } = require("./commands/sessionNotesHandler");
const { analyzeNotesHandler, handleAnalyzeNotesSubmission, handleStudySelectionChange: handleAnalyzeNotesStudyChange, handleSessionSelectionChange: handleAnalyzeNotesSessionChange } = require("./commands/analyzeNotesHandler");
const { researchSynthesisHandler, handleResearchSynthesisSubmission, handleStudySelectionChange, handleFileCheckboxChange, handleLoadSynthesisFiles } = require("./commands/researchSynthesisHandler");
const { openReadoutModal, handleReadoutModalInteraction, handleReadoutModalSubmission } = require("./commands/readoutHandler");
const { processSlackFiles } = require("../pdfProcessor");
const research_planService = require("../../services/research_plan.service");
const { requestResearchHandler, handleRequestResearchSubmission, handleCreateBriefFromRequest, handleCreateStudyFromRequest } = require("./commands/requestResearchHandler");
const { startResearchHandler, handleAddTeamMember, handleCreateStudySubmission } = require("./commands/createStudyHandler");
const { parseDocuments, validateDocuments, createDocumentSummary } = require('../documentParser');
const { createStudyModal } = require("./ui/createStudyModal");
const { discoverHandler, handleDiscoverSubmission } = require("./commands/discoverHandler");
const { handleBriefSubmission } = require("./commands/briefHandler");
// Create an Express router for Slack routes
const slackExpressRouter = express.Router();

// Initialize the Slack App (use your Slack App's OAuth token and signing secret)
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN, // Replace with your Slack Bot Token
  // signingSecret: process.env.SLACK_SIGNING_SECRET, // Replace with your Slack Signing Secret
  appToken: process.env.SLACK_APP_TOKEN, // Optional: Use if you need to use Socket Mode
  socketMode: true,
});

// Middleware for Slack event handling
slackExpressRouter.post("/events", async (req, res) => {
  const { type, challenge } = req.body;

  // Step 1: Respond to Slack's URL verification challenge
  if (type === "url_verification") {
    console.log("🔐 Slack URL verification successful!");

    // const team = await getTeamInfo();
    // await workspaceService.addNewWorkspace({
    //   platform: "slack",
    //   platform_workspace_id: team.id,
    //   name: team.name,
    //   description: team.description,
    //   url: team.url,
    //   domain: team.domain,
    //   icon: team.icon?.image_230,
    // });

    // const members = await getAllMembers();
    // for (let member of members) {
    //   await userService.addNewUser({
    //     platform: "slack",
    //     platform_user_id: member.id,
    //     platform_workspace_id: team.id,
    //     first_name: member.profile.first_name,
    //     last_name: member.profile?.last_name,
    //     email: member.profile.email,
    //     phone: member.profile?.phone,
    //     avatar: member.profile?.image_512,
    //     is_admin: member.is_admin || member.is_owner || member.is_primary_owner,
    //   });
    // }

    return res.status(200).send({ challenge });
  }
});

slackExpressRouter.post('/commands', (req, res) => {
  const { text, user_name } = req.body;
  console.log("🚀 ~ slackExpressRouter.post ~ text:", text)

  if (text === 'hello') {
    return res.send(`Hello, ${user_name}! 👋`);
  }

  return res.send('Sorry, I didn’t understand that.');
});


// Command for user help and guidance - Show all available commands
slackApp.command('/qori', async ({ ack, command, client }) => {
  await ack();
  const channelId = command.channel_id;
  const userId = command.user_id;

  const commandBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📚 Qori Commands Reference'
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori`* → Show all commands'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-request`* → Stakeholder submits research request'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-brief`* → Create research brief (starts a new study)'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-plan`* → Create plan, guide, or upload files for an existing study'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-participants`* → Add or update participants'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-outreach`* → Generate participant outreach messages'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-observe`* → Request to observe a session'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-notes`* → Observer documents session notes'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-analyze`* → Analyze session data'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-synthesis`* → Cross-session synthesis'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-report`* → Generate stakeholder report'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-learn`* → Interactive tutorial'
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '💡 Need more details? Use `/qori-learn` for an interactive tutorial.'
        }
      ]
    }
  ];

  await client.chat.postMessage({
    channel: channelId,
    text: '📚 Qori Commands Reference',
    blocks: commandBlocks
  });
});

// ============================================
// QORI LEARN - INTERACTIVE TUTORIAL
// ============================================

// 1️⃣ Slash command: /qori-learn
slackApp.command('/qori-learn', async ({ ack, command, respond }) => {
  await ack();
  
  // Respond with ephemeral welcome message
  const welcomeMessage = buildWelcomeMessage();
  await respond(welcomeMessage);
});

// 2️⃣ Action handlers for button interactions
slackApp.action('learn_start_tutorial', async ({ ack, body, respond }) => {
  await ack();
  
  const topicPickerMessage = buildTopicPickerMessage();
  await respond(topicPickerMessage);
});

slackApp.action('learn_back_to_welcome', async ({ ack, body, respond }) => {
  await ack();
  
  const welcomeMessage = buildWelcomeMessage();
  await respond(welcomeMessage);
});

slackApp.action('learn_back_to_topics', async ({ ack, body, respond }) => {
  await ack();
  
  const topicPickerMessage = buildTopicPickerMessage();
  await respond(topicPickerMessage);
});

slackApp.action('learn_dismiss', async ({ ack, body, respond }) => {
  await ack();
  
  await respond({
    delete_original: true
  });
});

// Topic selection handlers
slackApp.action(/^topic_(request|plan|participants|outreach|observe|notes|analyze|synthesis|report)$/, async ({ ack, body, action, respond }) => {
  await ack();
  
  // Extract topic key from action_id (e.g., "topic_plan" -> "plan")
  const topicKey = action.action_id.replace('topic_', '');
  const topic = QORI_LEARN_TOPICS[topicKey];
  
  if (!topic) {
    console.error(`Unknown topic: ${topicKey}`);
    return;
  }
  
  const confirmationMessage = buildConfirmationMessage(topic);
  await respond(confirmationMessage);
});

// Acknowledge URL button clicks (these open automatically, but we still need to ack)
slackApp.action('learn_view_all', async ({ ack }) => {
  await ack();
});

slackApp.action('learn_open_tutorial', async ({ ack }) => {
  await ack();
});

// 1️⃣ Slash command: open modal with just a repo picker
slackApp.command('/qori-repo', async ({ ack, command, client }) => {
  await ack();

  // stash channel for later
  const channelId = command.channel_id;

  // fetch your org's repos however you like
  const repos = await listOrgRepos();
  const repoOptions = repos.map(r => ({
    text: { type: 'plain_text', text: r.name },
    value: String(r.id)
  }));

  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'repo-folder-subfolder-modal',
      title: { type: 'plain_text', text: 'Pick repo' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ channelId }),
      blocks: [
        {
          type: 'input',
          block_id: 'repo_block',
          dispatch_action: true,          // fire immediately on select
          label: { type: 'plain_text', text: 'Repo' },
          element: {
            type: 'static_select',
            action_id: 'repo_selected',
            options: repoOptions
          }
        }
      ]
    }
  });
});


// 2️⃣ Repo selected → inject Folder picker
slackApp.action('repo_selected', async ({ ack, body, client }) => {
  await ack();
  const repoId = body.actions[0].selected_option.value;
  const repoName = body.actions[0].selected_option.text.text;
  const { channelId } = JSON.parse(body.view.private_metadata);

  // fetch top-level folders in that repo
  const folders = await listAllTopLevelFolders(repoName);
  const folderOptions = folders.map(f => ({
    text: { type: 'plain_text', text: f.name },
    value: f.path       // or f.id if you have an ID
  }));

  // re-build a minimal view with both Repo & Folder inputs
  const updatedView = {
    type: body.view.type,
    callback_id: body.view.callback_id,
    title: body.view.title,
    submit: body.view.submit,
    close: body.view.close,
    private_metadata: JSON.stringify({ channelId, repoId, repoName }),
    clear_on_close: body.view.clear_on_close,
    notify_on_close: body.view.notify_on_close,
    blocks: [
      // Repo (pre-selected)
      {
        type: 'input',
        block_id: 'repo_block',
        dispatch_action: true,
        label: body.view.blocks[0].label,
        element: {
          type: 'static_select',
          action_id: 'repo_selected',
          options: body.view.blocks[0].element.options,
          initial_option: { text: { type: 'plain_text', text: repoName }, value: repoId }
        }
      },
      // Folder
      {
        type: 'input',
        block_id: 'folder_block',
        dispatch_action: true,
        label: { type: 'plain_text', text: 'Folder' },
        element: {
          type: 'external_select',
          action_id: 'folder_selected',
          placeholder: { type: 'plain_text', text: 'Select a folder…' },
          min_query_length: 0
        }
      }
    ]
  };

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: updatedView
  });
});


// 3️⃣ Folder options lookup
slackApp.options('folder_selected', async ({ ack, body }) => {
  const { repoName } = JSON.parse(body.view.private_metadata);
  const folders = await listAllTopLevelFolders(repoName);
  // console.log("🚀 ~ slackApp.options ~ folders:", folders)

  const options = folders.map(f => ({
    text: { type: 'plain_text', text: f.name },
    value: f.path
  }));

  await ack({ options });
});

// 4️⃣ Folder selected → inject Sub‐folder picker
slackApp.action('folder_selected', async ({ ack, body, client }) => {
  await ack();

  const folderPath = body.actions[0].selected_option.value;
  const { channelId, repoId, repoName } = JSON.parse(body.view.private_metadata);

  // fetch sub-folders under that path
  const subfolders = await readFolderContents(folderPath, repoName);
  console.log("🚀 ~ slackApp.action ~ subfolders:", subfolders);

  const updatedView = {
    type: body.view.type,
    callback_id: body.view.callback_id,
    title: body.view.title,
    submit: body.view.submit,
    close: body.view.close,
    private_metadata: JSON.stringify({ channelId, repoId, repoName, folderPath }),
    clear_on_close: body.view.clear_on_close,
    notify_on_close: body.view.notify_on_close,
    blocks: [
      // Repo (pre-selected)
      {
        type: 'input',
        block_id: 'repo_block',
        dispatch_action: true,
        label: body.view.blocks[0].label,
        element: {
          type: 'static_select',
          action_id: 'repo_selected',
          options: body.view.blocks[0].element.options,
          initial_option: {
            text: { type: 'plain_text', text: repoName },
            value: repoId
          }
        }
      },

      // Folder (pre-selected)
      {
        type: 'input',
        block_id: 'folder_block',
        dispatch_action: true,
        label: body.view.blocks[1].label,
        element: {
          type: 'external_select',
          action_id: 'folder_selected',
          initial_option: {
            text: { type: 'plain_text', text: body.actions[0].selected_option.text.text },
            value: folderPath
          },
          placeholder: body.view.blocks[1].element.placeholder,
          min_query_length: 0
        }
      },

      // Sub-folder (type-ahead)
      {
        type: 'input',
        block_id: 'subfolder_block',
        label: { type: 'plain_text', text: 'Sub-folder' },
        element: {
          type: 'external_select',
          action_id: 'subfolder_selected',
          placeholder: { type: 'plain_text', text: 'Select a sub-folder…' },
          min_query_length: 0
        }
      }
    ]
  };

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: updatedView
  });
});

// 5️⃣ Sub-folder options lookup
slackApp.options('subfolder_selected', async ({ ack, body }) => {
  const { folderPath } = JSON.parse(body.view.private_metadata);
  const { repoName } = JSON.parse(body.view.private_metadata);
  const subs = await readFolderContents(folderPath, repoName);
  // console.log("🚀 ~ slackApp.options ~ subs:", subs)

  const options = subs.map(s => ({
    text: { type: 'plain_text', text: s.name },
    value: s.path
  }));

  await ack({ options });
});


// 6️⃣ On Submit → store everything with addChannelConfig(...)
slackApp.view('repo-folder-subfolder-modal', async ({ ack, body, view, client }) => {
  await ack();

  const { channelId, repoId, repoName, folderPath } = JSON.parse(view.private_metadata);

  console.log("🚀 ~ slackApp.view ~ channelId:", view.private_metadata)
  const repoSel = view.state.values.repo_block.repo_selected.selected_option;
  const folderSel = view.state.values.folder_block.folder_selected.selected_option;
  const subfolderSel = view.state.values.subfolder_block.subfolder_selected.selected_option;

  const folderId = folderSel.value;
  const folderName = folderSel.text.text;
  const subfolderId = subfolderSel.value;
  const subfolderName = subfolderSel.text.text;
  const fullPath = `${folderName}/${subfolderName}`;

  console.log("data of folders", folderId, folderName, subfolderName, subfolderId)
  const placeholder = await client.chat.postMessage({
    channel: channelId,
    text: '⏳ Processing your request…'
  });

  // persist your config however you like
  await addChannelConfig({
    channel_id: channelId,
    repo_id: repoId,
    repo: repoName,
    product_folder_name: folderName,
    sub_folder_name: subfolderName
  });


  // let the user know
  await client.chat.postMessage({
    channel: placeholder.channel,
    ts: placeholder.ts,
    text: `Config saved:\n• repo: *${repoName}*\n• folder: *${folderName}*\n• sub-folder: *${subfolderName}*`
  });
});

// ============================================
// DELETE STUDY FEATURE
// ============================================

// 1️⃣ Slash command: open modal with study picker
slackApp.command('/qori-delete', async ({ ack, command, client }) => {
  await ack();

  const userId = command.user_id;
  const channelId = command.channel_id;

  try {
    // Fetch studies created by the user
    const studies = await getStudiesByUser(userId);

    if (studies.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: '❌ You have no studies to delete. Create a study first with `/qori-start`.'
      });
      return;
    }

    // Create study options for the dropdown
    const studyOptions = studies.map(study => ({
      text: { type: 'plain_text', text: study.name },
      value: String(study.id)
    }));

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'delete-study-modal',
        title: { type: 'plain_text', text: 'Delete Study' },
        submit: { type: 'plain_text', text: 'Delete' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify({ channelId, userId }),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⚠️ *Warning: This action cannot be undone!*\n\nThis will permanently delete:\n• The study and all its data\n• All files and folders in GitHub\n• All associated roles, participants, notes, plans, and summaries'
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'input',
            block_id: 'study_select_block',
            label: { type: 'plain_text', text: 'Select study to delete:' },
            element: {
              type: 'static_select',
              action_id: 'study_selected',
              placeholder: { type: 'plain_text', text: 'Choose a study...' },
              options: studyOptions
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '💡 *Tip:* Only studies you created are shown here.'
            }
          }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening delete study modal:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ Error: ${error.message}`
    });
  }
});

// 2️⃣ On Submit → delete study and all associated data
slackApp.view('delete-study-modal', async ({ ack, body, view, client }) => {
  await ack();

  const { channelId, userId } = JSON.parse(view.private_metadata || '{}');
  const selectedStudy = view.state.values.study_select_block?.study_selected?.selected_option;

  if (!selectedStudy) {
    // Open DM channel with the user
    let dmChannelId;
    try {
      const im = await client.conversations.open({
        users: userId
      });
      dmChannelId = im.channel.id;
    } catch (dmError) {
      console.error('Failed to open DM channel, falling back to channel:', dmError);
      dmChannelId = channelId; // Fallback to channel if DM fails
    }

    await client.chat.postMessage({
      channel: dmChannelId,
      text: '❌ No study selected. Please try again.'
    });
    return;
  }

  const studyId = parseInt(selectedStudy.value);
  const studyName = selectedStudy.text.text;

  // Open DM channel with the user
  let dmChannelId;
  try {
    const im = await client.conversations.open({
      users: userId
    });
    dmChannelId = im.channel.id;
  } catch (dmError) {
    console.error('Failed to open DM channel, falling back to channel:', dmError);
    dmChannelId = channelId; // Fallback to channel if DM fails
  }

  // Send processing message to DM
  const placeholder = await client.chat.postMessage({
    channel: dmChannelId,
    text: `⏳ Deleting study "${studyName}"... This may take a moment.`
  });

  try {
    // 1. Get study details before deletion (to get the path)
    const study = await getResearchStudyWithRoles(studyName);
    
    if (!study) {
      await client.chat.update({
        channel: placeholder.channel,
        ts: placeholder.ts,
        text: `❌ Study "${studyName}" not found.`
      });
      return;
    }

    // 2. Delete from GitHub first (before database deletion)
    let githubResult = { deleted: 0, message: 'No GitHub folder found' };
    let githubError = null;
    if (study.path) {
      try {
        console.log(`🗑️ Deleting GitHub folder: ${study.path}`);
        githubResult = await deleteStudyFolderFromGitHub(study.path, process.env.GITHUB_REPO);
        console.log(`✅ GitHub deletion result:`, githubResult);
      } catch (err) {
        console.error('⚠️ Error deleting from GitHub (continuing with DB deletion):', err);
        githubError = err.message;
      }
    }

    // 3. Delete from database (cascade will handle related records)
    const deleteResult = await deleteResearchStudy(studyId, userId);
    console.log(`✅ Database deletion result:`, deleteResult);

    // 4. Build status message with clear GitHub outcome
    let githubStatus;
    if (!study.path) {
      githubStatus = `⚠️ *GitHub:* No study path stored — GitHub files were NOT deleted. If files exist in the repo, delete them manually.`;
    } else if (githubError) {
      githubStatus = `❌ *GitHub:* Deletion failed — ${githubError}\nFiles may still exist at \`${study.path}\`. Delete manually from the repo.`;
    } else if (githubResult.deleted === 0) {
      githubStatus = `⚠️ *GitHub:* No files found at \`${study.path}\` — folder may have already been removed.`;
    } else {
      githubStatus = `✅ *GitHub:* Deleted ${githubResult.deleted}/${githubResult.total} file(s)` +
        (githubResult.errors ? ` (${githubResult.errors.length} failed — check repo manually)` : '');
    }

    const successMessage = `✅ *Study deleted from database*\n\n` +
      `*Study:* ${studyName}\n` +
      `${githubStatus}\n` +
      `*Database:* Study and all associated data removed\n\n` +
      `⚠️ This action cannot be undone.`;

    await client.chat.update({
      channel: placeholder.channel,
      ts: placeholder.ts,
      text: successMessage
    });

  } catch (error) {
    console.error('❌ Error deleting study:', error);
    
    let errorMessage = `❌ *Failed to delete study*\n\n`;
    if (error.message.includes('permission')) {
      errorMessage += `You don't have permission to delete this study. Only the study creator can delete it.`;
    } else if (error.message.includes('not found')) {
      errorMessage += `Study not found or already deleted.`;
    } else {
      errorMessage += `Error: ${error.message}\n\nPlease try again or contact support.`;
    }

    await client.chat.update({
      channel: placeholder.channel,
      ts: placeholder.ts,
      text: errorMessage
    });
  }
});

// 1️⃣ Slash command: open modal to pick subfolder + ask question
slackApp.command('/ask-study', async ({ ack, command, client }) => {
  await ack();
  const channelId = await command.channel_id
  // 1️⃣ fetch your subfolders (keep this under 3s!)
  const subfolders = await readFolderContents(
    "beta-test/product-team-1/research",
    process.env.GITHUB_REPO
  );
  console.log("🚀 ~ slackApp.command ~ subfolders:", subfolders)
  const options = subfolders.map(f => ({
    text: { type: 'plain_text', text: f.name },
    value: f.name
  }));
  console.log("🚀 ~ slackApp.command ~ options:", options)

  // 2️⃣ immediately ACK *and* push the modal
  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'ask-study-modal',
      title: { type: 'plain_text', text: 'Ask Study Bot' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ channelId }),
      blocks: [
        {
          type: 'input',
          block_id: 'subfolder_block',
          label: { type: 'plain_text', text: 'Choose Subfolder' },
          element: {
            type: 'static_select',
            action_id: 'subfolder_selected',
            placeholder: { type: 'plain_text', text: 'Select a folder…' },
            options
          }
        },
        {
          type: 'input',
          block_id: 'question_block',
          label: { type: 'plain_text', text: 'Your Question' },
          element: {
            type: 'plain_text_input',
            action_id: 'question_input',
            multiline: true,
            placeholder: { type: 'plain_text', text: 'Type your question here…' }
          }
        }
      ]
    }
  });
});



// 2️⃣ Handle submission of the modal
slackApp.view('ask-study-modal', async ({ ack, view, client, body }) => {
  await ack();

  const { channelId } = JSON.parse(view.private_metadata);

  await client.chat.postMessage({
    channel: channelId,
    text: "This command isn't available yet. RAG-based study search is planned for a future release."
  });
});

// 1️⃣ Command handler: fetch both folder & template lists
// slackApp.command('/run-template', async ({ ack, command, client }) => {
//   await ack();

//   const channelId = command.channel_id;

//   // fetch your subfolders (keep this under 3s!)
//   const subfolders = await readFolderContents(
//     "beta-test/product-team-1/research",
//     process.env.GITHUB_REPO
//   );
//   const folderOptions = subfolders.map(f => ({
//     text: { type: 'plain_text', text: f.name },
//     value: f.name
//   }));

//   // fetch your templates list
//   const templates = await readFolderContents(
//     YAML_TEMPLATE_PATH,
//     process.env.GITHUB_REPO
//   );
//   const templateOptions = templates.map(t => ({
//     text: { type: 'plain_text', text: t.name },
//     value: t.name
//   }));

//   // push the modal
//   await client.views.open({
//     trigger_id: command.trigger_id,
//     view: {
//       type: 'modal',
//       callback_id: 'ask-study-modal',
//       title: { type: 'plain_text', text: 'Ask Study Bot' },
//       submit: { type: 'plain_text', text: 'Submit' },
//       close: { type: 'plain_text', text: 'Cancel' },
//       private_metadata: JSON.stringify({ channelId }),
//       blocks: [
//         {
//           type: 'input',
//           block_id: 'folder_block',
//           label: { type: 'plain_text', text: 'Choose Research Folder' },
//           element: {
//             type: 'static_select',
//             action_id: 'folder_selected',
//             placeholder: { type: 'plain_text', text: 'Select a folder…' },
//             options: folderOptions
//           }
//         },
//         {
//           type: 'input',
//           block_id: 'template_block',
//           label: { type: 'plain_text', text: 'Choose Template' },
//           element: {
//             type: 'static_select',
//             action_id: 'template_selected',
//             placeholder: { type: 'plain_text', text: 'Select a template…' },
//             options: templateOptions
//           }
//         },
//         {
//           type: 'input',
//           block_id: 'question_block',
//           label: { type: 'plain_text', text: 'Your Question' },
//           element: {
//             type: 'plain_text_input',
//             action_id: 'question_input',
//             multiline: true,
//             placeholder: { type: 'plain_text', text: 'Type your question here…' }
//           }
//         }
//       ]
//     }
//   });
// });

slackApp.command('/run-template', async ({ ack, command, client }) => {
  try {
    await ack();

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        ...researchShareoutModal,
        private_metadata: JSON.stringify({ channelId: command.channel_id }),
      }
    });
  } catch (error) {
    console.error("Error opening modal:", error.data || error);
  }
});

slackApp.action('type_select', async ({ ack, body, client, action }) => {
  try {
    await ack();

    const selectedValue = action.selected_option.value;

    const submitLabels = {
      stakeholder_summary: "🎯 Create Summary",
      executive_readout: "📊 Create Readout",
      team_shareout: "👥 Create Shareout",
      research_report: "📋 Generate Report",
      policy_brief: "🏛️ Create Brief",
      design_requirements: "📄 Generate Requirements"
    };

    const submitText = submitLabels[selectedValue] || "Select Shareout Type";

    const updatedModal = JSON.parse(JSON.stringify(researchShareoutModal));
    updatedModal.submit = {
      type: "plain_text",
      text: submitText,
    };

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: updatedModal
    });
  } catch (error) {
    console.error("Error updating view:", error.data || error);
  }
});


slackApp.view('research-shareout-submit', async ({ ack, body, view, client }) => {
  await ack();

  const values = view.state.values;
  const { channelId } = JSON.parse(view.private_metadata);
  const extract = (id) => values[id]?.input?.value || '';
  const getSelect = (id) => values[id]?.input?.selected_option?.value || '';

  const data = {
    shareoutType: getSelect('shareout_type'),
    studyName: extract('study_name'),
    targetAudience: extract('target_audience'),
    meetingDeadline: extract('meeting_deadline'),
    findings: extract('synthesized_findings'),
    deliveryChannel: extract('delivery_channel'),
    peopleToNotify: extract('people_to_notify'),
    channelId: channelId,
  };

  console.log(`📢 Research Shareout Submitted: study=${data.studyName}, channel=${data.deliveryChannel}`);

  await client.chat.postMessage({
    channel: body.user.id,
    text: `✅ *Your research shareout has been recorded!*\n\n*Study:* ${data.studyName}\n*To be shared in:* ${data.deliveryChannel}`
  });
});

// /qori-brief — standalone command to create a research brief (starts a new study)
slackApp.command('/qori-brief', async ({ ack, body, client, command }) => {
  await ack();
  try {
    const channelId = command.channel_id;

    // Get lead researcher from Slack profile
    let leadResearcher = '';
    try {
      const userInfo = await client.users.info({ user: body.user_id });
      leadResearcher = userInfo.user.real_name || userInfo.user.profile?.display_name || userInfo.user.name || '';
    } catch (err) { /* ignore */ }

    const view = await buildBriefEntryModal(leadResearcher, channelId);

    await client.views.open({
      trigger_id: body.trigger_id,
      view,
    });
  } catch (error) {
    console.error('Error opening /qori-brief modal:', error);
    await client.chat.postEphemeral({
      channel: body.user_id,
      user: body.user_id,
      text: `❌ Failed to open research brief: ${error.message}`,
    });
  }
});

// 1️⃣ Define your role enum
// Slash command to open the modal
// New command to start research directly with studySetupModal
slackApp.command('/qori-plan', async ({ ack, body, client, command }) => {
  await ack();
  const channelId = command.channel_id;
  const userId = command.user_id;

  // Fetch studies created by this user
  const studies = await getStudiesByUser(userId);

  // Start with the modal's blocks
  let blocks = [...studySetupModalPlanStudy.blocks];

  // Find the study_selection input block and update its options
  const studySelectionIndex = blocks.findIndex(
    block => block.block_id === "study_selection"
  );

  // If studies exist and we found the dropdown block, update its options
  if (studies && studies.length > 0 && studySelectionIndex !== -1) {
    const studyOptions = studies.map(study => ({
      text: { type: 'plain_text', text: study.name },
      value: study.id.toString() // Use study ID as value
    }));

    // Update the options in the existing input block
    blocks[studySelectionIndex] = {
      ...blocks[studySelectionIndex],
      element: {
        ...blocks[studySelectionIndex].element,
        options: studyOptions
      }
    };
  } else if (studySelectionIndex !== -1) {
    // No studies found - show a message
    blocks[studySelectionIndex] = {
      ...blocks[studySelectionIndex],
      element: {
        ...blocks[studySelectionIndex].element,
        options: [
          {
            text: {
              type: "plain_text",
              text: "No studies found — start with /qori-brief",
            },
            value: "no_studies",
          },
        ],
      }
    };
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      ...studySetupModalPlanStudy,
      blocks,
      private_metadata: JSON.stringify({ channelId, userId }),
    }
  });
});

// Handle study selection in study setup modal
slackApp.action('study_select', async ({ ack, body, client }) => {
  await ack();

  // Extract selected study
  const selected = body.actions[0].selected_option;
  const selectedStudyId = selected?.value;
  const selectedStudyName = selected?.text?.text || null;
  console.log("🚀 ~ study_select ~ id:", selectedStudyId, "name:", selectedStudyName)

  // Store the selected study name/id for downstream use
  const oldMeta = JSON.parse(body.view.private_metadata || '{}');
  const newMeta = JSON.stringify({
    ...oldMeta,
    studyId: selectedStudyId,
    studyName: selectedStudyName || oldMeta.studyName || null,
  });

  // Update the modal to include the selected study in metadata
  // Only pass the valid view properties that Slack API accepts
  const validView = {
    type: body.view.type,
    callback_id: body.view.callback_id,
    title: body.view.title,
    submit: body.view.submit,
    close: body.view.close,
    blocks: body.view.blocks,
    private_metadata: newMeta,
  };

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: validView
  });
});

slackApp.command('/qori-start', startResearchHandler);

slackApp.options('user_select', async ({ ack, body, view, client }) => {
  // Parse out the channelId we stored
  const { channelId } = JSON.parse(body.view.private_metadata);

  // 1. Get channel members
  const conv = await client.conversations.members({ channel: channelId });
  const memberSet = new Set(conv.members);

  // 2. List all users and filter
  const usersList = await client.users.list();
  const options = usersList.members
    .filter(u => memberSet.has(u.id) && !u.is_bot && u.id !== 'USLACKBOT')
    .map(u => ({ text: { type: 'plain_text', text: u.profile.real_name || u.name }, value: u.id }));

  // 3. Ack with up to 100
  await ack({ options: options.slice(0, 100) });
});

// Handle "Add Another Team Member" button clicks
slackApp.action('add_user', handleAddTeamMember);

// Handle create study modal submission (unified for both new studies and studies from requests)
slackApp.view('create_study_modal', handleCreateStudySubmission);

// Handle plan_study_modal submission (when user clicks "Done" button)
slackApp.view('plan_study_modal', async ({ ack, body, view, client }) => {
  await ack();
  // Just acknowledge - the modal can be closed, no action needed
  // Users can still click buttons to create documents/upload files
});

slackApp.event("view_closed", async ({ event, client }) => {
  if (event.view.callback_id !== "plan_study_modal" &&
    event.view.callback_id !== "study-setup-modal-start-research") return;

  // Don't show placeholder message when modal is closed via other means
  // (like clicking outside or navigating to another modal)
  // The placeholder will only be shown when user clicks "Skip for Now" button
});

// Handle study-setup-modal-start-research submission (Skip for Now button)
slackApp.view('study-setup-modal-start-research', async ({ ack, body, view, client }) => {
  await ack();

  // Parse metadata to get channelId and studyName
  const { channelId, studyName } = JSON.parse(view.private_metadata || "{}");

  // Show processing placeholder
  // const placeholder = await client.chat.postMessage({
  //   channel: channelId,
  //   text: "⏳ Processing your request…"
  // });

  // // Update the placeholder with completion message
  // await client.chat.update({
  //   channel: placeholder.channel,
  //   ts: placeholder.ts,
  //   text: `✅ Study *${studyName}* setup completed! You can continue with research planning anytime using \`/plan-study\``
  // });
});


// 1️⃣ Button click handler for "Create Plan"
slackApp.action('create_research_plan', async ({ ack, body, client }) => {
  try {
    await ack();

    console.log("🚀 ~ create_research_plan ~ body.view.private_metadata:", body.view.private_metadata);

    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get selected study from the input block
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    let preselectStudyName = selectedFromView?.text?.text || meta.studyName || null;
    let preselectStudyId = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!preselectStudyName || preselectStudyId === 'loading' || preselectStudyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: "❌ Please select a study before creating a research plan."
      });
      return;
    }

    // Fetch studies for the user
    const userId = body.user.id;
    const studies = await getStudiesByUser(userId);

    // Fetch lead researcher: study record → Slack profile fallback
    let leadResearcher = null;
    try {
      const study = await getResearchStudyWithRoles(preselectStudyName);
      if (study && study.researcher_name) {
        leadResearcher = study.researcher_name;
      }
    } catch (error) {
      console.warn('Could not fetch study for lead researcher:', error.message);
    }
    if (!leadResearcher) {
      try {
        const userInfo = await client.users.info({ user: userId });
        leadResearcher = userInfo.user.real_name || userInfo.user.profile?.display_name || userInfo.user.name || '';
      } catch (err) {
        console.warn('Could not fetch Slack profile for lead researcher:', err.message);
      }
    }

    // Start with the modal's blocks
    let blocks = [...researchPlanGeneratorModal.blocks];

    // Find the study_folder_block and lead_researcher_block input blocks
    const studyFolderIndex = blocks.findIndex(
      block => block.block_id === "study_folder_block"
    );
    const leadResearcherIndex = blocks.findIndex(
      block => block.block_id === "lead_researcher_block"
    );

    // Auto-populate study folder with study name
    if (studyFolderIndex !== -1 && preselectStudyName) {
      blocks[studyFolderIndex] = {
        ...blocks[studyFolderIndex],
        element: {
          ...blocks[studyFolderIndex].element,
          initial_value: preselectStudyName
        }
      };
    }

    // Auto-populate lead researcher
    if (leadResearcherIndex !== -1 && leadResearcher) {
        blocks[leadResearcherIndex] = {
          ...blocks[leadResearcherIndex],
          element: {
            ...blocks[leadResearcherIndex].element,
          initial_value: leadResearcher
        }
      };
      console.log(`✅ Pre-populated lead researcher: ${leadResearcher}`);
    }

    // Cascade readiness — inject upstream variable status
    try {
      const studyForCascade = await getResearchStudyWithRoles(preselectStudyName);
      if (studyForCascade?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'research_plan');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          // Insert cascade blocks after the first divider
          const firstDivider = blocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            blocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Cascade readiness failed for research plan:', err.message);
    }

    await client.views.update({
      view_id: body.view.id,
      trigger_id: body.trigger_id,
      view: {
        ...researchPlanGeneratorModal,
        blocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName: preselectStudyName, studyId: preselectStudyId })
      }
    });

  } catch (error) {
    console.error('Error opening research plan modal:', error);
  }
});

slackApp.view('research_plan_modal', async ({ ack, body, view, client }) => {
  await ack(); // Always acknowledge the view

  const values = view.state.values;
  const { channelId, studyName: metaStudyName, userId } = JSON.parse(view.private_metadata || '{}');

  // Get study name from study_folder_block if available, otherwise use metadata
  const studyName = values.study_folder_block?.study_folder_input?.value || metaStudyName;

  if (!studyName) {
    throw new Error('No study selected or provided');
  }

  console.log("🚀 ~ Research Plan Generator ~ studyName:", studyName);

  // Fetch the full study with roles
  const study = await getResearchStudyWithRoles(studyName);

  // Helper function to extract values from different input types
  const extract = (blockId, actionId) => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    // Handle different input types
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option.value || null;
    if (action.selected_date !== undefined) return action.selected_date;
    if (action.selected_options !== undefined) return action.selected_options.map(opt => opt.value);
    return null;
  };

  // Extract form values — plan only collects execution details
  // Scope (objectives, method, participants, context) comes from cascade
  const data = {
    selected_study: studyName,
    project_title: studyName,
    lead_researcher: extract('lead_researcher_block', 'lead_researcher_input'),
    note_taker: extract('note_taker_block', 'note_taker_input') || '',
    observer: extract('observer_block', 'observer_input') || '',
    recruitment_sources: extract('recruitment_source_block', 'recruitment_source_input') || '',
    operational_risks: extract('operational_risks_block', 'operational_risks_input') || '',
  };
  
  console.log(`📋 Extracted research plan data: ${Object.keys(data).length} fields, study: ${data.study_name || 'unknown'}`);
  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "research_plan.yaml");
  const renderedYaml = await processYamlTemplate(file.content, data, study.path);

  const url = renderedYaml.result.url;
  const urlParts = renderedYaml.result.path.split('/');
  const fileName = urlParts[urlParts.length - 1];
  const planData = {
    study_id: study.id,
    study_name: studyName,
    filename: fileName,
    file_path: renderedYaml.result.path,
    file_url: renderedYaml.result.url,
    created_by: userId,
  };
  await research_planService.createResearchPlan(planData);
  const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'plan');
  await sendStudyResultMessage(client, channelId, studyName, blocks, 'plan');

  // Add study status for created file
  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || body.user_id || null,
    // file_name: url ? url.split('/').pop() : null
  });
});

slackApp.action('approve_plan', async ({ ack, body, client }) => {
  await ack();
  await handleApprove(body, client, 'plan');
});

slackApp.view('confirm_approve_plan', async ({ ack, view, body, client }) => {
  await handleApproveSubmission(ack, view, body, client);
});

// 3) Request Changes Plan button clicked → open "What needs changing?" modal
slackApp.action('request_changes_plan', async ({ ack, body, client }) => {
  await ack();
  await handleRequestChanges(body, client, 'plan');
});

// 4) Request-changes-plan modal submitted → DB/YAML + rich channel post
slackApp.view('request_changes_plan_modal', async ({ ack, view, body, client }) => {
  await handleRequestChangesSubmission(ack, view, body, client);
});

// Button click handler for "Create Research Brief"
slackApp.action('create_research_brief', async ({ ack, body, client }) => {
  try {
    await ack();

    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get study name from parent view's study selector (if coming from /qori-plan)
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    const preselectStudyName = selectedFromView?.text?.text || meta.studyName || '';
    const preselectStudyId = selectedFromView?.value || meta.studyId || null;
    const userId = body.user.id;

    // Fetch lead researcher: study record → Slack profile fallback
    let leadResearcher = null;
    if (preselectStudyName) {
      try {
        const study = await getResearchStudyWithRoles(preselectStudyName);
        if (study?.researcher_name) leadResearcher = study.researcher_name;
      } catch (error) { /* study may not exist yet — that's OK */ }
    }
    if (!leadResearcher) {
      try {
        const userInfo = await client.users.info({ user: userId });
        leadResearcher = userInfo.user.real_name || userInfo.user.profile?.display_name || userInfo.user.name || '';
      } catch (err) { /* ignore */ }
    }

    // Clone modal blocks and pre-fill
    const modalBlocks = JSON.parse(JSON.stringify(researchBriefModal.blocks));

    // Pre-fill study name (text input)
    const studyNameIndex = modalBlocks.findIndex(b => b.block_id === 'study_name_block');
    if (studyNameIndex !== -1 && preselectStudyName) {
      modalBlocks[studyNameIndex] = {
        ...modalBlocks[studyNameIndex],
        element: { ...modalBlocks[studyNameIndex].element, initial_value: preselectStudyName },
      };
    }

    // Pre-fill stakeholder name if available from request
    const stakeholderName = meta.requestData?.prepared_by || null;
    const stakeholderIndex = modalBlocks.findIndex(b => b.block_id === 'stakeholder_block');
    if (stakeholderIndex !== -1 && stakeholderName) {
      modalBlocks[stakeholderIndex] = {
        ...modalBlocks[stakeholderIndex],
        element: { ...modalBlocks[stakeholderIndex].element, initial_value: stakeholderName },
      };
    }

    // Calculate default start date (next Monday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    const defaultStartDate = nextMonday.toISOString().split('T')[0];
    const startDateIndex = modalBlocks.findIndex(b => b.block_id === 'start_date_block');
    if (startDateIndex !== -1) {
      modalBlocks[startDateIndex] = {
        ...modalBlocks[startDateIndex],
        element: { ...modalBlocks[startDateIndex].element, initial_date: defaultStartDate },
      };
    }

    // Cascade readiness (if study already exists and has upstream vars)
    if (preselectStudyName) {
      try {
        const studyForCascade = await getResearchStudyWithRoles(preselectStudyName);
        if (studyForCascade?.path) {
          const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
          if (Object.keys(studyVars.variables).length > 0) {
            const cascadeData = buildCascadeReadiness(studyVars, 'research_brief');
            const cascadeBlocks = buildCascadeBlocks(cascadeData);
            const firstDivider = modalBlocks.findIndex(b => b.type === 'divider');
            if (firstDivider !== -1) {
              modalBlocks.splice(firstDivider, 0, ...cascadeBlocks);
            }
          }
        }
      } catch (err) { /* no cascade data yet — that's fine for briefs */ }
    }

    await client.views.update({
      view_id: body.view.id,
      view: {
        ...researchBriefModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({
          ...meta,
          studyName: preselectStudyName,
          studyId: preselectStudyId,
          leadResearcher,
        }),
      },
    });

    console.log(`✅ Opened research brief modal for study: ${preselectStudyName}`);
  } catch (err) {
    console.error('Error opening brief modal - full error:', JSON.stringify(err.data, null, 2));
    // Notify user of the error
    try {
      const meta = JSON.parse(body.view?.private_metadata || '{}');
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: `❌ Error opening research brief: ${err.data?.error || err.message || 'Unknown error'}`
      });
    } catch (notifyErr) {
      console.error('Could not notify user of error:', notifyErr.message);
    }
  }
});

slackApp.view('research_brief_modal', handleBriefSubmission);

slackApp.action('approve_brief', async ({ ack, body, client }) => {
  await ack();
  await handleApprove(body, client, 'brief');
});

slackApp.view('confirm_approve_brief', async ({ ack, view, body, client }) => {
  await handleApproveSubmission(ack, view, body, client);
});

// Handle “Create Research Plan” CTA from approved brief
slackApp.action('create_research_plan_from_brief', async ({ ack, body, client }) => {
  await ack();
  try {
    const { studyName, channelId } = JSON.parse(body.actions[0].value);
    const study = await getResearchStudyWithRoles(studyName);

    // Fetch lead researcher
    let leadResearcher = study?.researcher_name || '';
    if (!leadResearcher) {
      try {
        const userInfo = await client.users.info({ user: body.user.id });
        leadResearcher = userInfo.user.real_name || userInfo.user.profile?.display_name || '';
      } catch (err) { /* ignore */ }
    }

    // Build plan modal blocks with study pre-filled
    let blocks = [...researchPlanGeneratorModal.blocks];
    const studyFolderIndex = blocks.findIndex(b => b.block_id === 'study_folder_block');
    if (studyFolderIndex !== -1 && studyName) {
      blocks[studyFolderIndex] = {
        ...blocks[studyFolderIndex],
        element: { ...blocks[studyFolderIndex].element, initial_value: studyName },
      };
    }
    const leadIdx = blocks.findIndex(b => b.block_id === 'lead_researcher_block');
    if (leadIdx !== -1 && leadResearcher) {
      blocks[leadIdx] = {
        ...blocks[leadIdx],
        element: { ...blocks[leadIdx].element, initial_value: leadResearcher },
      };
    }

    // Inject cascade readiness
    try {
      if (study?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(study.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'research_plan');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          const firstDivider = blocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            blocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Cascade readiness failed:', err.message);
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...researchPlanGeneratorModal,
        blocks,
        private_metadata: JSON.stringify({ studyName, studyId: study?.id?.toString(), channelId }),
      },
    });
  } catch (err) {
    console.error('Error opening research plan from brief approval:', err.data || err);
  }
});

// 5) Handle the “Request Changes” button click by opening an input modal
slackApp.action('request_changes_brief', async ({ ack, body, client }) => {
  await ack();
  await handleRequestChanges(body, client, 'brief');
});

slackApp.view('request_changes_brief_modal', async ({ ack, view, body, client }) => {
  await handleRequestChangesSubmission(ack, view, body, client);
});

slackApp.action('create_discussion_guide', async ({ ack, body, client }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get selected study from the input block
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId = selectedFromView?.value || meta.studyId || null;
    
    // Validate that study is selected
    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: "❌ Please select a study before creating a discussion guide."
      });
      return;
    }
    
    console.log("🚀 ~ studyName:", studyName)

    // Clone modal blocks and inject initial_value for study_name if available
    const blocks = Array.from(discussionGuideModal.blocks);
    const studyIdx = blocks.findIndex(b => b.block_id === 'study_name');
    if (!studyName) {
      try {
        // Fallback: default to the user's first study if metadata missing
        const userId = body.user.id;
        const studies = await getStudiesByUser(userId);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
          studyId = String(studies[0].id);
        }
      } catch (e) {
        console.warn('⚠️ Could not infer studyName for discussion guide:', e.message);
      }
    }

    if (studyIdx !== -1 && studyName) {
      blocks[studyIdx] = {
        ...blocks[studyIdx],
        element: {
          ...blocks[studyIdx].element,
          initial_value: studyName,
        },
      };
    }

    // Auto-fill lead moderator from study or Slack profile
    let leadModerator = null;
    try {
      const study = await getResearchStudyWithRoles(studyName);
      if (study?.researcher_name) leadModerator = study.researcher_name;
    } catch (err) { /* ignore */ }
    if (!leadModerator) {
      try {
        const userInfo = await client.users.info({ user: userId });
        leadModerator = userInfo.user.real_name || userInfo.user.profile?.display_name || userInfo.user.name || '';
      } catch (err) { /* ignore */ }
    }
    const moderatorIdx = blocks.findIndex(b => b.block_id === 'lead_moderator_block');
    if (moderatorIdx !== -1 && leadModerator) {
      blocks[moderatorIdx] = {
        ...blocks[moderatorIdx],
        element: { ...blocks[moderatorIdx].element, initial_value: leadModerator },
      };
    }

    // Cascade readiness — inject upstream variable status
    try {
      const studyForCascade = await getResearchStudyWithRoles(studyName);
      if (studyForCascade?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'discussion_guide');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          const firstDivider = blocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            blocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Cascade readiness failed for discussion guide:', err.message);
    }

    await client.views.update({
      view_id: body.view.id,
      trigger_id: body.trigger_id,
      view: {
        ...discussionGuideModal,
        blocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId }),
      }
    });
  } catch (err) {
    console.error('Error opening discussion guide modal:', err.data || err);
  }
});

slackApp.view("discussion_guide_modal", async ({ ack, body, view, client }) => {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName } = meta;
  // Fallbacks if studyName not present in metadata
  if (!studyName) {
    // Try reading from visible input field
    const inputStudy = values?.study_name?.value?.value || values?.study_name?.value || null;
    if (inputStudy && typeof inputStudy === 'string' && inputStudy.trim().length > 0) {
      studyName = inputStudy.trim();
    }
  }
  if (!studyName) {
    try {
      const userId = body.user?.id || meta.userId;
      const studies = await getStudiesByUser(userId);
      if (Array.isArray(studies) && studies.length > 0) {
        studyName = studies[0].name;
      }
    } catch (e) {
      console.warn('⚠️ Could not infer studyName on submission:', e.message);
    }
  }
  console.log("🚀 ~ discussion-guide submission studyName:", studyName)
  const extract = (blockId, actionId) => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    // Handle different input types
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option.value || null;
    return null;
  };

  const guideData = {
    selected_study: studyName,
    study_name: studyName,
    research_focus: extract("research_focus_block", "research_focus"),
    research_questions: extract("research_questions_block", "research_questions"),
    research_method: extract("research_method_block", "research_method") || 'usability_testing',
    session_length: extract("session_length_block", "session_length") || '60',
    task_count: extract("task_count_block", "task_count") || '5',
    lead_researcher: extract("lead_moderator_block", "lead_moderator") || body.user?.name || '',
  };

  const study = await getResearchStudyWithRoles(studyName);
  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "discussion_guide.yaml");

  const renderedYaml = await processYamlTemplate(file.content, guideData, study.path);

  const url = renderedYaml.result.url;

  const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'discussion');
  await sendStudyResultMessage(client, channelId, studyName, blocks, 'discussion');

  // Add study status for created file
  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || body.user_id || null,
    // file_name: url ? url.split('/').pop() : null
  });

});

// slackApp.action('approve_discussion', async ({ ack, body, client }) => {
//   await ack();
//   await handleApprove(body, client, 'discussion');
// });

// slackApp.view('confirm_approve_discussion', async ({ ack, view, body, client }) => {
//   await handleApproveSubmission(ack, view, body, client);
// });

// // 6) Handle the "Request Changes" button click for discussion guide
// slackApp.action('request_changes_discussion', async ({ ack, body, client }) => {
//   await ack();
//   await handleRequestChanges(body, client, 'discussion');
// });

// slackApp.view('request_changes_discussion_modal', async ({ ack, view, body, client }) => {
//   await handleRequestChangesSubmission(ack, view, body, client);
// });

// Button click handler for "Upload Desk Research"
slackApp.action('upload_desk_research', async ({ ack, body, client }) => {
  console.log("🚀 ~ body:", body)
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get selected study from the input block
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: "❌ Please select a study before uploading desk research."
      });
      return;
    }

    // Fallback: default to the user's first study if metadata missing
    if (!studyName) {
      try {
        const userId = body.user.id;
        const studies = await getStudiesByUser(userId);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
          studyId = String(studies[0].id);
        }
      } catch (e) {
        console.warn('⚠️ Could not infer studyName for upload desk research:', e.message);
      }
    }

    // Fetch studies for the user to populate dropdown
    const userId = body.user.id;
    const studies = await getStudiesByUser(userId);
    const studyOptions = studies.map(study => ({
      text: { type: 'plain_text', text: study.name },
      value: String(study.id)
    }));

    // Update modal with study options and auto-populate
    const modalBlocks = [...uploadDeskResearchModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');
    
    if (studyBlockIndex !== -1 && studyOptions.length > 0) {
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        element: {
          ...modalBlocks[studyBlockIndex].element,
          options: studyOptions,
          initial_option: studyName ? studyOptions.find(o => o.text.text === studyName) || studyOptions[0] : studyOptions[0]
        }
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...uploadDeskResearchModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      }
    });
  } catch (err) {
    console.error('Error opening upload desk research modal:', err.data || err);
  }
});


// Handler for Create Stakeholder Guide button (from plan study modal)
slackApp.action('create_stakeholder_guide', async ({ ack, body, client }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get selected study from the input block
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: "❌ Please select a study before creating a stakeholder guide."
      });
      return;
    }

    // Fallback: default to the user's first study if metadata missing
    if (!studyName) {
      try {
        const userId = body.user.id;
        const studies = await getStudiesByUser(userId);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
          studyId = String(studies[0].id);
        }
      } catch (e) {
        console.warn('⚠️ Could not infer studyName for stakeholder guide:', e.message);
      }
    }

    // Clone modal blocks and auto-populate study
    const modalBlocks = [...stakeholderInterviewGuideModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');
    
    if (studyBlockIndex !== -1 && studyName) {
      // Update the study input block to auto-populate
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        element: {
          ...modalBlocks[studyBlockIndex].element,
          initial_value: studyName
        }
      };
    }

    // Cascade readiness — inject upstream variable status
    try {
      const studyForCascade = await getResearchStudyWithRoles(studyName);
      if (studyForCascade?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'stakeholder_interview_guide');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          const firstDivider = modalBlocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            modalBlocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Cascade readiness failed for stakeholder guide:', err.message);
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...stakeholderInterviewGuideModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      }
    });
  } catch (err) {
    console.error('Error opening stakeholder guide modal:', err.data || err);
  }
});

// Handler for Create Stakeholder Interview Guide button
slackApp.action('create_stakeholder_interview_guide', async ({ ack, body, client }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: "❌ Please select a study before creating a stakeholder interview guide."
      });
      return;
    }

    // Fallback: default to the user's first study if metadata missing
    if (!studyName) {
      try {
        const userId = body.user.id;
        const studies = await getStudiesByUser(userId);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
          studyId = String(studies[0].id);
        }
      } catch (e) {
        console.warn('⚠️ Could not infer studyName for stakeholder interview guide:', e.message);
      }
    }

    // Clone modal blocks and auto-populate study
    const modalBlocks = [...stakeholderInterviewGuideModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');
    
    if (studyBlockIndex !== -1 && studyName) {
      // Update the study input block to auto-populate
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        element: {
          ...modalBlocks[studyBlockIndex].element,
          initial_value: studyName
        }
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...stakeholderInterviewGuideModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      }
    });
  } catch (err) {
    console.error('Error opening stakeholder interview guide modal:', err.data || err);
  }
});

// Handler for Stakeholder Interview Guide submission
slackApp.view("stakeholder_interview_guide_modal", async ({ ack, body, view, client }) => {
  // Close the modal immediately to prevent going back to previous modal
  await ack({
    response_action: "clear"
  });

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName } = meta;

  // Get study name from study_select_block if available
  const studyInput = values.study_select_block?.selected_study?.value;
  if (studyInput) {
    studyName = studyInput || studyName;
  }

  // Fallback: get studyName from metadata if not present
  if (!studyName) {
    try {
      const userId = body.user?.id || meta.userId;
      const studies = await getStudiesByUser(userId);
      if (Array.isArray(studies) && studies.length > 0) {
        studyName = studies[0].name;
      }
    } catch (e) {
      console.warn('⚠️ Could not infer studyName on submission:', e.message);
    }
  }

  // Extract all form values
  const stakeholderRole = values.stakeholder_role_block?.stakeholder_role?.selected_option?.value || null;
  const stakeholderRoleText = values.stakeholder_role_block?.stakeholder_role?.selected_option?.text?.text || null;
  const stakeholderTeam = values.stakeholder_team_block?.stakeholder_team?.value || null;
  const sessionDuration = values.session_duration_block?.session_duration?.selected_option?.value || null;
  const sessionDurationText = values.session_duration_block?.session_duration?.selected_option?.text?.text || null;
  const stakeholderName = values.stakeholder_name_block?.stakeholder_name?.value || null;
  const focusAreas = values.interview_focus_block?.interview_focus?.selected_options?.map(opt => opt.value) || [];
  const focusAreasText = values.interview_focus_block?.interview_focus?.selected_options?.map(opt => opt.text?.text) || [];
  const researchQuestions = values.research_questions_block?.research_questions?.value || null;
  const userFindings = values.user_findings_block?.user_findings?.value || null;

  try {
    // Map form fields to YAML input variables
    const interviewFocus = focusAreasText.join(', ') || focusAreas.join(', ') || '';
    
    // Extract known_constraints if "constraints" is in focus areas
    const knownConstraints = focusAreas.includes('constraints') 
      ? 'User selected constraints as a focus area. Ask about technical, policy, and resource constraints.'
      : '';

    const templateData = {
      // Map to YAML input variables
      selected_study: studyName,
      stakeholder_role: stakeholderRoleText || stakeholderRole || '',
      stakeholder_team: stakeholderTeam || '',
      interview_focus: interviewFocus,
      known_constraints: knownConstraints,
      research_questions: researchQuestions || userFindings || '',
      user_findings: userFindings || '',
      session_duration: sessionDurationText || sessionDuration || '',

      // Additional metadata for template processing
      stakeholder_name: stakeholderName || '',
      study_name: studyName,
    };

    console.log(`📝 Template Data: ${Object.keys(templateData).length} fields, study: ${templateData.study_name || 'unknown'}`);

    // Fetch and process YAML template
    const study = await getResearchStudyWithRoles(studyName);
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "stakeholder_interview_guide.yaml");
    
    const renderedYaml = await processYamlTemplate(file.content, templateData, study.path);
    const url = renderedYaml.result.url;

    console.log("✅ Stakeholder Interview Guide created:", url);

    // Send result message to Slack
    const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'stakeholder_guide');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'stakeholder_guide');

    // Add study status for created file
    // Explicitly pass file_name containing "stakeholder" so getStudyStakeholderGuide
    // (which filters on file_name ILIKE '%stakeholder%') can find it later.
    const stakeholderFileName = url.split('/').pop() || 'stakeholder_interview_guide.md';
    await addStudyStatus({
      study_name: studyName,
      path: url,
      file_name: stakeholderFileName,
      status: 'created',
      created_by: body.user?.id || body.user_id || null,
    });

  } catch (error) {
    console.error('❌ Error processing stakeholder interview guide:', error);
    
    // Send error message to user
    try {
      await client.chat.postMessage({
        channel: channelId || body.user.id,
        text: `❌ Failed to create stakeholder interview guide: ${error.message}`,
      });
    } catch (msgError) {
      console.error('Error sending error message:', msgError);
    }
  }
});

// Handler for Upload Stakeholder Notes button
slackApp.action('upload_stakeholder_notes', async ({ ack, body, client }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get selected study from the input block
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: "❌ Please select a study before uploading stakeholder notes."
      });
      return;
    }

    // Fetch studies for the user to populate dropdown
    const userId = body.user.id;
    const studies = await getStudiesByUser(userId);
    const studyOptions = studies.map(study => ({
      text: { type: 'plain_text', text: study.name },
      value: String(study.id)
    }));

    // Update modal with study options and auto-populate
    const modalBlocks = [...uploadStakeholderNotesModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');
    
    if (studyBlockIndex !== -1 && studyOptions.length > 0) {
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        elements: [
          {
            ...modalBlocks[studyBlockIndex].elements[0],
            options: studyOptions,
            initial_option: studyName ? studyOptions.find(o => o.text.text === studyName) || studyOptions[0] : studyOptions[0]
          }
        ]
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...uploadStakeholderNotesModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      }
    });
  } catch (err) {
    console.error('Error opening upload stakeholder notes modal:', err.data || err);
  }
});

slackApp.view('upload_stakeholder_notes_modal', async ({ ack, view, body, client }) => {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName, studyId } = meta;

  // Get selected study from the dropdown if not in metadata
  const selectedStudy = values.study_select_block?.selected_study?.selected_option;
  if (selectedStudy) {
    studyName = selectedStudy.text.text || studyName;
    studyId = selectedStudy.value || studyId;
  }

  console.log("🚀 ~ upload-stakeholder-notes submission studyName:", studyName);

  // Validate required fields
  if (!studyName) {
    await client.chat.postMessage({
      channel: channelId || body.user?.id,
      text: "❌ Study name is required. Please select a study and try again."
    });
    return;
  }

  if (!channelId) {
    await client.chat.postMessage({
      channel: body.user?.id,
      text: "❌ Channel ID is required but could not be determined. Please try again."
    });
    return;
  }

  // Extract form data
  const uploadedFiles = values.file_upload_block?.file_upload?.files?.map(file => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    url: file.url_private
  })) || [];

  const data = {
    studyId,
    studyName,
    uploadedFiles,
    channelId,
  };

  console.log(`🚀 ~ stakeholder notes: study=${data.studyName}, files=${data.uploadedFiles?.length || 0}`);


  // Validate files
  if (data.uploadedFiles.length === 0) {
    await client.chat.postMessage({
      channel: channelId,
      text: "❌ Please upload at least one transcript or notes file."
    });
    return;
  }

  try {
    // Process uploaded files to extract content
    const processedFiles = await processSlackFiles(data.uploadedFiles, process.env.SLACK_BOT_TOKEN);

    // Prepare documents array
    const documents = processedFiles.map(file => ({
      name: file.name,
      content: file.content,
      type: file.type,
      size: file.size
    }));

    // Validate documents
    const validation = validateDocuments(documents);
    if (!validation.isValid) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ ${validation.message}`
      });
      return;
    }

    // Parse documents into structured format
    const parsedDocuments = parseDocuments(documents);
    const formattedDocumentContent = parsedDocuments.structured_format;

    const stakeholderNotesData = {
      selected_study: studyName,
      study_name: studyName,
      combined_file_content: formattedDocumentContent,
    };

    // Get the study
    const study = await getResearchStudyWithRoles(studyName);

    if (!study) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ Study "${studyName}" not found. Please verify the study name and try again.`
      });
      return;
    }

    // Fetch and process the YAML template for stakeholder notes
    const file = await fetchFileFromRepo(
      getConfigRepo(),
      YAML_TEMPLATE_PATH,
      "stakeholder_synthesis.yaml" // Update this to your actual template filename
    );

    const renderedYaml = await processYamlTemplate(
      file.content,
      stakeholderNotesData,
      study.path
    );

    const url = renderedYaml.result.url;

    // Register in research_status so synthesis modal (Service Blueprint, etc.)
    // can discover this file via getStudyStakeholderGuide (ILIKE '%stakeholder%')
    const stakeholderSynthesisFileName = url.split('/').pop() || 'stakeholder_synthesis.md';
    await addStudyStatus({
      study_name: studyName,
      path: url,
      file_name: stakeholderSynthesisFileName,
      status: 'created',
      created_by: body.user?.id || body.user_id || null,
    });

    // Generate and send result message
    const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'stakeholder_notes');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'stakeholder_notes');

  } catch (error) {
    console.error('Error processing stakeholder notes:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ There was an error processing your stakeholder notes: ${error.message}\n\nPlease try again or contact support.`
    });
  }
});

// Handler for Upload Survey Data button
slackApp.action('upload_survey_data', async ({ ack, body, client }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get selected study from the input block
    const selectedFromView = body.view?.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: "❌ Please select a study before uploading survey data."
      });
      return;
    }

    // Fetch studies for the user to populate dropdown
    const userId = body.user.id;
    const studies = await getStudiesByUser(userId);
    const studyOptions = studies.map(study => ({
      text: { type: 'plain_text', text: study.name },
      value: String(study.id)
    }));

    // Update modal with study options and auto-populate
    const modalBlocks = [...uploadSurveyDataModal.blocks];
    const studyBlockIndex = modalBlocks.findIndex(b => b.block_id === 'study_select_block');
    
    if (studyBlockIndex !== -1 && studyOptions.length > 0) {
      modalBlocks[studyBlockIndex] = {
        ...modalBlocks[studyBlockIndex],
        elements: [
          {
            ...modalBlocks[studyBlockIndex].elements[0],
            options: studyOptions,
            initial_option: studyName ? studyOptions.find(o => o.text.text === studyName) || studyOptions[0] : studyOptions[0]
          }
        ]
      };
    }

    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...uploadSurveyDataModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId, channelId: meta.channelId }),
      }
    });
  } catch (err) {
    console.error('Error opening upload survey data modal:', err.data || err);
  }
});

slackApp.view('upload_survey_data_modal', async ({ ack, view, body, client }) => {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName, studyId } = meta;

  // Get selected study from the dropdown if not in metadata
  const selectedStudy = values.study_select_block?.selected_study?.selected_option;
  if (selectedStudy) {
    studyName = selectedStudy.text.text || studyName;
    studyId = selectedStudy.value || studyId;
  }

  // Validate required fields
  if (!studyName) {
    await client.chat.postMessage({
      channel: channelId || body.user?.id,
      text: "❌ Study name is required. Please select a study and try again."
    });
    return;
  }

  if (!channelId) {
    await client.chat.postMessage({
      channel: body.user?.id,
      text: "❌ Channel ID is required but could not be determined. Please try again."
    });
    return;
  }

  // Extract form data
  const surveyName = values.survey_name_block?.survey_name?.value?.trim() || null;
  const questionFocus = values.question_focus_block?.question_focus?.value?.trim() || null;
  const uploadedFiles = values.file_upload_block?.file_upload?.files?.map(file => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    url: file.url_private
  })) || [];

  const data = {
    studyId,
    studyName,
    surveyName,
    questionFocus,
    uploadedFiles,
    channelId,
  };

  // Validate required fields
  if (!surveyName) {
    await client.chat.postMessage({
      channel: channelId,
      text: "❌ Survey name is required. Please provide a survey name and try again."
    });
    return;
  }

  // Validate files
  if (uploadedFiles.length === 0) {
    await client.chat.postMessage({
      channel: channelId,
      text: "❌ Please upload at least one survey file."
    });
    return;
  }

  try {
    // Process uploaded files to extract content
    const processedFiles = await processSlackFiles(uploadedFiles, process.env.SLACK_BOT_TOKEN);

    // Prepare documents array
    const documents = processedFiles.map(file => ({
      name: file.name,
      content: file.content,
      type: file.type,
      size: file.size
    }));

    // Validate documents
    const validation = validateDocuments(documents);
    if (!validation.isValid) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ ${validation.message}`
      });
      return;
    }

    // Parse documents into structured format
    const parsedDocuments = parseDocuments(documents);
    const formattedDocumentContent = parsedDocuments.structured_format;

    const surveyData = {
      selected_study: studyName,
      survey_name: surveyName,
      question_focus: questionFocus || '',
      combined_file_content: formattedDocumentContent,
      survey_files: uploadedFiles,
    };

    // Get the study
    const study = await getResearchStudyWithRoles(studyName);

    if (!study) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ Study "${studyName}" not found. Please verify the study name and try again.`
      });
      return;
    }

    // Fetch and process the YAML template for survey data
    const file = await fetchFileFromRepo(
      getConfigRepo(),
      YAML_TEMPLATE_PATH,
      "survey_synthesis.yaml" // Update this to your actual template filename
    );

    const renderedYaml = await processYamlTemplate(
      file.content,
      surveyData,
      study.path
    );

    const url = renderedYaml.result.url;

    // Generate and send result message
    const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'survey_data');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'survey_data');

  } catch (error) {
    console.error('Error processing survey data:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ There was an error processing your survey data: ${error.message}\n\nPlease try again or contact support.`
    });
  }
});

slackApp.view('upload_desk_research_modal', async ({ ack, view, body, client }) => {
  console.log("🚀 ~ upload-desk-research body:", body)
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName } = meta;

  // Extract study selection from dropdown if not in metadata
  const selectedStudy = values.study_select_block?.selected_study?.selected_option;
  if (selectedStudy) {
    studyName = selectedStudy.text.text;
  }

  console.log("🚀 ~ upload-desk-research submission studyName:", studyName);
  console.log("🚀 ~ view.state.values keys:", Object.keys(values));
  console.log("🚀 ~ file_upload_block:", values.file_upload_block);

  // Validate required fields
  if (!studyName) {
    await client.chat.postMessage({
      channel: channelId || body.channel?.id || body.user?.id,
      text: "❌ Study name is required but could not be determined. Please ensure you have a study selected or create one with `/qori-start`."
    });
    return;
  }

  if (!channelId) {
    await client.chat.postMessage({
      channel: body.channel?.id || body.user?.id,
      text: "❌ Channel ID is required but could not be determined. Please try again."
    });
    return;
  }

  // Extract uploaded files - using the correct block_id and action_id from the modal
  const uploadedFiles = values.file_upload_block?.file_upload?.files?.map(file => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    url: file.url_private
  })) || [];

  // Extract description and research focus if provided
  const description = values.description_block?.description?.value?.trim() || null;
  const researchFocus = values.research_focus_block?.research_topic?.value?.trim() || null;

  const data = {
    uploadedFiles: uploadedFiles,
    channelId: channelId,
    description: description,
    researchFocus: researchFocus,
  };
  console.log(`🚀 ~ desk research: study=${data.studyName}, files=${uploadedFiles.length}`);

  // Process the desk research
  try {
    // Validate files were uploaded
    if (uploadedFiles.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: "❌ Please upload at least one file to analyze."
      });
      return;
    }

    // Process uploaded files to extract content
    const processedFiles = await processSlackFiles(uploadedFiles, process.env.SLACK_BOT_TOKEN);

    // Prepare documents array
    const documents = processedFiles.map(file => ({
      name: file.name,
      content: file.content,
      type: file.type,
      size: file.size
    }));    
    
    // Validate documents first
    const validation = validateDocuments(documents);
    if (!validation.isValid) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ ${validation.message}`
      });
      return;
    }

    // Parse documents into structured format
    const parsedDocuments = parseDocuments(documents);
    
    // Create document summary and formatted content for AI prompts
    // const documentSummary = createDocumentSummary(documents);
    const formattedDocumentContent = parsedDocuments.structured_format;

    const deskResearchData = {
      research_topic: studyName,
      selected_study: studyName,
      description: studyName,
      document_content: formattedDocumentContent,
    };

    // TODO: Now you can pass this data to your YAML processor
    const study = await getResearchStudyWithRoles(studyName);
    
    if (!study) {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ Study "${studyName}" not found. Please verify the study name and try again.`
      });
      return;
    }

    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "desk_research.yaml");

    const renderedYaml = await processYamlTemplate(file.content, deskResearchData, study.path, 'desk-research');

    const url = renderedYaml.result.url;

    const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'desk');
    await sendStudyResultMessage(client, channelId, studyName, blocks, 'desk');

  } catch (error) {
    console.error('Error processing desk research:', error);
    await client.chat.postMessage({
      channel: channelId,
      text: `❌ There was an error processing your desk research: ${error.message}\n\nPlease try again or contact support.`
    });
  }
});

// discovery research (pre-study)
slackApp.command("/qori-discover", discoverHandler);
slackApp.view('discover_modal', handleDiscoverSubmission);

// participant outreach
slackApp.command("/qori-outreach", participantOutreachHandler);

// request research
slackApp.command("/qori-request", requestResearchHandler);

// add participant
slackApp.command("/qori-participants", participantHandler);

// update participant
slackApp.command("/qori-update-participant", updateParticipantHandler);

// session notes
// slackApp.command("/take-notes", sessionNotesHandler);
slackApp.command("/qori-notes", uploadNotesHandler);

// readout reports
slackApp.command("/qori-report", openReadoutModal);

// Tab switching
slackApp.action('tab_manual', handleTabManual);
slackApp.action('tab_upload', handleTabUpload);

// Handle session selection
slackApp.action('session_select_change', handleSessionSelectionChange);

// Handle session notes submission
slackApp.view("session_notes_submit", handleSessionNotesSubmission)

// readout modal handlers
slackApp.view("readout_modal_submit", handleReadoutModalSubmission);

// Handle readout modal interactions
slackApp.action(/^(select_research_readout|select_targeted_readouts|select_github_issues|study_selection_change|target_audience_change|timeline_change)$/, handleReadoutModalInteraction);
slackApp.action(/^(team_members_input)$/, handleReadoutModalInteraction);

// analyze notes
slackApp.command("/qori-analyze", analyzeNotesHandler)

// analyze notes modal submission handler
slackApp.view("analyze_notes_submit", handleAnalyzeNotesSubmission)

// analyze notes study selection change handler
slackApp.action("study_select_test", handleAnalyzeNotesStudyChange)

// analyze notes session selection change handler
slackApp.action("analyze_notes_session_select", handleAnalyzeNotesSessionChange)

// research synthesis
slackApp.command("/qori-synthesis", researchSynthesisHandler)

// research synthesis modal submission handler
slackApp.view("research-synthesis-modal", handleResearchSynthesisSubmission)

// research synthesis action handlers
slackApp.action("study_select_synthesize", handleStudySelectionChange)
slackApp.action("load_synthesis_files", handleLoadSynthesisFiles)

// update participant modal action handlers
// slackApp.action("update_participant_study_selection", handleParticipantStudySelectionChange)
slackApp.action("load_participants_button", handleLoadParticipantsButton)

// Handle individual file checkbox changes (using regex pattern)
slackApp.action(/^file_checkbox_/, handleFileCheckboxChange)


slackApp.command("/qori-observe", observeSessionHandler);
slackApp.view("participant-outreach-modal", handleParticipantOutreachSubmit);
slackApp.view("outreach_initial_recruitment_modal", handleInitialRecruitmentSubmit);
slackApp.view("outreach_rescheduling_modal", handleReschedulingRequestSubmit);
slackApp.view("outreach_session_confirmation_modal", handleSessionConfirmationSubmit);
slackApp.view("outreach_thank_you_modal", handleThankYouSubmit);
slackApp.view("outreach_follow_up_modal", handleFollowUpSubmit);
slackApp.view("outreach_session_reminder_modal", handleSessionReminderSubmit);
slackApp.view("add-participant-modal", handleAddParticipantSubmit);
slackApp.view("update-participant-status", handleUpdateParticipantSubmission);
slackApp.view("request_observe_session_modal", handleObserveSessionSubmission);

// Handle request research modal submission
slackApp.view("request_research_modal", handleRequestResearchSubmission);

// Handle "Create Brief from Request" button click
slackApp.action("create_brief_from_request", handleCreateBriefFromRequest);

// Handle "Create Study from Request" button click
slackApp.action("create_study_from_request", handleCreateStudyFromRequest);

// Handle "Create Research Study" button click from approved brief
slackApp.action("create_study_from_brief", async ({ ack, body, client }) => {
  await ack();

  try {
    const { studyName, briefUrl, briefData, channelId } = JSON.parse(body.actions[0].value);

    // If we have a requestedBy user ID, fetch user info to get display name
    // Otherwise, try to look up user by requestor_name
    let userDisplayName = briefData.requestor_name;
    let requestedByUserId = briefData.requestedBy;
    
    // If we don't have requestedBy but we have requestor_name, try to look it up
    if (!requestedByUserId && briefData.requestor_name) {
      try {
        const usersList = await client.users.list();
        const foundUser = usersList.members.find(u => 
          !u.is_bot && u.id !== 'USLACKBOT' && (
            (u.profile?.real_name && u.profile.real_name.toLowerCase().includes(briefData.requestor_name.toLowerCase())) ||
            (u.name && u.name.toLowerCase().includes(briefData.requestor_name.toLowerCase()))
          )
        );
        if (foundUser) {
          requestedByUserId = foundUser.id;
          userDisplayName = foundUser.profile?.real_name || foundUser.name || briefData.requestor_name;
        }
      } catch (error) {
        console.error("Error looking up user by name:", error);
      }
    }
    
    // If we have a requestedBy user ID, fetch user info to get display name
    // IMPORTANT: The display name must match exactly what the user_select options handler returns
    if (requestedByUserId) {
      try {
        const userInfo = await client.users.info({ user: requestedByUserId });
        userDisplayName = userInfo.user.profile?.real_name || userInfo.user.name || briefData.requestor_name;
      } catch (error) {
        console.error("Error fetching user info:", error);
      }
    }

    // Open create study modal with brief data pre-filled
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...createStudyModal({ 
          briefData: { 
            ...briefData, 
            briefUrl, 
            studyName,
            requestedBy: requestedByUserId, // Ensure requestedBy is included
            userDisplayName, // Add display name for the modal
          } 
        }),
        private_metadata: JSON.stringify({
          channelId,
          userId: body.user.id,
          isFromBrief: true,
          briefData: {
            ...briefData,
            briefUrl,
            studyName,
            requestedBy: requestedByUserId, // Ensure requestedBy is included
            userDisplayName,
          },
        }),
      },
    });
  } catch (error) {
    console.error("Error opening create study modal from brief:", error.data || error);
  }
});

// Observer modal button handler
slackApp.action("open_observer_modal", handleObserverModalButton);

// Upload notes modal button handlers
// slackApp.action("select_session_notes", handleSelectSessionNotes);

// Observer approval handlers
slackApp.action("approve_observer_request", handleObserverApproval)

slackApp.action("deny_observer_request", handleObserverDenial)

// Handle overflow menu for generating other message types
slackApp.action("generate_other_message_type", async ({ ack, body, client, action }) => {
  await ack();

  try {
    const selectedMessageType = action.selected_option.value;
    const { participantName, researcherName, researcherEmail, studyName } = JSON.parse(body.view.private_metadata || '{}');

    let nextModal;
    let modalName;

    switch (selectedMessageType) {
      case "session_confirmation":
        nextModal = sessionConfirmationModal;
        modalName = "session-confirmation";
        break;
      case "session_reminder":
        nextModal = sessionReminderModal;
        modalName = "session-reminder";
        break;
      case "rescheduling_request":
        nextModal = reschedulingRequestModal;
        modalName = "rescheduling-request";
        break;
      case "follow_up":
        nextModal = followupModal;
        modalName = "followup";
        break;
      case "thank_you":
        nextModal = thankyouModal;
        modalName = "thankyou";
        break;
      default:
        console.error("Invalid message type selected:", selectedMessageType);
        return;
    }

    // Open the selected modal with the existing participant data
    await client.views.push({
      trigger_id: body.trigger_id,
      view: {
        ...nextModal,
        private_metadata: JSON.stringify({
          studyName,
          participantName,
          researcherName,
          researcherEmail
        }),
      },
    });

  } catch (error) {
    console.error("Error opening message type modal:", error);
  }
});

// Copy email button handler
slackApp.action("copy_email_formatted", async ({ ack, body, client }) => {
  console.log("🚀 ~ body:", body)
  await ack();

  try {
    // Extract message body from the modal's private_metadata
    const view = body.view;
    const privateMetadata = view.private_metadata;
    let messageBody = "";

    if (privateMetadata) {
      try {
        const metadata = JSON.parse(privateMetadata);
        messageBody = metadata.messageBody || "";
      } catch (error) {
        console.error("Error parsing private_metadata:", error);
      }
    }

    console.log("🚀 ~ Opening copy email modal with messageBody:", messageBody);

    // Open the copy email modal with the message body
    await client.views.push({
      trigger_id: body.trigger_id,
      view: copyEmailModal({
        messageBody,
      }),
    });

  } catch (error) {
    console.error("Error opening copy email modal:", error);
  }
});





// 1️⃣ Slash command: open modal with just Folder picker
slackApp.command('/qori-sync', async ({ ack, command, client }) => {
  await ack();

  // stash channel for later
  const channelId = command.channel_id;
  const repoName = process.env.GITHUB_REPO;

  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'sync-folder-modal',
      title: { type: 'plain_text', text: 'Sync Folder' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ channelId, repoName }),
      blocks: [
        {
          type: 'input',
          block_id: 'sync_folder_block',
          dispatch_action: true,
          label: { type: 'plain_text', text: 'Folder' },
          element: {
            type: 'external_select',
            action_id: 'sync_folder_selected',
            placeholder: { type: 'plain_text', text: 'Select a folder…' },
            min_query_length: 0
          }
        }
      ]
    }
  });
});

// 2️⃣ Folder “type-ahead” options lookup
slackApp.options('sync_folder_selected', async ({ ack, body }) => {
  const { repoName } = JSON.parse(body.view.private_metadata);
  const folders = await listAllTopLevelFolders(repoName);

  const options = folders.map(f => ({
    text: { type: 'plain_text', text: f.name },
    value: f.path
  }));
  await ack({ options });
});

// 3️⃣ Folder selected → inject Sub-folder picker
slackApp.action('sync_folder_selected', async ({ ack, body, client }) => {
  await ack();

  const folderPath = body.actions[0].selected_option.value;
  const { channelId, repoName } = JSON.parse(body.view.private_metadata);

  // fetch sub-folders under that path
  const subfolders = await readFolderContents(folderPath, repoName);

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: {
      type: body.view.type,
      callback_id: body.view.callback_id,
      title: body.view.title,
      submit: body.view.submit,
      close: body.view.close,
      private_metadata: JSON.stringify({ channelId, repoName, folderPath }),
      blocks: [
        // Folder (pre-selected)
        {
          type: 'input',
          block_id: 'sync_folder_block',
          dispatch_action: true,
          label: body.view.blocks[0].label,
          element: {
            type: 'external_select',
            action_id: 'sync_folder_selected',
            initial_option: {
              text: { type: 'plain_text', text: body.actions[0].selected_option.text.text },
              value: folderPath
            },
            placeholder: body.view.blocks[0].element.placeholder,
            min_query_length: 0
          }
        },
        // Sub-folder picker
        {
          type: 'input',
          block_id: 'sync_subfolder_block',
          dispatch_action: true,
          label: { type: 'plain_text', text: 'Sub-folder' },
          element: {
            type: 'external_select',
            action_id: 'sync_subfolder_selected',
            placeholder: { type: 'plain_text', text: 'Select a sub-folder…' },
            min_query_length: 0
          }
        }
      ]
    }
  });
});

// 4️⃣ Sub-folder “type-ahead” options lookup
slackApp.options('sync_subfolder_selected', async ({ ack, body }) => {
  const { repoName, folderPath } = JSON.parse(body.view.private_metadata);
  const subs = await readFolderContents(folderPath, repoName);

  const options = subs.map(s => ({
    text: { type: 'plain_text', text: s.name },
    value: s.path
  }));

  await ack({ options });
});

// 5️⃣ Sub-folder selected → inject Research-folder picker
slackApp.action('sync_subfolder_selected', async ({ ack, body, client }) => {
  await ack();

  const subfolderPath = body.actions[0].selected_option.value;
  const { channelId, repoName, folderPath } = JSON.parse(body.view.private_metadata);

  // fetch research sub-folders under that path
  const researchPath = `${subfolderPath}/research`;
  const researchFolders = await readFolderContents(researchPath, repoName);

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: {
      type: body.view.type,
      callback_id: body.view.callback_id,
      title: body.view.title,
      submit: body.view.submit,
      close: body.view.close,
      private_metadata: JSON.stringify({ channelId, repoName, folderPath, subfolderPath }),
      blocks: [
        // Folder
        {
          type: 'input',
          block_id: 'sync_folder_block',
          dispatch_action: true,
          label: body.view.blocks[0].label,
          element: body.view.blocks[0].element
        },
        // Sub-folder
        {
          type: 'input',
          block_id: 'sync_subfolder_block',
          dispatch_action: true,
          label: body.view.blocks[1].label,
          element: body.view.blocks[1].element
        },
        // Research-folder picker
        {
          type: 'input',
          block_id: 'sync_research_block',
          label: { type: 'plain_text', text: 'Research Folder' },
          element: {
            type: 'external_select',
            action_id: 'sync_research_selected',
            placeholder: { type: 'plain_text', text: 'Select research folder…' },
            min_query_length: 0
          }
        }
      ]
    }
  });
});

// 6️⃣ Research-folder “type-ahead” options lookup
slackApp.options('sync_research_selected', async ({ ack, body }) => {
  const { repoName, subfolderPath } = JSON.parse(body.view.private_metadata);
  const researchPath = `${subfolderPath}/research`;
  const res = await readFolderContents(researchPath, repoName);

  const options = res.map(r => ({
    text: { type: 'plain_text', text: r.name },
    value: r.path
  }));

  await ack({ options });
});

// 7️⃣ On Submit → show “Processing…” then do your work
slackApp.view('sync-folder-modal', async ({ ack, body, view, client }) => {
  await ack();

  const { channelId, folderPath, subfolderPath } = JSON.parse(view.private_metadata);
  const folderSel = view.state.values.sync_folder_block.sync_folder_selected.selected_option;
  const subfolderSel = view.state.values.sync_subfolder_block.sync_subfolder_selected.selected_option;
  const researchSel = view.state.values.sync_research_block.sync_research_selected.selected_option;

  // Immediately let them know we’re working on it
  const placeholder = await client.chat.postMessage({
    channel: channelId,
    text: '⏳ Processing your request…'
  });
  const repo = process.env.GITHUB_REPO
  const files = await readFolders(`${folderSel.text.text}/${subfolderSel.text.text}/research/${researchSel.text.text}`, repo)

  for (const file of files) {
    // console.log("🚀 ~ slackApp.command ~ file:", file)
    const parts = file.path.split("/");
    await setupVectorStore(file.content, parts[3], file.path, file.sha)
  }

  // once done, update that placeholder
  await client.chat.update({
    channel: placeholder.channel,
    ts: placeholder.ts,
    text: `✅ Synced:
• research-folder: *${researchSel.text.text}*`
  });
});

// Handle "Mark Changes Complete" button click
slackApp.action('mark_changes_complete', handleMarkChangesCompleteAction);

// Handle "Mark Changes Complete" modal submission
slackApp.view('mark_changes_complete_modal', handleMarkChangesCompleteModal);
slackApp.action('approve_changes', handleApproveChanges);

// Slack event handling (you can add more Slack event handling logic here if needed)
slackApp.event("message", async ({ event, say }) => {
  console.log("🚀 ~ slackApp.event ~ event:", event);
  if (event.subtype && event.subtype === "bot_message") return; // Ignore bot messages

  punchService.punchMessage(event);

  // Do something with the message, like creating an event in your app or notifying users
  await say(`You said: ${event.text}`);
});

module.exports = { slackApp, slackExpressRouter };

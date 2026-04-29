const { createStudyModal } = require("../ui/createStudyModal");
const { getChannelConfigByChannelId } = require("../../../services/channel-config.service");
const { getConfigRepo, readFolders, copyFilesToFolder, fetchFileFromRepoByPath, createOrUpdateFileOnGitHub } = require("../../github");
const { addResearchStudyWithRoles } = require("../../../services/research_study.service");

/**
 * Handler for /start-research command
 * Opens the create study modal for creating a new study from scratch
 */
const startResearchHandler = async ({ ack, command, client, body }) => {
  await ack();

  try {
    const channelId = command.channel_id;
    const userId = command.user_id;

    // Open create study modal without pre-filled data
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...createStudyModal(),
        private_metadata: JSON.stringify({
          channelId,
          userId,
          isFromRequest: false,
        }),
      },
    });
  } catch (error) {
    console.error("Error opening create study modal:", error.data || error);
  }
};

/**
 * Handler for "Add Another Team Member" button
 * Dynamically adds a new user-role pair to the modal
 */
const handleAddTeamMember = async ({ ack, body, client }) => {
  await ack();

  try {
    const view = body.view;
    const blocks = Array.from(view.blocks);

    // Find the "add_user" button and count existing user blocks
    const addUserButtonIndex = blocks.findIndex(b => b.block_id === 'add_user');
    const existingUserCount = blocks.filter(b => b.block_id && b.block_id.startsWith('user_')).length;

    // Create new user-role pair blocks
    const newUserBlock = {
      type: "input",
      block_id: `user_${existingUserCount}`,
      label: {
        type: "plain_text",
        text: "User *",
      },
      element: {
        type: "external_select",
        action_id: "user_select",
        placeholder: {
          type: "plain_text",
          text: "Select a channel member",
        },
        min_query_length: 0,
      },
    };

    const newRoleBlock = {
      type: "input",
      block_id: `role_${existingUserCount}`,
      label: {
        type: "plain_text",
        text: "Role *",
      },
      element: {
        type: "static_select",
        action_id: "role_select",
        placeholder: {
          type: "plain_text",
          text: "Select role",
        },
        options: [
          {
            text: { type: "plain_text", text: "Stakeholder" },
            value: "stakeholder",
          },
          {
            text: { type: "plain_text", text: "PM" },
            value: "pm",
          },
          {
            text: { type: "plain_text", text: "Tech Lead" },
            value: "tech_lead",
          },
          {
            text: { type: "plain_text", text: "Designer" },
            value: "designer",
          },
          {
            text: { type: "plain_text", text: "Researcher" },
            value: "researcher",
          },
        ],
      },
    };

    // Insert new blocks before the "add_user" button
    blocks.splice(addUserButtonIndex, 0, newUserBlock, newRoleBlock);

    // Update the modal view - only include the clean view structure without metadata
    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      view: {
        type: view.type,
        callback_id: view.callback_id,
        title: view.title,
        submit: view.submit,
        close: view.close,
        blocks: blocks,
        private_metadata: view.private_metadata,
      },
    });
  } catch (error) {
    console.error("Error adding team member:", error);
  }
};

/**
 * Handler for create study modal submission
 * Creates GitHub folder and stores study in database
 */
const handleCreateStudySubmission = async ({ ack, body, view, client }) => {
  console.log('📝 Study submission received');
  
  // Acknowledge immediately to prevent timeout
  await ack();
  console.log('✅ Submission acknowledged');
  
  try {
    console.log('📋 View metadata:', view.private_metadata);
    
    const values = view.state.values;
    const metadata = JSON.parse(view.private_metadata);
    const { channelId, userId, isFromRequest, requestData } = metadata;
    
    console.log('📊 Parsed metadata:', { channelId, userId, isFromRequest, hasRequestData: !!requestData });

    // Extract form values
    const studyName = values.study_name.value.value;
    const researchType = values.research_type.value.selected_option.value;
    const startDate = values.start_date.value.selected_date;
    const endDate = values.end_date.value.selected_date;

    // Build user-role pairs
    const pairs = Object.keys(values)
      .filter(id => id.startsWith('user_'))
      .map(userBlockId => {
        const idx = userBlockId.split('_')[1];
        const userValue = values[userBlockId].user_select.selected_option?.value;
        const roleValue = values[`role_${idx}`].role_select.selected_option?.value;

        if (!userValue || !roleValue) return null;

        return {
          user: userValue,
          role: roleValue
        };
      })
      .filter(pair => pair !== null);
    
    console.log('👥 User-role pairs:', JSON.stringify(pairs, null, 2));

    // Get user profile information
    const userInfo = await client.users.info({ user: body.user.id });
    const userEmail = userInfo.user.profile.email || `${body.user.username}@slack.com`;

    // Create study with GitHub folder
    const info = await getChannelConfigByChannelId(channelId);
    const response = await readFolders('config/templates', getConfigRepo());
    const result = await copyFilesToFolder(
      response,
      `${info.sub_folder_name}/research`,
      studyName,
      process.env.GITHUB_REPO,
      info.product_folder_name
    );


    // Prepare payload for database
    const payload = {
      name: studyName,
      description: isFromRequest
        ? `Created from research request: ${requestData.project_title}`
        : `Research study created by ${userInfo.user.real_name}`,
      created_by: body.user.id,
      researcher_name: userInfo.user.real_name,
      researcher_email: userEmail,
      link: result.url,
      path: result.path,
      channel_name: channelId,
      research_type: researchType,
      start_date: startDate,
      end_date: endDate,
      assignments: pairs,
    };

    // Add source request data if creating from request
    if (isFromRequest && requestData) {
      payload.source_request = requestData;
    }

    await addResearchStudyWithRoles(payload);

    // Notify team members
    for (const { user, role } of pairs) {
      try {
        // Validate that user looks like a Slack user ID (starts with U)
        if (!user || !user.startsWith('U')) {
          console.warn(`⚠️ Skipping invalid user ID: ${user}`);
          continue;
        }

        const notificationBlocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔔 Hey <@${user}>, *${studyName}* has been created!`
            },
          },
        ];

        // Add request info if from request
        if (isFromRequest && requestData) {
          notificationBlocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Original Request:* ${requestData.project_title}\n*Submitted by:* ${requestData.prepared_by}`
            },
          });
        }

        notificationBlocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${result.url}|:github: View on GitHub>`,
          },
        });

        await client.chat.postMessage({
          channel: user,
          text: `🔔 Study ${studyName} has been created!`,
          blocks: notificationBlocks,
        });
        
        console.log(`✅ Notification sent to user ${user} (${role})`);
      } catch (notifyError) {
        console.error(`⚠️ Failed to notify user ${user}:`, notifyError.message);
        // Continue with other notifications even if one fails
      }
    }

    // Notify the original requester if from request
    if (isFromRequest && requestData && requestData.requestedBy) {
      try {
        await client.chat.postMessage({
          channel: requestData.requestedBy,
          text: `✅ Great news! Your research request has been approved and a study has been created.\n\n*Study Name:* ${studyName}\n*Project:* ${requestData.project_title}\n\nThe research team will be in touch soon with next steps.`,
        });
        console.log(`✅ Requester notification sent to ${requestData.requestedBy}`);
      } catch (requesterError) {
        console.error(`⚠️ Failed to notify requester:`, requesterError.message);
      }
    }

    // Send success message to channel
    const successMessage = isFromRequest
      ? `✅ Study *${studyName}* has been created from the research request!`
      : `✅ Study *${studyName}* has been created successfully!`;

    try {
      await client.chat.postMessage({
        channel: channelId,
        text: successMessage,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *Study Created Successfully*\n\n*Study Name:* ${studyName}\n*Research Type:* ${researchType}\n*Timeline:* ${startDate} → ${endDate}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<${result.url}|:github: View on GitHub>`,
            },
          },
        ],
      });
      console.log(`✅ Success message sent to channel ${channelId}`);
    } catch (channelError) {
      console.error(`⚠️ Failed to send success message to channel:`, channelError.message);
      // Don't throw - study was already created successfully
    }
    
    console.log(`🎉 Study "${studyName}" created successfully!`);

  } catch (error) {
    console.error('❌ Error creating study:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    try {
      await client.chat.postMessage({
        channel: body.user.id,
        text: `❌ There was an error creating the study: ${error.message}\n\nPlease try again or contact support.`
      });
    } catch (notificationError) {
      console.error('❌ Failed to send error notification:', notificationError);
    }
  }
};

module.exports = {
  startResearchHandler,
  handleAddTeamMember,
  handleCreateStudySubmission,
};


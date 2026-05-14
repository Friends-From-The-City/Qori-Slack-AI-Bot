import type { SlashCommandContext, BlockActionContext, ViewSubmissionContext } from '../../../types/handlers';

const { createStudyModal } = require('../ui/createStudyModal');
const { getChannelConfigByChannelId } = require('../../../services/channel-config.service');
const { getConfigRepo, readFolders, copyFilesToFolder } = require('../../github');
const { addResearchStudyWithRoles } = require('../../../services/research_study.service');

// ─── Types ──────────────────────────────────────────────────────────

interface UserRolePair {
  user: string;
  role: string;
}

interface CreateStudyMetadata {
  channelId: string;
  userId: string;
  isFromRequest: boolean;
  requestData?: {
    project_title: string;
    prepared_by: string;
    requestedBy?: string;
  };
}

// ─── Handlers ───────────────────────────────────────────────────────

/**
 * Handler for /qori-start command.
 * Opens the create study modal for creating a new study from scratch.
 */
async function startResearchHandler({ ack, command, client, body }: SlashCommandContext) {
  await ack();

  try {
    const channelId = command.channel_id;
    const userId = command.user_id;

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
  } catch (error: any) {
    console.error('Error opening create study modal:', error.data || error);
  }
}

/**
 * Handler for "Add Another Team Member" button.
 * Dynamically adds a new user-role pair to the modal.
 */
async function handleAddTeamMember({ ack, body, client }: BlockActionContext) {
  await ack();

  try {
    const view = body.view!;
    const blocks = Array.from(view.blocks);

    const addUserButtonIndex = blocks.findIndex((b: any) => b.block_id === 'add_user');
    const existingUserCount = blocks.filter((b: any) => b.block_id?.startsWith('user_')).length;

    const newUserBlock = {
      type: 'input',
      block_id: `user_${existingUserCount}`,
      label: { type: 'plain_text', text: 'User *' },
      element: {
        type: 'external_select',
        action_id: 'user_select',
        placeholder: { type: 'plain_text', text: 'Select a channel member' },
        min_query_length: 0,
      },
    };

    const newRoleBlock = {
      type: 'input',
      block_id: `role_${existingUserCount}`,
      label: { type: 'plain_text', text: 'Role *' },
      element: {
        type: 'static_select',
        action_id: 'role_select',
        placeholder: { type: 'plain_text', text: 'Select role' },
        options: [
          { text: { type: 'plain_text', text: 'Stakeholder' }, value: 'stakeholder' },
          { text: { type: 'plain_text', text: 'PM' }, value: 'pm' },
          { text: { type: 'plain_text', text: 'Tech Lead' }, value: 'tech_lead' },
          { text: { type: 'plain_text', text: 'Designer' }, value: 'designer' },
          { text: { type: 'plain_text', text: 'Researcher' }, value: 'researcher' },
        ],
      },
    };

    blocks.splice(addUserButtonIndex, 0, newUserBlock, newRoleBlock);

    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      view: {
        type: view.type as 'modal',
        callback_id: view.callback_id,
        title: view.title as any,
        submit: view.submit as any,
        close: view.close as any,
        blocks,
        private_metadata: view.private_metadata,
      },
    });
  } catch (error: any) {
    console.error('Error adding team member:', error);
  }
}

/**
 * Handler for create study modal submission.
 * Creates GitHub folder scaffold and stores study in database.
 */
async function handleCreateStudySubmission({ ack, body, view, client }: ViewSubmissionContext) {
  console.log('📝 Study submission received');
  await ack();
  console.log('✅ Submission acknowledged');

  try {
    const values = view.state.values;
    const metadata: CreateStudyMetadata = JSON.parse(view.private_metadata || '{}');
    const { channelId, userId, isFromRequest, requestData } = metadata;

    console.log('📊 Parsed metadata:', { channelId, userId, isFromRequest, hasRequestData: !!requestData });

    // Extract form values — Bolt view state values are loosely typed
    const studyName = values.study_name.value.value as string;
    const researchType = values.research_type.value.selected_option!.value as string;
    const startDate = values.start_date.value.selected_date as string;
    const endDate = values.end_date.value.selected_date as string;

    // Build user-role pairs
    const pairs: UserRolePair[] = Object.keys(values)
      .filter(id => id.startsWith('user_'))
      .map(userBlockId => {
        const idx = userBlockId.split('_')[1];
        const userValue = values[userBlockId].user_select.selected_option?.value;
        const roleValue = values[`role_${idx}`].role_select.selected_option?.value;
        if (!userValue || !roleValue) return null;
        return { user: userValue, role: roleValue };
      })
      .filter((pair): pair is UserRolePair => pair !== null);

    console.log('👥 User-role pairs:', JSON.stringify(pairs, null, 2));

    // Get user profile information
    const userInfo = await client.users.info({ user: body.user.id });
    const user = userInfo.user as Record<string, any>;
    const userEmail: string = user.profile?.email || `${user.name}@slack.com`;

    // Create study with GitHub folder
    const info = await getChannelConfigByChannelId(channelId);
    const response = await readFolders('config/templates', getConfigRepo());
    const result = await copyFilesToFolder(
      response,
      `${info.sub_folder_name}/research`,
      studyName,
      process.env.GITHUB_REPO,
      info.product_folder_name,
    );

    // Prepare payload for database
    const payload: Record<string, any> = {
      name: studyName,
      description: isFromRequest
        ? `Created from research request: ${requestData!.project_title}`
        : `Research study created by ${user.real_name}`,
      created_by: body.user.id,
      researcher_name: user.real_name,
      researcher_email: userEmail,
      link: result.url,
      path: result.path,
      channel_name: channelId,
      research_type: researchType,
      start_date: startDate,
      end_date: endDate,
      assignments: pairs,
    };

    if (isFromRequest && requestData) {
      payload.source_request = requestData;
    }

    await addResearchStudyWithRoles(payload);

    // Notify team members
    for (const { user: memberId, role } of pairs) {
      try {
        if (!memberId || !memberId.startsWith('U')) {
          console.warn(`⚠️ Skipping invalid user ID: ${memberId}`);
          continue;
        }

        const notificationBlocks: any[] = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `🔔 Hey <@${memberId}>, *${studyName}* has been created!` },
          },
        ];

        if (isFromRequest && requestData) {
          notificationBlocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Original Request:* ${requestData.project_title}\n*Submitted by:* ${requestData.prepared_by}` },
          });
        }

        notificationBlocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `<${result.url}|:github: View on GitHub>` },
        });

        await client.chat.postMessage({
          channel: memberId,
          text: `🔔 Study ${studyName} has been created!`,
          blocks: notificationBlocks,
        });

        console.log(`✅ Notification sent to user ${memberId} (${role})`);
      } catch (notifyError: any) {
        console.error(`⚠️ Failed to notify user ${memberId}:`, notifyError.message);
      }
    }

    // Notify the original requester if from request
    if (isFromRequest && requestData?.requestedBy) {
      try {
        await client.chat.postMessage({
          channel: requestData.requestedBy,
          text: `✅ Great news! Your research request has been approved and a study has been created.\n\n*Study Name:* ${studyName}\n*Project:* ${requestData.project_title}\n\nThe research team will be in touch soon with next steps.`,
        });
        console.log(`✅ Requester notification sent to ${requestData.requestedBy}`);
      } catch (requesterError: any) {
        console.error('⚠️ Failed to notify requester:', requesterError.message);
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
            type: 'section',
            text: { type: 'mrkdwn', text: `✅ *Study Created Successfully*\n\n*Study Name:* ${studyName}\n*Research Type:* ${researchType}\n*Timeline:* ${startDate} → ${endDate}` },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `<${result.url}|:github: View on GitHub>` },
          },
        ],
      });
      console.log(`✅ Success message sent to channel ${channelId}`);
    } catch (channelError: any) {
      console.error('⚠️ Failed to send success message to channel:', channelError.message);
    }

    console.log(`🎉 Study "${studyName}" created successfully!`);
  } catch (error: any) {
    console.error('❌ Error creating study:', error);
    console.error('Error stack:', error.stack);

    try {
      await client.chat.postMessage({
        channel: body.user.id,
        text: `❌ There was an error creating the study: ${error.message}\n\nPlease try again or contact support.`,
      });
    } catch (notificationError: any) {
      console.error('❌ Failed to send error notification:', notificationError);
    }
  }
}

module.exports = {
  startResearchHandler,
  handleAddTeamMember,
  handleCreateStudySubmission,
};

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { requestResearchModal } from '../ui/requestResearchModal';
import { createStudyFromRequestModal } from '../ui/createStudyFromRequestModal';
import { researchBriefModal } from '../ui/researchBriefModal';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../github';
import { processYamlTemplate } from '../../yamlProcessor';
import type { View } from '@slack/types';

// ─── Types ──────────────────────────────────────────────────────────

interface RequestMetadata {
  channelId: string;
  userId: string;
  userName: string;
  userTitle: string;
}

interface RequestData {
  project_title: string;
  problem_description: string;
  affected_users: string;
  decisions_to_inform: string;
  urgency: string;
  deadline: string;
  existing_knowledge: string;
  prepared_by: string;
  requestor_name: string;
  requestedBy: string;
  channelId: string;
  timelineNeeded: string;
  requestUrl?: string;
  requestPath?: string;
  submittedBy?: string;
  projectTitle?: string;
}

// ─── Handlers ───────────────────────────────────────────────────────

/**
 * Handler for /request-research command.
 * Opens the research request modal with pre-filled user information.
 */
async function requestResearchHandler({ ack, command, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  await ack();

  try {
    const userInfo = await client.users.info({ user: command.user_id });
    const user = userInfo.user as Record<string, any>;
    const userName = user.real_name || user.name;
    const userTitle = user.profile?.title || 'Team Member';
    const displayName = userTitle ? `${userName}, ${userTitle}` : userName;

    const modalView = JSON.parse(JSON.stringify(requestResearchModal));

    // Set initial_user on users_select
    const submittedByBlock = modalView.blocks.find((block: any) => block.block_id === 'submitted_by_block');
    if (submittedByBlock) {
      submittedByBlock.element.initial_user = command.user_id;
    }

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        ...modalView,
        private_metadata: JSON.stringify({
          channelId: command.channel_id,
          userId: command.user_id,
          userName,
          userTitle,
        }),
      } as View,
    });
  } catch (error) {
    const detail = (error as Record<string, unknown>)?.data ?? error;
    console.error('Error opening request research modal:', detail);
  }
}

/**
 * Handler for research request modal submission.
 * Processes the request and sends notifications to relevant parties.
 */
async function handleRequestResearchSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
  await ack();

  const values = view.state.values;
  const { channelId, userId }: RequestMetadata = JSON.parse(view.private_metadata || '{}');

  // Helper to extract values from different input types
  const extract = (blockId: string, actionId: string): string => {
    const block = values[blockId];
    if (!block) return '';
    const action = block[actionId];
    if (!action) return '';
    if (action.value !== undefined && action.value !== null) return action.value;
    if (action.selected_option !== undefined && action.selected_option !== null) return action.selected_option.value;
    if (action.selected_date !== undefined && action.selected_date !== null) return action.selected_date;
    return '';
  };

  // Resolve submitted-by user from users_select
  const submittedByUserId: string | null =
    values.submitted_by_block?.submitted_by_select?.selected_user || null;
  let submittedByName = '';
  if (submittedByUserId) {
    try {
      const subInfo = await client.users.info({ user: submittedByUserId });
      const subUser = subInfo.user as Record<string, any> | undefined;
      submittedByName = subUser?.real_name || subUser?.profile?.display_name || subUser?.name || submittedByUserId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not resolve submitted-by display name:', message);
      submittedByName = submittedByUserId;
    }
  }

  const requestData: RequestData = {
    project_title: extract('project_title_block', 'project_title_input'),
    problem_description: extract('problem_description_block', 'problem_description_input'),
    affected_users: extract('affected_users_block', 'affected_users_input'),
    decisions_to_inform: extract('decisions_block', 'decisions_input'),
    urgency: extract('urgency_block', 'urgency_select'),
    deadline: extract('deadline_block', 'deadline_picker'),
    existing_knowledge: extract('existing_knowledge_block', 'existing_knowledge_input'),
    prepared_by: submittedByName,
    requestor_name: submittedByName,
    requestedBy: userId,
    channelId,
    timelineNeeded: extract('urgency_block', 'urgency_select'),
  };

  console.log('📬 Research Request Submitted:', requestData);

  try {
    const userInfo = await client.users.info({ user: userId });
    const user = userInfo.user as Record<string, any>;
    const submitterName = user.real_name || user.name;

    // Process YAML template to create the research request file
    let requestUrl: string | null = null;
    let requestPath: string | null = null;
    try {
      const yamlFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'research_request.yaml');

      const sanitizedTitle = (requestData.project_title || 'research-request')
        .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const renderedYaml = await processYamlTemplate(
        yamlFile.content,
        requestData,
        sanitizedTitle,
        'research-requests',
      );

      requestUrl = renderedYaml.result.url;
      requestPath = renderedYaml.result.path;

      console.log('✅ Research request file created:', requestUrl);
    } catch (yamlError) {
      console.error('⚠️ Error processing research request YAML:', yamlError);
    }

    // Send confirmation to the user
    await client.chat.postMessage({
      channel: userId,
      text: `✅ *Your research request has been submitted!*\n\n*Project:* ${requestData.project_title}\n\nThe research team will review your request and get back to you soon.${requestUrl ? `\n\n📄 <${requestUrl}|View Request on GitHub>` : ''}`,
    });

    // Send notification to research team channel
    const researchTeamChannelId = process.env.RESEARCH_TEAM_CHANNEL_ID;
    const isValidChannelId = researchTeamChannelId && researchTeamChannelId !== 'C1234567890';

    if (!isValidChannelId) {
      console.warn('⚠️ RESEARCH_TEAM_CHANNEL_ID not configured — skipping research team notification.');
    }

    const notificationBlocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📬 New Research Request', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*From:* <@${userId}>\n*Project:* ${requestData.project_title}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Problem/Opportunity:*\n${(requestData.problem_description || '').substring(0, 200)}${(requestData.problem_description || '').length > 200 ? '...' : ''}` },
          { type: 'mrkdwn', text: `*Urgency:*\n${requestData.urgency ? requestData.urgency.charAt(0).toUpperCase() + requestData.urgency.slice(1) : 'Not specified'}` },
        ],
      },
      ...(requestData.affected_users ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*Affected Users:*\n${requestData.affected_users}` },
      }] : []),
    ];

    if (requestUrl) {
      notificationBlocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `📄 <${requestUrl}|View Full Research Request on GitHub>` },
      });
    }

    notificationBlocks.push(
      { type: 'divider' },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: '📄 Create Brief from Request', emoji: true },
          style: 'primary',
          action_id: 'create_brief_from_request',
          value: JSON.stringify({ ...requestData, requestUrl, requestPath }),
        }],
      },
    );

    if (isValidChannelId) {
      try {
        await client.chat.postMessage({
          channel: researchTeamChannelId!,
          text: `📬 New Research Request from ${submitterName}`,
          blocks: notificationBlocks,
        });
        console.log(`✅ Research request notification sent to channel ${researchTeamChannelId}`);
      } catch (channelError) {
        const message = channelError instanceof Error ? channelError.message : String(channelError);
        console.error(`❌ Failed to send research team notification to ${researchTeamChannelId}:`, message);
      }
    }
  } catch (error) {
    console.error('Error processing research request:', error);
    await client.chat.postMessage({
      channel: userId,
      text: '❌ There was an error submitting your research request. Please try again or contact support.',
    });
  }
}

/**
 * Handler for "Create Brief from Request" button click.
 * Opens the research brief modal with pre-filled data from the request.
 */
async function handleCreateBriefFromRequest({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();

  try {
    const requestData: RequestData = JSON.parse((body.actions![0] as any).value);
    const channelId = body.channel!.id;
    const userId = body.user.id;

    const modalView = JSON.parse(JSON.stringify(researchBriefModal));

    const filteredBlocks = modalView.blocks.filter((block: any) => {
      if (block.block_id === 'request_link_block' && !requestData.requestUrl) return false;
      if (block.block_id === 'stakeholder_block' && !requestData.prepared_by) return false;
      return true;
    });

    filteredBlocks.forEach((block: any) => {
      if (block.type === 'input' && block.block_id) {
        if (block.block_id === 'study_title_block' && block.element?.action_id === 'study_title_input') {
          block.element.initial_value = requestData.project_title || '';
          block.hint = { type: 'plain_text', text: 'Auto-filled from research request' };
        } else if (block.block_id === 'stakeholder_block' && block.element?.action_id === 'stakeholder_input') {
          block.element.initial_value = requestData.prepared_by || '';
        } else if (block.element) {
          delete block.element.initial_value;
          delete block.element.initial_date;
        }
      } else if (block.type === 'section' && block.block_id === 'request_link_block' && requestData.requestUrl) {
        block.text.text = `<${requestData.requestUrl}|:page_facing_up: View original research request on GitHub>`;
      }
    });

    modalView.blocks = filteredBlocks;

    console.log('📄 Opening research brief modal with pre-filled data from request');

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...modalView,
        private_metadata: JSON.stringify({
          channelId,
          userId,
          isFromRequest: true,
          requestData,
          studyName: requestData.project_title || 'Research Request',
        }),
      } as View,
    });
  } catch (error) {
    const detail = (error as Record<string, unknown>)?.data ?? error;
    console.error('Error opening research brief modal from request:', detail);
  }
}

/**
 * Handler for "Create Study from Request" button click.
 * Opens the create study modal with pre-filled data from the request.
 */
async function handleCreateStudyFromRequest({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();

  try {
    const requestData: RequestData = JSON.parse((body.actions![0] as any).value);
    const channelId = body.channel!.id;
    const userId = body.user.id;

    if (requestData.prepared_by && !requestData.submittedBy) {
      requestData.submittedBy = requestData.prepared_by;
    }
    if (requestData.project_title && !requestData.projectTitle) {
      requestData.projectTitle = requestData.project_title;
    }

    console.log('📋 Opening create study modal with data:', {
      prepared_by: requestData.prepared_by,
      submittedBy: requestData.submittedBy,
      projectTitle: requestData.projectTitle,
      project_title: requestData.project_title,
    });

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...createStudyFromRequestModal(requestData),
        private_metadata: JSON.stringify({
          channelId,
          userId,
          isFromRequest: true,
          requestData,
        }),
      } as View,
    });
  } catch (error) {
    const detail = (error as Record<string, unknown>)?.data ?? error;
    console.error('Error opening create study from request modal:', detail);
  }
}

export {
  requestResearchHandler,
  handleRequestResearchSubmission,
  handleCreateBriefFromRequest,
  handleCreateStudyFromRequest,
};

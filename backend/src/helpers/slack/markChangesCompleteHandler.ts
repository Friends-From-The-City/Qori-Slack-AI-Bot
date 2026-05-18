import type { BlockActionContext, ViewSubmissionContext } from '../../types/handlers';
import type { WebClient } from '@slack/web-api';
import type { BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { getStudyStatusById, addStudyStatus } from '../../services/study-status.service';
import { markChangesCompleteModal } from './ui/markChangesCompleteModal';

interface ActionPayload {
  fileName: string;
  statusId: number;
}

interface ApprovePayload {
  statusId: number;
  studyName: string;
  fileName: string;
  path: string;
  user: string;
}

interface StudyStatus {
  id: number;
  requested_by?: string;
  created_by?: string;
  study_name?: string;
  file_name?: string;
  path?: string;
  [key: string]: unknown;
}

export async function handleMarkChangesCompleteAction({
  ack,
  body,
  client,
}: BlockActionContext): Promise<void> {
  await ack();
  const action = (body as BlockAction).actions[0];
  const { fileName, statusId } = JSON.parse((action as { value: string }).value) as ActionPayload;
  const status = (await getStudyStatusById(statusId)) as StudyStatus | null;
  let requestedBy: string | null = null;
  if (status && status.requested_by) {
    try {
      const userInfo = await client.users.info({ user: status.requested_by });
      requestedBy = (userInfo.user as { real_name?: string; name: string }).real_name ||
        (userInfo.user as { name: string }).name;
    } catch (err: unknown) {
      requestedBy = status.requested_by;
    }
  }
  const filePath = status?.path ?? '';
  await client.views.open({
    trigger_id: (body as BlockAction).trigger_id,
    view: markChangesCompleteModal(fileName, filePath, statusId, requestedBy) as View,
  });
}

export async function handleMarkChangesCompleteModal({
  ack,
  body,
  view,
  client,
}: ViewSubmissionContext): Promise<void> {
  await ack();
  const { fileName, statusId } = JSON.parse(view.private_metadata) as ActionPayload;
  const values = view.state.values;
  const changesMade = values.changes_made_block?.changes_made?.value || '';
  const status = (await getStudyStatusById(statusId)) as StudyStatus | null;

  if (!status) {
    console.error('Status not found for ID:', statusId);
    return;
  }

  if (status.requested_by) {
    try {
      console.log('Attempting to send notification to user:', status.requested_by);

      let userInfo;
      try {
        userInfo = await client.users.info({ user: status.requested_by });
        console.log('User info retrieved:', (userInfo.user as { name: string }).name);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('User not found or not accessible:', status.requested_by, message);
        return;
      }

      let completerName = '';
      try {
        const completerInfo = await client.users.info({
          user: (body as ViewSubmitAction).user.id,
        });
        completerName =
          (completerInfo.user as { real_name?: string; name: string }).real_name ||
          (completerInfo.user as { name: string }).name;
      } catch (err: unknown) {
        completerName = `<@${(body as ViewSubmitAction).user.id}>`;
      }

      const filePath = status.path;
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${completerName} completed your requested changes*`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${status.study_name}* \u2022 Iteration #1`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Changes made:* ${changesMade}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Files updated:* ${status.file_name}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${filePath}|View Changes>`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Approve',
              },
              style: 'primary',
              value: JSON.stringify({
                statusId: status.id,
                studyName: status.study_name,
                fileName: status.file_name,
                path: status.path,
                user: (body as ViewSubmitAction).user.id,
              }),
              action_id: 'approve_changes',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Request More Changes' },
              value: JSON.stringify({ statusId: status.id }),
              action_id: 'request_more_changes',
            },
          ],
        },
      ];

      const imRes = await client.conversations.open({ users: status.requested_by });
      const channelId = (imRes.channel as { id: string }).id;
      await client.chat.postMessage({
        channel: channelId,
        text: `${completerName} completed your requested changes for ${status.study_name}`,
        blocks,
      });

      console.log('Notification sent successfully to user:', status.requested_by);
    } catch (err: unknown) {
      console.error('Error sending notification:', err);
    }
  } else {
    console.log('No requested_by user found for status:', status.id);
  }
}

// Approve button handler
export async function handleApproveChanges({
  ack,
  body,
  action,
  client,
}: BlockActionContext): Promise<void> {
  await ack();
  let payload: ApprovePayload;
  try {
    payload = JSON.parse((action as { value: string }).value) as ApprovePayload;
  } catch (err: unknown) {
    return;
  }

  await addStudyStatus({
    approved_by: (body as BlockAction).user.id,
    status: 'approve',
    file_name: payload.fileName,
  });

  const status = (await getStudyStatusById(payload.statusId)) as StudyStatus | null;
  if (status && status.created_by) {
    let approverName = '';
    try {
      const userInfo = await client.users.info({ user: (body as BlockAction).user.id });
      approverName =
        (userInfo.user as { real_name?: string; name: string }).real_name ||
        (userInfo.user as { name: string }).name;
    } catch (err: unknown) {
      approverName = `<@${(body as BlockAction).user.id}>`;
    }
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Your changes have been approved by ${approverName}*`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${status.study_name}* \u2022 File: ${status.file_name}`,
        },
      },
    ];
    const imRes = await client.conversations.open({ users: status.created_by });
    const channelId = (imRes.channel as { id: string }).id;
    await client.chat.postMessage({
      channel: channelId,
      text: `Your changes have been approved by ${approverName}`,
      blocks,
    });
  }
}

import type { WebClient } from '@slack/web-api';
import type { BlockAction, ViewSubmitAction, ViewResponseAction, AckFn } from '@slack/bolt';
import type { View } from '@slack/types';
import { requestStudyChangesModal } from './ui/requestStudyChangesModal';
// Phase B Step 3: getStudyByProjectAndName for FK-based study lookup in brief approval
// resolveStudyFromName retained for other flows (request changes, non-brief approvals) — migrate in future step
import { getStudyByProjectAndName, resolveStudyFromName } from '../../services/research_study.service';
import { getProjectByChannelId } from '../../services/project.service';

import { addStudyStatus, getStudyStatusByStudyId } from '../../services/study-status.service';

type DocumentType = 'plan' | 'brief' | 'discussion';

interface ActionValue {
  studyName: string;
  channelId: string;
  url: string;
  briefData?: Record<string, unknown>;
}

interface ModalMetadata {
  studyName: string;
  channelId: string;
  url: string;
  type: DocumentType;
}

interface FileOption {
  key: string;
  label: string;
}

interface StudyStatus {
  id: number;
  file_name?: string;
  [key: string]: unknown;
}

interface ResearchStudy {
  path?: string;
  created_by?: string;
  [key: string]: unknown;
}

const typeLabels: Record<DocumentType, string> = {
  plan: 'research plan',
  brief: 'research brief',
  discussion: 'discussion guide',
};

// Generic function to handle approve for plan, brief, and discussion
export async function handleApprove(
  body: BlockAction,
  client: WebClient,
  type: DocumentType,
): Promise<void> {
  const { studyName, channelId, url, briefData } = JSON.parse(
    (body.actions[0] as { value: string }).value,
  ) as ActionValue;

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal' as const,
      callback_id: `confirm_approve_${type}`,
      private_metadata: JSON.stringify({ studyName, channelId, url, type, briefData }),
      title: { type: 'plain_text' as const, text: 'Confirm Approval' },
      close: { type: 'plain_text' as const, text: 'Cancel' },
      submit: { type: 'plain_text' as const, text: 'Approve' },
      blocks: [
        {
          type: 'section' as const,
          text: {
            type: 'mrkdwn' as const,
            text: `Are you sure you want to *approve* the ${typeLabels[type]} for *${studyName}*?`,
          },
        },
      ],
    },
  });
}

// Generic function to handle approve modal submission
export async function handleApproveSubmission(
  ack: AckFn<ViewResponseAction>,
  view: ViewSubmitAction['view'],
  body: ViewSubmitAction,
  client: WebClient,
): Promise<void> {
  await ack();
  const { studyName, channelId, url, type, briefData } = JSON.parse(view.private_metadata) as ModalMetadata & { briefData?: Record<string, unknown> };
  const user = body.user.id;

  const typeLabelMap: Record<string, string> = {
    plan: 'plan',
    brief: 'brief',
    discussion: 'discussion guide',
  };

  // Look up study first to get study_id for addStudyStatus (required by NOT NULL constraint)
  let studyId: number | null = null;
  let existingStudy: ResearchStudy | null = null;
  let projectId: number | null = null;

  if (type === 'brief') {
    // Brief approval: use project-based lookup
    const project = await getProjectByChannelId(channelId);
    projectId = project?.id ?? null;
    if (project) {
      const study = await getStudyByProjectAndName(project.id, studyName);
      if (study && study.path) {
        existingStudy = study as unknown as ResearchStudy;
        studyId = study.id;
      }
    }
  } else {
    // Plan/discussion approval: use name-based lookup
    const resolved = await resolveStudyFromName(studyName);
    if (resolved) {
      studyId = resolved.studyId;
      existingStudy = resolved.study as unknown as ResearchStudy;
    }
  }

  await addStudyStatus({
    study_id: studyId ?? undefined,
    path: url,
    approved_by: user,
    status: 'approve',
  });

  if (type === 'brief') {
    const researchTeamChannelId = process.env.RESEARCH_TEAM_CHANNEL_ID || channelId;

    const studyExists = !!(existingStudy && existingStudy.path);

    let ctaButton;
    if (studyExists && studyId && projectId) {
      ctaButton = {
        type: 'button',
        text: { type: 'plain_text', text: 'Create Research Plan', emoji: true },
        style: 'primary',
        action_id: 'create_research_plan_from_brief',
        value: JSON.stringify({ studyName, studyId, projectId, briefUrl: url, channelId: researchTeamChannelId }),
      };
    } else {
      const briefDataForStudy = briefData || { project_title: studyName, brief_url: url };
      ctaButton = {
        type: 'button',
        text: { type: 'plain_text', text: 'Create Research Study', emoji: true },
        style: 'primary',
        action_id: 'create_study_from_brief',
        value: JSON.stringify({
          studyName,
          briefUrl: url,
          briefData: briefDataForStudy,
          channelId: researchTeamChannelId,
        }),
      };
    }

    const nextStepText = studyExists
      ? 'The research brief has been approved. Next step: create the research plan.'
      : 'The research brief has been approved. Next step: create the research study.';

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks: any[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Research Brief Approved \u2014 ${studyName}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Approved by:* <@${user}>\n*Brief:* <${url}|View on GitHub>`,
          },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: nextStepText },
        },
        {
          type: 'actions',
          elements: [ctaButton],
        },
      ];
      await client.chat.postMessage({
        channel: researchTeamChannelId,
        text: `*Research Brief Approved*\n\n*Study:* ${studyName}\n*Approved by:* <@${user}>`,
        blocks,
      });
    } catch (err: unknown) {
      console.error('Failed to send approval message to research team:', err);
      await client.chat.postMessage({
        channel: channelId,
        text: `*${studyName}* ${typeLabelMap[type]} approved by <@${user}>!`,
      });
    }

    if (existingStudy && existingStudy.created_by) {
      try {
        const im = await client.conversations.open({ users: existingStudy.created_by });
        const dmText = studyExists
          ? `*${studyName}* research brief approved by <@${user}>! You can now create the research plan.`
          : `*${studyName}* research brief approved by <@${user}>! The research team has been notified to create the study.`;
        await client.chat.postMessage({
          channel: (im.channel as { id: string }).id,
          text: dmText,
        });
      } catch (err: unknown) {
        console.error('Failed to send DM to study creator:', err);
      }
    }
  } else {
    const resolvedStudy = await resolveStudyFromName(studyName);
    const study = resolvedStudy?.study as unknown as ResearchStudy | null;

    if (study?.created_by) {
      try {
        const im = await client.conversations.open({
          users: study.created_by,
        });
        await client.chat.postMessage({
          channel: (im.channel as { id: string }).id,
          text: `*${studyName}* ${typeLabelMap[type]} approved by <@${user}>!`,
        });
      } catch (err: unknown) {
        console.error('Failed to send DM to study creator:', err);
      }
    }
  }
}

// Generic function to handle request changes for both plan and brief
export async function handleRequestChanges(
  body: BlockAction,
  client: WebClient,
  type: DocumentType,
): Promise<void> {
  const { studyName, channelId, url } = JSON.parse(
    (body.actions[0] as { value: string }).value,
  ) as ActionValue;

  let fileOptions: FileOption[] = [];
  try {
    // Resolve study name to ID for FK-based lookup
    const resolved = await resolveStudyFromName(studyName);
    const studyFiles = resolved
      ? ((await getStudyStatusByStudyId(resolved.studyId)) as unknown as StudyStatus[])
      : [];

    fileOptions = studyFiles.map((file) => ({
      key: file.file_name || '',
      label: `${file.file_name}`,
    }));

    if (fileOptions.length === 0) {
      fileOptions = [
        { key: 'research_brief', label: 'research_brief.md' },
        { key: 'research_plan', label: 'research_plan.md' },
        { key: 'background_docs', label: 'Background documents' },
        { key: 'all_docs', label: 'All planning documents' },
      ];
    }
  } catch (err: unknown) {
    console.error('Error fetching study files:', err);
    fileOptions = [
      { key: 'research_brief', label: 'research_brief.md' },
      { key: 'research_plan', label: 'research_plan.md' },
      { key: 'background_docs', label: 'Background documents' },
      { key: 'all_docs', label: 'All planning documents' },
    ];
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      ...requestStudyChangesModal(fileOptions),
      callback_id: `request_changes_${type}_modal`,
      private_metadata: JSON.stringify({ studyName, channelId, url, type }),
    } as View,
  });
}

// Generic function to handle request changes modal submission
export async function handleRequestChangesSubmission(
  ack: AckFn<ViewResponseAction>,
  view: ViewSubmitAction['view'],
  body: ViewSubmitAction,
  client: WebClient,
): Promise<void> {
  await ack();
  const { studyName, channelId, url, type } = JSON.parse(view.private_metadata) as ModalMetadata;
  const user = body.user.id;

  const { values } = view.state;

  const extract = (
    blockId: string,
    actionId: string,
  ): string | string[] | null => {
    const block = values[blockId];
    if (!block) return null;

    const action = block[actionId];
    if (!action) return null;

    if ('value' in action && action.value !== undefined) return action.value;
    if ('selected_option' in action && action.selected_option !== undefined)
      return (action.selected_option as { value: string }).value;
    if ('selected_options' in action && action.selected_options !== undefined)
      return (action.selected_options as Array<{ value: string }>).map((opt) => opt.value);
    if ('selected_date' in action && action.selected_date !== undefined)
      return action.selected_date as string;

    return null;
  };

  const changeFeedback = extract('change_feedback_block', 'change_feedback') as string | null;
  const filesToUpdate = (extract('files_to_update_block', 'files_to_update') || []) as string[];
  const priorityLevel = extract('priority_level_block', 'priority_level') as string | null;
  const deadline = extract('deadline_block', 'deadline') as string | null;

  console.log(
    `Request Study ${type.charAt(0).toUpperCase() + type.slice(1)} Changes Modal - All Values:`,
  );
  console.log('Study Name:', studyName);
  console.log('Channel ID:', channelId);
  console.log('URL:', url);
  console.log('User:', user);
  console.log('Type:', type);
  console.log('Change Feedback:', changeFeedback);
  console.log('Files to Update:', filesToUpdate);
  console.log('Priority Level:', priorityLevel);
  console.log('Deadline:', deadline);
  console.log('Raw view.state.values:', Object.keys(values).length, 'blocks');

  await addStudyStatus({
    study_name: studyName,
    requested_by: user,
    status: 'need_changes',
    reason: changeFeedback,
    path: url,
  });

  const resolvedForChanges = await resolveStudyFromName(studyName);
  const study = resolvedForChanges?.study as unknown as ResearchStudy | null;

  if (study?.created_by) {
    try {
      const im = await client.conversations.open({
        users: study.created_by,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dmBlocks: any[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Changes requested* for *${studyName}* ${type} by <@${user}>`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Feedback:*\n>${changeFeedback}` },
            { type: 'mrkdwn', text: `*Priority:* ${priorityLevel}` },
          ],
        },
        ...(filesToUpdate.length > 0
          ? [
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Files to Update:*\n${filesToUpdate.join(', ')}`,
                  },
                ],
              },
            ]
          : []),
        ...(deadline
          ? [
              {
                type: 'section',
                fields: [{ type: 'mrkdwn', text: `*Deadline:* ${deadline}` }],
              },
            ]
          : []),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${url}|:github: View on GitHub>`,
          },
        },
      ];
      await client.chat.postMessage({
        channel: (im.channel as { id: string }).id,
        text: `Changes requested for *${studyName}* ${type} by <@${user}>`,
        blocks: dmBlocks,
      });
    } catch (err: unknown) {
      console.error('Failed to send DM to study creator:', err);
    }
  }
}

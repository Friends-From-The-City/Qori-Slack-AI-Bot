import type { WebClient } from '@slack/web-api';
import type { BlockAction, ViewSubmitAction, ViewResponseAction, AckFn } from '@slack/bolt';
import type { View } from '@slack/types';
import { buildSlackApplicationContext } from '../../middleware/auth/slackContextBridge';
import { executeDocumentApproval, type ApprovalInput, type DocumentType as AppDocumentType, type ApprovalAction } from '../../application/approval.app-service';
import { requestStudyChangesModal } from './ui/requestStudyChangesModal';
// Phase B Step 3: getStudyByProjectAndName for FK-based study lookup in brief approval
// resolveStudyFromName retained for other flows (request changes, non-brief approvals) — migrate in future step
import { getStudyByProjectAndName, resolveStudyFromName } from '../../services/research_study.service';
import { getProjectByChannelId } from '../../services/project.service';
import { assertProjectAccess, getProjectApprover, AuthorizationError } from '../../services/authorization.service';
import { getStudyStatusByStudyId } from '../../services/study-status.service';

// ─── GOV-1: Approver authorization helper ─────────────────────────
// Resolves canonical project, checks membership, then verifies designated approver identity.
// Used by all 4 entry points (approve, approve-submit, request-changes, request-changes-submit).
// Does NOT use resolveStudyFromName in the auth path (correction #2).

async function assertApproverAccess(
  userId: string,
  channelId: string,
  studyName: string,
  type: DocumentType,
  client: WebClient,
): Promise<{ projectId: number; studyId: number | null }> {
  // Resolve canonical project from channel binding (not from study name)
  const project = await getProjectByChannelId(channelId);
  if (!project) {
    throw new AuthorizationError('Cannot determine project scope from this channel.');
  }

  // Base membership check
  await assertProjectAccess(userId, project.id, client);

  // Approver identity check — canonical designated approver
  const approver = await getProjectApprover(project.id);
  if (!approver || approver.userId !== userId) {
    throw new AuthorizationError('You are not the designated approver for this project.');
  }

  // Resolve study via canonical FK-based lookup (not global name search)
  let studyId: number | null = null;
  if (type === 'brief') {
    const study = await getStudyByProjectAndName(project.id, studyName);
    studyId = study?.id ?? null;
  } else {
    // For plan/discussion: resolve within the project scope
    const study = await getStudyByProjectAndName(project.id, studyName);
    studyId = study?.id ?? null;
  }

  return { projectId: project.id, studyId };
}

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

  // ── GOV-1: Authorization check ──
  try {
    await assertApproverAccess(body.user.id, channelId, studyName, type, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Approve denied: user=${body.user.id} type=${type} study=${studyName}`);
      await client.chat.postEphemeral({
        channel: body.channel?.id || body.user.id,
        user: body.user.id,
        text: err.message,
      });
      return;
    }
    throw err;
  }

  // ── Stale button guard for briefs ──
  if (type === 'brief') {
    const project = await getProjectByChannelId(channelId);
    if (project) {
      const study = await getStudyByProjectAndName(project.id, studyName);
      if (study?.brief_status === 'approved') {
        // Already approved — stale button
        await client.chat.postEphemeral({
          channel: body.channel?.id || body.user.id,
          user: body.user.id,
          text: `This brief has already been approved. No action needed.`,
        });
        return;
      }
      if (study?.brief_status === 'changes_requested') {
        // Waiting for researcher resubmit — can't approve old version
        await client.chat.postEphemeral({
          channel: body.channel?.id || body.user.id,
          user: body.user.id,
          text: `You've already requested changes on this brief. Wait for the researcher to resubmit.`,
        });
        return;
      }
    }
  }

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

  // ── PLAT-3: App service is the ONLY business path ──
  const displayName = body.user?.name || body.user?.id;
  const appCtx = await buildSlackApplicationContext(user, (body as any).team?.id || '', displayName);

  if (!appCtx) {
    // FAIL CLOSED — no identity resolution means no business logic
    await client.chat.postMessage({
      channel: user,
      text: '❌ Unable to resolve identity. Please contact your workspace administrator.',
    });
    return;
  }

  // Resolve study/project IDs for the app service
  let resolvedStudyId: number | null = null;
  let resolvedProjectId: number | null = null;

  if (type === 'brief') {
    const project = await getProjectByChannelId(channelId);
    resolvedProjectId = project?.id ?? null;
    if (project) {
      const study = await getStudyByProjectAndName(project.id, studyName);
      resolvedStudyId = study?.id ?? null;
    }
  } else {
    const resolved = await resolveStudyFromName(studyName);
    if (resolved) {
      resolvedStudyId = resolved.studyId;
      resolvedProjectId = resolved.projectId;
    }
  }

  if (!resolvedStudyId || !resolvedProjectId) {
    await client.chat.postMessage({
      channel: user,
      text: `❌ Could not resolve study "${studyName}". Please try again or contact your administrator.`,
    });
    return;
  }

  try {
    const approvalInput: ApprovalInput = {
      documentType: type as AppDocumentType,
      studyId: resolvedStudyId,
      projectId: resolvedProjectId,
      studyName,
      action: 'approve' as ApprovalAction,
      documentUrl: url,
    };

    const result = await executeDocumentApproval(appCtx, approvalInput);

    // Slack-specific notifications
    if (type === 'brief') {
      if (result.notifyUserId) {
        const ctaButton = {
          type: 'button',
          text: { type: 'plain_text', text: 'Create Research Plan', emoji: true },
          style: 'primary',
          action_id: 'create_research_plan_from_brief',
          value: JSON.stringify({ studyName, studyId: resolvedStudyId, projectId: resolvedProjectId, briefUrl: url, channelId }),
        };

        try {
          const im = await client.conversations.open({ users: result.notifyUserId });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blocks: any[] = [
            {
              type: 'header',
              text: { type: 'plain_text', text: `Research Brief Approved — ${studyName}`, emoji: true },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Approved by:* <@${user}>\n*Brief:* <${url}|View on GitHub>` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: 'The research brief has been approved. Next step: create the research plan.' },
            },
            { type: 'actions', elements: [ctaButton] },
          ];
          await client.chat.postMessage({
            channel: (im.channel as { id: string }).id,
            text: `*${studyName}* research brief approved by <@${user}>! You can now create the research plan.`,
            blocks,
          });
        } catch (err: unknown) {
          console.error('Failed to send DM to study creator:', err);
        }
      }
    } else {
      if (result.notifyUserId) {
        try {
          const im = await client.conversations.open({ users: result.notifyUserId });
          await client.chat.postMessage({
            channel: (im.channel as { id: string }).id,
            text: `*${studyName}* ${typeLabelMap[type]} approved by <@${user}>!`,
          });
        } catch (err: unknown) {
          console.error('Failed to send DM to study creator:', err);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If it's a known invalid state (stale button), surface to user
    if (message.includes('already been approved') || message.includes('Changes were requested')) {
      try {
        await client.chat.postMessage({ channel: user, text: message });
      } catch { /* DM failed */ }
      return;
    }
    throw err;
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

  // ── GOV-1: Authorization check ──
  try {
    await assertApproverAccess(body.user.id, channelId, studyName, type, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Request changes denied: user=${body.user.id} type=${type} study=${studyName}`);
      await client.chat.postEphemeral({
        channel: body.channel?.id || body.user.id,
        user: body.user.id,
        text: err.message,
      });
      return;
    }
    throw err;
  }

  // ── Stale button guard for briefs ──
  if (type === 'brief') {
    const project = await getProjectByChannelId(channelId);
    if (project) {
      const study = await getStudyByProjectAndName(project.id, studyName);
      if (study?.brief_status === 'approved') {
        // Already approved — stale button
        await client.chat.postEphemeral({
          channel: body.channel?.id || body.user.id,
          user: body.user.id,
          text: `This brief has already been approved. No action needed.`,
        });
        return;
      }
      if (study?.brief_status === 'changes_requested') {
        // Already requested changes — stale button
        await client.chat.postEphemeral({
          channel: body.channel?.id || body.user.id,
          user: body.user.id,
          text: `You've already requested changes on this brief. Wait for the researcher to resubmit.`,
        });
        return;
      }
    }
  }

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

  // ── PLAT-3: App service is the ONLY business path ──
  const displayName = body.user?.name || body.user?.id;
  const appCtx = await buildSlackApplicationContext(user, (body as any).team?.id || '', displayName);

  if (!appCtx) {
    // FAIL CLOSED — no identity resolution means no business logic
    await client.chat.postMessage({
      channel: user,
      text: '❌ Unable to resolve identity. Please contact your workspace administrator.',
    });
    return;
  }

  // Resolve study/project IDs for the app service
  let resolvedStudyId: number | null = null;
  let resolvedProjectId: number | null = null;

  if (type === 'brief') {
    const project = await getProjectByChannelId(channelId);
    resolvedProjectId = project?.id ?? null;
    if (project) {
      const study = await getStudyByProjectAndName(project.id, studyName);
      resolvedStudyId = study?.id ?? null;
    }
  } else {
    const resolved = await resolveStudyFromName(studyName);
    if (resolved) {
      resolvedStudyId = resolved.studyId;
      resolvedProjectId = resolved.projectId;
    }
  }

  if (!resolvedStudyId || !resolvedProjectId) {
    await client.chat.postMessage({
      channel: user,
      text: `❌ Could not resolve study "${studyName}". Please try again or contact your administrator.`,
    });
    return;
  }

  try {
        const approvalInput: ApprovalInput = {
          documentType: type as AppDocumentType,
          studyId: resolvedStudyId,
          projectId: resolvedProjectId,
          studyName,
          action: 'request_changes' as ApprovalAction,
          comment: changeFeedback || undefined,
          documentUrl: url,
        };

        const result = await executeDocumentApproval(appCtx, approvalInput);

        // Slack-specific notifications
        if (result.notifyUserId) {
          try {
            const im = await client.conversations.open({ users: result.notifyUserId });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dmBlocks: any[] = [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*Changes requested* for *${studyName}* ${type} by <@${user}>` },
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Feedback:*\n>${changeFeedback}` },
                  { type: 'mrkdwn', text: `*Priority:* ${priorityLevel}` },
                ],
              },
              ...(filesToUpdate.length > 0
                ? [{
                    type: 'section',
                    fields: [{ type: 'mrkdwn', text: `*Files to Update:*\n${filesToUpdate.join(', ')}` }],
                  }]
                : []),
              ...(deadline
                ? [{
                    type: 'section',
                    fields: [{ type: 'mrkdwn', text: `*Deadline:* ${deadline}` }],
                  }]
                : []),
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `<${url}|View on GitHub>` },
              },
            ];

            // For briefs, add Resubmit CTA button
            if (type === 'brief' && resolvedStudyId) {
              dmBlocks.push(
                {
                  type: 'context',
                  elements: [{ type: 'mrkdwn', text: '_Edit the brief directly in GitHub, then click Resubmit when ready for re-review._' }],
                },
                {
                  type: 'actions',
                  elements: [{
                    type: 'button',
                    text: { type: 'plain_text', text: 'Resubmit for Approval', emoji: true },
                    style: 'primary',
                    action_id: 'brief_resubmit',
                    value: JSON.stringify({ studyId: resolvedStudyId, studyName, channelId, url, documentType: 'brief' }),
                  }],
                },
              );
            }

            await client.chat.postMessage({
              channel: (im.channel as { id: string }).id,
              text: `Changes requested for *${studyName}* ${type} by <@${user}>`,
              blocks: dmBlocks,
            });
          } catch (err: unknown) {
            console.error('Failed to send DM to study creator:', err);
          }
        }
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If it's a known invalid state, surface to user
    if (message.includes('already been') || message.includes('Comment is required')) {
      try {
        await client.chat.postMessage({ channel: user, text: message });
      } catch { /* DM failed */ }
      return;
    }
    throw err;
  }
}

/**
 * resubmitBriefHandler.ts — Handle "Resubmit for Approval" button click
 *
 * Part of the brief approval review loop:
 * 1. Researcher edits brief in GitHub
 * 2. Researcher clicks "Resubmit for Approval" button in DM
 * 3. Handler flips status to pending_approval
 * 4. Handler DMs approver with prior feedback context + Approve/Request Changes
 */

import type { AllMiddlewareArgs, BlockAction, SlackActionMiddlewareArgs } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import sequelize from '../../database';
import type { ResearchStudy } from '../../database/models/research_study';
import { getProjectApprover } from '../../services/authorization.service';
import { generateStudyResultBlocks } from './ui/studyResultBlocks';

const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

interface ResubmitButtonValue {
  studyId: number;
  studyName: string;
  channelId: string;
  url: string;
  documentType: 'brief';
}

/**
 * Handle "Resubmit for Approval" button click from researcher DM.
 *
 * Flow:
 * 1. Verify brief is in changes_requested state (stale button guard)
 * 2. Flip brief_status to pending_approval
 * 3. DM approver with prior feedback context + Approve/Request Changes buttons
 * 4. Confirm to researcher via ephemeral message
 */
export async function handleBriefResubmit({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const action = body.actions[0] as { value: string };
  const { studyId, studyName, channelId, url } = JSON.parse(action.value) as ResubmitButtonValue;
  const researcherId = body.user.id;

  // ── Fetch study and verify state ──
  const study = await ResearchStudyModel.findByPk(studyId);

  if (!study) {
    await client.chat.postEphemeral({
      channel: body.channel?.id || researcherId,
      user: researcherId,
      text: `Could not find study. It may have been deleted.`,
    });
    return;
  }

  // ── Stale button guard ──
  if (study.brief_status === 'approved') {
    await client.chat.postEphemeral({
      channel: body.channel?.id || researcherId,
      user: researcherId,
      text: `This brief has already been approved. No resubmission needed.`,
    });
    return;
  }

  if (study.brief_status === 'pending_approval') {
    await client.chat.postEphemeral({
      channel: body.channel?.id || researcherId,
      user: researcherId,
      text: `This brief is already pending approval. The approver has been notified.`,
    });
    return;
  }

  if (study.brief_status !== 'changes_requested') {
    await client.chat.postEphemeral({
      channel: body.channel?.id || researcherId,
      user: researcherId,
      text: `This brief is not in a state that requires resubmission.`,
    });
    return;
  }

  // ── Get the prior feedback (for approver context) ──
  const priorFeedback = study.brief_change_feedback;

  // ── Update status to pending_approval ──
  try {
    await study.update({ brief_status: 'pending_approval' });
    console.log(`📋 Brief resubmitted for study ${studyId}, status: pending_approval`);
  } catch (updateErr) {
    console.error('Failed to update brief status on resubmit:', updateErr);
    await client.chat.postEphemeral({
      channel: body.channel?.id || researcherId,
      user: researcherId,
      text: `Could not resubmit brief. Please try again.`,
    });
    return;
  }

  // ── Get approver (stakeholder → owner fallback) ──
  const project = await sequelize.models.Project.findOne({
    where: { id: study.project_id },
  });

  if (!project) {
    await client.chat.postEphemeral({
      channel: body.channel?.id || researcherId,
      user: researcherId,
      text: `Brief resubmitted, but could not find project to notify approver.`,
    });
    return;
  }

  const approverInfo = await getProjectApprover(project.get('id') as number);

  if (!approverInfo) {
    await client.chat.postEphemeral({
      channel: body.channel?.id || researcherId,
      user: researcherId,
      text: `Brief resubmitted, but could not find an approver to notify.`,
    });
    return;
  }

  // ── Build approval message with prior feedback context ──
  const briefBlocks = generateStudyResultBlocks(studyName, null, url, channelId, 'brief');

  // Add context about resubmission and prior feedback
  const contextBlocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Brief Resubmitted — ${studyName}`,
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Resubmitted by <@${researcherId}> for re-review.`,
        },
      ],
    },
  ];

  // Add prior feedback section if it exists
  if (priorFeedback) {
    contextBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Your prior feedback:*\n>${priorFeedback}`,
      },
    });
    contextBlocks.push({
      type: 'divider',
    });
  }

  // Add the approval buttons (from briefBlocks, skip the header since we have our own)
  const approvalButtons = briefBlocks.filter(
    (block) => (block as { type: string }).type === 'actions' || (block as { type: string }).type === 'section',
  );

  const fullBlocks = [...contextBlocks, ...approvalButtons];

  // ── DM the approver ──
  try {
    const im = await client.conversations.open({ users: approverInfo.userId });

    if (im.channel?.id) {
      const roleLabel = approverInfo.source === 'stakeholder' ? 'stakeholder' : 'owner';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageBlocks: any[] = [
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `You're receiving this as the *${roleLabel}* for this project.`,
            },
          ],
        },
        ...fullBlocks,
      ];

      await client.chat.postMessage({
        channel: im.channel.id,
        text: `Brief resubmitted for *${studyName}* — please re-review`,
        blocks: messageBlocks as KnownBlock[],
      });

      console.log(`✅ Resubmission notification sent to ${roleLabel} ${approverInfo.userId}`);
    }
  } catch (dmErr) {
    console.error('Failed to DM approver on brief resubmit:', dmErr);
  }

  // ── Confirm to researcher ──
  // Get approver display name
  let approverDisplay = `<@${approverInfo.userId}>`;
  try {
    const userInfo = await client.users.info({ user: approverInfo.userId });
    const user = userInfo.user as Record<string, unknown> | undefined;
    const profile = user?.profile as Record<string, unknown> | undefined;
    approverDisplay = (user?.real_name || profile?.display_name || user?.name || approverDisplay) as string;
  } catch {
    // Use mention fallback
  }

  try {
    await client.chat.postMessage({
      channel: researcherId,
      text: `✅ Brief resubmitted for *${studyName}*. *${approverDisplay}* has been notified for re-review.`,
    });
  } catch {
    // DM to researcher failed, not critical
  }
}

import type { KnownBlock } from '@slack/types';
import type { WebClient } from '@slack/web-api';
import type { ResearchStudyUserRole } from '../../../database/models/research_study_user_role';
import { resolveStudyFromName } from '../../../services/research_study.service';
import { getProjectApprover, type ApproverInfo } from '../../../services/authorization.service';

interface UserRole {
  user_id: string;
  role: string;
}

/**
 * Study with eagerly-loaded userRoles association.
 * Accepts Sequelize Model instances (ResearchStudy) and plain objects
 * with an optional `userRoles` association.
 */
interface StudyWithRoles {
  userRoles?: ResearchStudyUserRole[] | UserRole[];
}

// Generic function to generate study result blocks with action buttons
export const generateStudyResultBlocks = (
  studyName: string,
  study: StudyWithRoles | null,
  url: string,
  channelId: string,
  documentType: string,
) => {
  // Plan approval removed per user request — brief (scope) is the only approval gate.
  // Plan is execution detail; researcher owns it without a second approval step.
  const actionButtons: Record<string, Record<string, unknown>[]> = {
    brief: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve' },
        style: 'primary',
        action_id: 'approve_brief',
        // Note: briefData removed from value to avoid exceeding Slack's 2000 char limit
        // The approval handler has fallback logic using studyName + url
        value: JSON.stringify({ studyName, channelId, url }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Request Changes' },
        style: 'danger',
        action_id: 'request_changes_brief',
        value: JSON.stringify({ studyName, channelId, url }),
      },
    ],
    // discussion: [
    //   {
    //     type: 'button',
    //     text: { type: 'plain_text', text: 'Approve' },
    //     style: 'primary',
    //     action_id: 'approve_discussion',
    //     value: JSON.stringify({ studyName, channelId, url }),
    //   },
    //   {
    //     type: 'button',
    //     text: { type: 'plain_text', text: 'Request Changes' },
    //     style: 'danger',
    //     action_id: 'request_changes_discussion',
    //     value: JSON.stringify({ studyName, channelId, url }),
    //   },
    // ],
  };

  const documentTypeLabels: Record<string, string> = {
    brief: 'Research Brief',
    plan: 'Research Plan',
    discussion: 'Discussion Guide',
    desk: 'Desk Research',
    stakeholder_guide: 'Stakeholder Interview Guide',
    stakeholder_notes: 'Stakeholder Notes',
    survey_data: 'Survey Data',
  };

  const documentTypeLabel = documentTypeLabels[documentType] || '';

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🗓️ ${studyName}${documentTypeLabel ? ` - ${documentTypeLabel}` : ''}`,
        emoji: true,
      },
    },
  ];

  // Only add user roles section if study exists and has userRoles
  if (study && study.userRoles && Array.isArray(study.userRoles) && study.userRoles.length > 0) {
    blocks.push(
      ...study.userRoles.map(({ user_id: userId, role }: UserRole) => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <@${userId}> — *${role}*`,
        },
      }))
    );
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `<${url}|:github: View on GitHub>`,
    },
  });

  // Only add action buttons if documentType is not 'discussion', 'desk', or 'stakeholder-guide'survey
  if (documentType !== 'discussion' && documentType !== 'desk' && documentType !== 'stakeholder_guide' && documentType !== 'stakeholder_notes' && documentType !== 'survey_data') {
    blocks.push({
      type: 'actions',
      block_id: 'study_actions',
      elements: actionButtons[documentType] || actionButtons.brief,
    });
  }

  return blocks;
};

// Generate simplified blocks for channel message (without action buttons)
const generateChannelBlocks = (studyName: string, study: StudyWithRoles | null, url: string, documentType: string) => {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🗓️ ${studyName} - ${documentType.charAt(0).toUpperCase() + documentType.slice(1)} Created`,
        emoji: true,
      },
    },
  ];

  // Only add user roles section if study exists and has userRoles
  if (study && study.userRoles && Array.isArray(study.userRoles) && study.userRoles.length > 0) {
    blocks.push(
      ...study.userRoles.map(({ user_id: userId, role }: UserRole) => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <@${userId}> — *${role}*`,
        },
      }))
    );
  }

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${url}|:github: View on GitHub>`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `✅ ${documentType.charAt(0).toUpperCase() + documentType.slice(1)} has been created and sent to team members for review.`,
        },
      ],
    }
  );

  return blocks;
};

/**
 * Send approval request to the project's designated approver.
 *
 * Routing ladder (per stakeholder role design):
 * 1. Stakeholder (role='stakeholder') — the designated approver
 * 2. Owner (role='owner') — fallback if no stakeholder set
 * 3. Channel — final fallback (should never fire per ADR 0025 owner guarantee)
 *
 * The message includes correct role labeling:
 * - "...as the stakeholder for [project]" if routing to stakeholder
 * - "...as the owner for [project]" if routing to owner (fallback)
 */
export const sendStudyResultMessage = async (
  client: WebClient,
  channelId: string,
  studyName: string,
  blocks: Record<string, unknown>[],
  documentType: string,
) => {
  console.log('🚀 ~ sendStudyResultMessage ~ blocks:', blocks);
  const fallbackText = `Here's your research ${documentType} for *${studyName}*`;

  try {
    // Resolve study to get project ID for approver lookup
    let projectId: number | null = null;
    let projectName = studyName;
    try {
      const resolved = await resolveStudyFromName(studyName);
      projectId = resolved?.projectId || null;
      // Use study name as fallback for project name (study inherits project name in Phase 2D)
      projectName = resolved?.study?.name || studyName;
      console.log("🚀 ~ sendStudyResultMessage ~ projectId:", projectId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("⚠️ Study not found (may be from request):", message);
    }

    // Look up project approver (stakeholder → owner → channel fallback)
    let approver: ApproverInfo | null = null;
    if (projectId) {
      approver = await getProjectApprover(projectId);
      console.log("🚀 ~ sendStudyResultMessage ~ approver:", approver);
    }

    if (approver) {
      // Route to the approver's DM with role-labeled message
      const roleLabel = approver.source === 'stakeholder' ? 'stakeholder' : 'owner';
      const contextMessage = `You're receiving this as the *${roleLabel}* for *${projectName}*.`;

      try {
        const im = await client.conversations.open({ users: approver.userId });

        if (im.channel?.id) {
          // Add context block at the top of the message
          const blocksWithContext: Record<string, unknown>[] = [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: contextMessage,
                },
              ],
            },
            ...blocks,
          ];

          await client.chat.postMessage({
            channel: im.channel.id,
            text: `🔔 New ${documentType} for *${studyName}* - Please review and take action`,
            blocks: blocksWithContext as unknown as KnownBlock[],
          });
          console.log(`✅ Sent approval request to ${roleLabel} ${approver.userId}`);
        }
      } catch (error) {
        console.error(`Failed to send DM to ${roleLabel} ${approver.userId}:`, error);
        // Fall through to channel fallback
      }
    } else {
      // No approver found — channel fallback (should not happen per ADR 0025)
      console.log("⚠️ No approver found, sending to channel instead");
      await client.chat.postMessage({
        channel: channelId,
        text: fallbackText,
        blocks: blocks as unknown as KnownBlock[],
      });
    }
  } catch (err) {
    console.error(`❌ Failed to send ${documentType} message:`, err);
  }
};

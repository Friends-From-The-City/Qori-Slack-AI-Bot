/**
 * Admin Center Command Handler
 *
 * Per ADR 0025: /qori-admin opens the Admin Center for project owners.
 * Non-owners see an informational message explaining owner-only access.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs } from '@slack/bolt';
import { isProjectOwner, isProjectMember } from '../../../../services/authorization.service';
import { buildAdminCenterModal, buildNonOwnerModal } from '../../ui/adminCenterModal';
import sequelize from '../../../../database';

import type { Project } from '../../../../database/models/project';

const ProjectModel = sequelize.models.Project as typeof Project;

/**
 * /qori-admin command handler
 *
 * Opens the Admin Center modal for project owners.
 * Non-owners see an informational message, not the actions.
 */
export async function adminCenterCommandHandler({
  ack,
  command,
  client,
}: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();

  const userId = command.user_id;
  const channelId = command.channel_id;

  try {
    // 1. Get project from channel
    const project = await ProjectModel.findOne({
      where: { channel_id: channelId },
    });

    if (!project) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text:
          'This channel is not associated with a Qori project.\n\n' +
          'Run `/qori-admin` from a project channel, or use `/qori-start` to create a new project.',
      });
      return;
    }

    // 2. Check if user is owner
    const userIsOwner = await isProjectOwner(userId, project.id);

    // 3. Open appropriate modal
    if (userIsOwner) {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildAdminCenterModal(project),
      });
    } else {
      // Check if at least a member (for context)
      console.log(`[ADMIN] Checking membership for user=${userId} project=${project.id} channel=${project.channel_id}`);
      const userIsMember = await isProjectMember(userId, project.id, client);
      console.log(`[ADMIN] Membership result: user=${userId} isMember=${userIsMember}`);

      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildNonOwnerModal(project, userIsMember),
      });
    }
  } catch (error) {
    console.error('[ADMIN] Error opening admin center:', error);
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `Error opening Admin Center: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

export { adminCenterCommandHandler as adminCenterCommand };

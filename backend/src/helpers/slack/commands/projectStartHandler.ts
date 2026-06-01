/**
 * projectStartHandler.ts — /qori-start project creation flow
 *
 * Opens the project creation modal. On submission, creates the project,
 * optionally creates a dedicated Slack channel, and posts an orienting
 * confirmation message.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';
import type { WebClient } from '@slack/web-api';

import { createProjectFromName, bindProjectToChannel } from '../../../services/project.service';
import { scaffoldProject } from '../../../services/scaffolding.service';
import { projectCreationModal, type ProjectCreationModalMetadata } from '../ui/projectCreationModal';

// ─── Channel naming utilities ────────────────────────────────────

/**
 * Generate a Slack channel name from a project slug.
 * - Prefixes with "project-"
 * - Truncates to 80 chars (Slack limit) with hash suffix if needed
 * - Lowercase, alphanumeric + hyphens only
 */
function generateChannelName(slug: string): string {
  const prefix = 'project-';
  const maxLength = 80;
  const base = `${prefix}${slug}`;

  if (base.length <= maxLength) {
    return base;
  }

  // Truncate and add hash suffix for uniqueness
  const hash = slug.slice(-4);
  const truncated = base.slice(0, maxLength - 5); // Leave room for "-" + 4 chars
  return `${truncated}-${hash}`;
}

/**
 * Create a Slack channel with conflict resolution.
 * If the name already exists, appends numeric suffix (project-foo-2, project-foo-3, etc.)
 */
async function createChannelWithRetry(
  client: WebClient,
  baseName: string,
  isPrivate: boolean,
  maxAttempts = 5
): Promise<{ ok: true; channelId: string; channelName: string } | { ok: false; error: string }> {
  let attempt = 0;
  let name = baseName;

  while (attempt < maxAttempts) {
    try {
      const result = await client.conversations.create({
        name,
        is_private: isPrivate,
      });

      if (result.ok && result.channel) {
        return {
          ok: true,
          channelId: result.channel.id!,
          channelName: result.channel.name!,
        };
      }

      return { ok: false, error: 'Unknown error creating channel' };
    } catch (err: unknown) {
      const slackError = err as { data?: { error?: string } };
      const errorCode = slackError.data?.error;

      if (errorCode === 'name_taken') {
        // Try with numeric suffix
        attempt++;
        name = `${baseName.slice(0, 77)}-${attempt + 1}`; // Leave room for suffix
        continue;
      }

      // Other errors — return failure
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  return { ok: false, error: 'Could not create channel after multiple attempts' };
}

// ─── Slash command: /qori-start ─────────────────────────────────

async function projectStartCommand({ ack, command, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  await ack();

  const modal = projectCreationModal(command.channel_id);

  await client.views.open({
    trigger_id: command.trigger_id,
    view: modal as View,
  });
}

// ─── Modal submission: project_create_modal ─────────────────────

async function handleProjectCreateSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
  const values = view.state.values;
  const projectName = values.project_name?.value?.value?.trim() || '';
  const projectDescription = values.project_description?.value?.value?.trim() || null;

  // Check if "create channel" toggle is selected (default ON via initial_options)
  const createChannelOptions = values.create_channel?.value?.selected_options || [];
  const shouldCreateChannel = createChannelOptions.some(
    (opt: { value: string }) => opt.value === 'create_channel'
  );

  // Validate project name
  if (!projectName) {
    await ack({
      response_action: 'errors',
      errors: {
        project_name: 'Project name is required',
      },
    });
    return;
  }

  // Parse metadata
  let metadata: ProjectCreationModalMetadata;
  try {
    metadata = JSON.parse(view.private_metadata || '{}');
  } catch {
    metadata = { channelId: '' };
  }

  // Track channel creation result for the success modal
  let createdChannelId: string | undefined;
  let createdChannelName: string | undefined;
  let channelError: string | undefined;

  // Create the project
  try {
    const project = await createProjectFromName(projectName, {
      description: projectDescription,
      created_by: body.user.id,
      status: 'active',
    });

    // Scaffold project folder in GitHub with README
    // Phase B-0.5: Uses scaffolding service instead of inline README creation
    try {
      // Get creator's display name for README
      let creatorName = body.user.id;
      try {
        const userInfo = await client.users.info({ user: body.user.id });
        creatorName = userInfo.user?.real_name || userInfo.user?.profile?.display_name || body.user.id;
      } catch {
        // Non-critical — use user ID as fallback
      }

      await scaffoldProject(project.slug, project.name, creatorName);
    } catch (ghErr) {
      // Log but don't fail — project exists in Postgres, folder can be created later
      const ghMessage = ghErr instanceof Error ? ghErr.message : String(ghErr);
      console.warn(`GitHub scaffolding failed for ${project.slug}:`, ghMessage);
    }

    // Create dedicated Slack channel if toggle is on
    if (shouldCreateChannel) {
      const channelBaseName = generateChannelName(project.slug);
      const channelResult = await createChannelWithRetry(client, channelBaseName, true);

      if (channelResult.ok) {
        createdChannelId = channelResult.channelId;
        createdChannelName = channelResult.channelName;

        // Invite the project creator to the channel
        try {
          await client.conversations.invite({
            channel: createdChannelId,
            users: body.user.id,
          });
        } catch (inviteErr) {
          // User might already be in channel (e.g., if they're workspace admin)
          const inviteMessage = inviteErr instanceof Error ? inviteErr.message : String(inviteErr);
          console.warn(`Could not invite user to channel: ${inviteMessage}`);
        }

        // Post welcome message
        try {
          await client.chat.postMessage({
            channel: createdChannelId,
            text: `*${project.name}* created. Research workflows for this project will surface here as they're wired up.`,
          });
        } catch (msgErr) {
          const msgMessage = msgErr instanceof Error ? msgErr.message : String(msgErr);
          console.warn(`Could not post welcome message: ${msgMessage}`);
        }

        // Atomic bidirectional binding
        try {
          await bindProjectToChannel(project.id, createdChannelId);
        } catch (bindErr) {
          // Binding failed — archive the channel to avoid orphans
          const bindMessage = bindErr instanceof Error ? bindErr.message : String(bindErr);
          console.error(`Channel binding failed for ${project.slug}: ${bindMessage}`);

          try {
            await client.conversations.archive({ channel: createdChannelId });
            console.log(`Archived orphaned channel ${createdChannelName}`);
          } catch (archiveErr) {
            const archiveMessage = archiveErr instanceof Error ? archiveErr.message : String(archiveErr);
            console.error(`Could not archive orphaned channel: ${archiveMessage}`);
          }

          // Clear channel info since binding failed
          createdChannelId = undefined;
          createdChannelName = undefined;
          channelError = bindMessage;
        }
      } else {
        // Channel creation failed
        channelError = channelResult.error;
        console.warn(`Channel creation failed for ${project.slug}: ${channelError}`);
      }
    }

    // If channel was requested but failed, DM the user
    if (shouldCreateChannel && channelError) {
      try {
        await client.chat.postMessage({
          channel: body.user.id,
          text: `Project *${project.name}* created. I couldn't create a dedicated channel — ${channelError}. You can bind a channel later.`,
        });
      } catch (dmErr) {
        const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
        console.warn(`Could not DM user about channel failure: ${dmMessage}`);
      }
    }

    // Close modal and post orienting confirmation
    await ack();

    const channelContext = createdChannelName ? `, <#${createdChannelId}> ready` : '';
    const confirmationText = `✅ *${project.name}* created${channelContext}. When you're ready, run \`/qori-brief\` to start your first study — or \`/qori-discover\` first if you want to add background research.`;

    // Post to the created channel if one exists, otherwise DM
    const targetChannel = createdChannelId || body.user.id;
    try {
      await client.chat.postMessage({
        channel: targetChannel,
        text: confirmationText,
      });
    } catch (msgErr) {
      const msgMessage = msgErr instanceof Error ? msgErr.message : String(msgErr);
      console.warn(`Could not post confirmation message: ${msgMessage}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Check if it's a duplicate slug error
    if (message.includes('already exists')) {
      await ack({
        response_action: 'errors',
        errors: {
          project_name: message,
        },
      });
      return;
    }

    // Other errors — show generic message
    console.error('Project creation failed:', message);
    await ack({
      response_action: 'errors',
      errors: {
        project_name: 'Could not create project. Please try again.',
      },
    });
  }
}

export {
  projectStartCommand,
  handleProjectCreateSubmission,
};

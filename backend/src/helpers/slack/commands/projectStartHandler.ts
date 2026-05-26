/**
 * projectStartHandler.ts — /qori-start project creation flow
 *
 * Phase 2C: Opens the project creation modal. On submission, creates
 * the project, optionally creates a dedicated Slack channel, and shows
 * the next-steps modal with gated action buttons.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction, SlackActionMiddlewareArgs, BlockAction } from '@slack/bolt';
import type { View } from '@slack/types';
import type { WebClient } from '@slack/web-api';

import { createProjectFromName, bindProjectToChannel } from '../../../services/project.service';
import { createOrUpdateFileOnGitHub } from '../../github';
import { projectCreationModal, type ProjectCreationModalMetadata } from '../ui/projectCreationModal';
import { projectCreatedNextStepsModal, type ProjectNextStepsModalMetadata } from '../ui/projectCreatedNextStepsModal';
import { buildBriefEntryModal } from '../ui/researchBriefEntryModal';
import { discoverHubModal, DISCOVERY_GUIDANCE_BLOCK_ID, DISCOVERY_ARTIFACTS_BLOCK_ID } from '../ui/discoverHubModal';
import { loadDiscoveryArtifacts, type DiscoveryArtifact } from '../../discoveryLoader';
import { buildGuidanceText, buildArtifactDisplayText } from './discoverHandler';

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

    // Create project folder in GitHub with README
    const readmeContent = `# ${project.name}

${project.description || 'Research project created via Qori.'}

## Structure

- \`00-discovery/\` — Desk research, stakeholder synthesis, survey synthesis
- \`{study-slug}/\` — Individual research studies (01-brief → 06-tickets within each)

---

*Created ${new Date().toISOString().split('T')[0]} by <@${body.user.id}>*
`;

    try {
      await createOrUpdateFileOnGitHub(
        `${project.slug}/README.md`,
        readmeContent,
      );
    } catch (ghErr) {
      // Log but don't fail — project exists in Postgres, folder can be created later
      const ghMessage = ghErr instanceof Error ? ghErr.message : String(ghErr);
      console.warn(`GitHub folder creation failed for ${project.slug}:`, ghMessage);
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

    // Ack with update to show next-steps modal
    await ack({
      response_action: 'update',
      view: projectCreatedNextStepsModal({
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        channelId: metadata.channelId,
        createdChannelId,
        createdChannelName,
      }) as View,
    });
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

// ─── Button handlers ────────────────────────────────────────────

/**
 * Handle project action buttons from the next-steps modal.
 *
 * Phase 2D: Brief and Discovery buttons open their respective modals with project context.
 * Library remains "coming soon" placeholder.
 */
async function handleProjectActionButton({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();

  const actionId = (body as BlockAction).actions?.[0]?.action_id || 'unknown';

  // Parse modal metadata for project context
  let metadata: ProjectNextStepsModalMetadata;
  try {
    const viewBody = body as BlockAction & { view?: { private_metadata?: string } };
    metadata = JSON.parse(viewBody.view?.private_metadata || '{}') as ProjectNextStepsModalMetadata;
  } catch {
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: '❌ Could not read project context. Please try again.',
    });
    return;
  }

  // Handle brief button — open the brief entry modal
  if (actionId === 'project_action_brief') {
    try {
      // Get user's display name for lead researcher pre-fill
      let leadResearcher: string | null = null;
      try {
        const userInfo = await client.users.info({ user: body.user.id });
        leadResearcher = userInfo.user?.real_name || userInfo.user?.profile?.display_name || null;
      } catch {
        // Non-critical — leave null
      }

      const briefModal = await buildBriefEntryModal({
        leadResearcher,
        channelId: metadata.channelId || metadata.createdChannelId || body.user.id,
        projectId: metadata.projectId,
        projectName: metadata.projectName,
        projectSlug: metadata.projectSlug,
        source: 'project_next_steps',
      });

      await client.views.push({
        trigger_id: (body as BlockAction).trigger_id,
        // @ts-expect-error — modal blocks are Record<string,unknown>[] from JSON.parse; structurally valid at runtime
        view: briefModal,
      });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to open brief modal from project next steps:', message);
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Could not open brief modal: ${message}`,
      });
      return;
    }
  }

  // Handle discovery button — open the discover hub modal
  if (actionId === 'project_action_discovery') {
    try {
      // Load existing discovery artifacts for this project
      let artifacts: DiscoveryArtifact[] = [];
      try {
        artifacts = await loadDiscoveryArtifacts(metadata.projectId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Could not load discovery artifacts for hub:', message);
      }

      // Build dynamic hub blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks: any[] = [...discoverHubModal.blocks];

      // Inject D2 guidance
      const guidanceIdx = blocks.findIndex((b: { block_id?: string }) => b.block_id === DISCOVERY_GUIDANCE_BLOCK_ID);
      if (guidanceIdx !== -1) {
        blocks[guidanceIdx] = {
          ...blocks[guidanceIdx],
          elements: [
            {
              type: "mrkdwn",
              text: buildGuidanceText(artifacts),
            },
          ],
        };
      }

      // Inject D1 artifact visibility
      const artifactsIdx = blocks.findIndex((b: { block_id?: string }) => b.block_id === DISCOVERY_ARTIFACTS_BLOCK_ID);
      if (artifactsIdx !== -1) {
        blocks[artifactsIdx] = {
          ...blocks[artifactsIdx],
          elements: [
            {
              type: "mrkdwn",
              text: buildArtifactDisplayText(artifacts),
            },
          ],
        };
      }

      // Include project context in metadata
      const discoverMeta = {
        channelId: metadata.createdChannelId || metadata.channelId,
        projectId: metadata.projectId,
        projectSlug: metadata.projectSlug,
      };

      await client.views.push({
        trigger_id: (body as BlockAction).trigger_id,
        view: {
          ...discoverHubModal,
          blocks,
          private_metadata: JSON.stringify(discoverMeta),
        } as View,
      });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to open discover hub from project next steps:', message);
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Could not open discovery hub: ${message}`,
      });
      return;
    }
  }

  // Library button remains "coming soon" for now
  if (actionId === 'project_action_library') {
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `*Library import* connects to projects in the next update.`,
    });
    return;
  }

  // Unknown action
  await client.chat.postEphemeral({
    channel: body.user.id,
    user: body.user.id,
    text: `Unknown action: ${actionId}`,
  });
}

export {
  projectStartCommand,
  handleProjectCreateSubmission,
  handleProjectActionButton,
};

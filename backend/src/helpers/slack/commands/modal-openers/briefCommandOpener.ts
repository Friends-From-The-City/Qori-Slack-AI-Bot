/**
 * briefCommandOpener.ts — /qori-brief slash command handler
 *
 * Extracted from events.ts inline handler. Handles the /qori-brief slash
 * command: checks channel-project binding, fetches Slack profile for
 * lead researcher pre-fill, and opens the brief entry modal.
 *
 * This is the COMMAND entry point (/qori-brief).
 * briefModalOpener.ts is the ACTION entry point (create_research_brief button).
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs } from '@slack/bolt';

import { getProjectByChannelId } from '../../../../services/project.service';
import { buildBriefEntryModal } from '../../ui/researchBriefEntryModal';
import { postEphemeralOrDM } from '../../slackHelpers';

async function briefCommand({ ack, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();

  try {
    // Phase 2D: Check if channel is bound to a project
    const project = await getProjectByChannelId(command.channel_id);
    if (!project) {
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        `This channel isn't linked to a project yet.\n\n*Option 1:* Run \`/qori-start\` to create a new project with a dedicated channel, then run \`/qori-brief\` there.\n*Option 2:* Run \`/qori-brief\` in an existing project channel.`,
      );
      return;
    }

    let leadResearcher: string | null = null;
    try {
      const userInfo = await client.users.info({ user: command.user_id });
      leadResearcher = userInfo.user?.real_name || userInfo.user?.profile?.display_name || null;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.warn('Could not fetch Slack profile for brief modal:', errMessage);
    }

    try {
      const modal = await buildBriefEntryModal({
        leadResearcher,
        channelId: command.channel_id,
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        source: 'qori_brief_command',
        client,
      });
      // @ts-expect-error — modal blocks are Record<string,unknown>[] from JSON.parse; structurally valid at runtime
      await client.views.open({ trigger_id: command.trigger_id, view: modal });
    } catch (err: unknown) {
      const errData = (err as Record<string, unknown>)?.data;
      const messages = (errData as Record<string, unknown>)?.response_metadata as Record<string, unknown>;
      console.error('Error opening brief modal:');
      console.error('Error data:', JSON.stringify(errData, null, 2));
      if (messages?.messages) {
        console.error('Validation errors:', JSON.stringify(messages.messages, null, 2));
      }
      await postEphemeralOrDM(
        client,
        command.channel_id,
        command.user_id,
        'Error opening research brief modal. Check server logs for details.',
      );
    }
  } catch (outerErr) {
    // Catch-all for any unexpected error
    const errMsg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    console.error('Unexpected error in /qori-brief:', outerErr);
    await postEphemeralOrDM(
      client,
      command.channel_id,
      command.user_id,
      `Unexpected error: ${errMsg}`,
    );
  }
}

export { briefCommand };

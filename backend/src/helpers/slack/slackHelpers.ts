/**
 * slackHelpers.ts — Shared utilities for Slack interactions
 *
 * These helpers handle common edge cases like posting to channels
 * where the bot may not be a member.
 */

import type { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/types';

/**
 * Post an ephemeral message to a channel, falling back to DM if the bot
 * isn't a member of the channel.
 *
 * Use this instead of raw `client.chat.postEphemeral` when the bot might
 * not be a member of the channel (e.g., slash commands can be invoked
 * from any channel, even ones the bot hasn't joined).
 */
export async function postEphemeralOrDM(
  client: WebClient,
  channelId: string,
  userId: string,
  text: string,
  blocks?: KnownBlock[]
): Promise<void> {
  try {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text,
      blocks,
    });
  } catch (err) {
    // Channel post failed (bot not a member, channel archived, etc.)
    // Fall back to DM to the user
    const errorCode = (err as { data?: { error?: string } })?.data?.error;
    if (errorCode === 'channel_not_found' || errorCode === 'not_in_channel') {
      await client.chat.postMessage({
        channel: userId,
        text,
        blocks,
      });
    } else {
      // Re-throw unexpected errors
      throw err;
    }
  }
}

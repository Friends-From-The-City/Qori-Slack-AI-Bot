/**
 * studyLifecycleHandler.ts — Miscellaneous study lifecycle events
 *
 * Extracted from events.js. Contains:
 * - view_closed event handler (cleanup, currently noop)
 * - user_select options handler (typeahead for adding team members)
 */

import type { AllMiddlewareArgs, SlackOptionsMiddlewareArgs } from '@slack/bolt';

// ─── view_closed event ─────────────────────────────────────────────

async function handleViewClosed({ event }: { event: { view: { callback_id: string } }; client: any } & Record<string, unknown>): Promise<void> {
  if (event.view.callback_id !== 'plan_study_modal') return;

  // Noop — retained for potential future cleanup logic
}

// ─── user_select options handler (typeahead) ──────────────────────

async function handleUserSelectOptions({ ack, body, client }: SlackOptionsMiddlewareArgs<'block_suggestion'> & AllMiddlewareArgs): Promise<void> {
  // Parse out the channelId we stored
  const { channelId } = JSON.parse(body.view?.private_metadata || '{}');

  // 1. Get channel members
  const conv = await client.conversations.members({ channel: channelId });
  const memberSet = new Set(conv.members);

  // 2. List all users and filter
  const usersList = await client.users.list({});
  const options = (usersList.members ?? [])
    .filter((u: any) => memberSet.has(u.id) && !u.is_bot && u.id !== 'USLACKBOT')
    .map((u: any) => ({
      text: { type: 'plain_text' as const, text: u.profile.real_name || u.name },
      value: u.id,
    }));

  // 3. Ack with up to 100
  await ack({ options: options.slice(0, 100) });
}

export {
  handleViewClosed,
  handleUserSelectOptions,
};

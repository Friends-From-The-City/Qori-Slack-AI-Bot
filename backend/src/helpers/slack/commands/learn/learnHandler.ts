/**
 * learnHandler.ts — /qori-learn interactive tutorial
 *
 * Extracted from events.js. Contains the slash command, navigation actions,
 * and first-run ceremony submission handler.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

import { isFirstRun, markOnboarded } from '../../../../services/slack-user-state.service';
import { buildLearnModal, buildCondensedModal } from '../../ui/qoriLearnModal';
import type { View } from '@slack/types';

// ─── /qori-learn command ───────────────────────────────────────────

async function learnCommandHandler({ ack, body, client, command }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();
  const userId = command.user_id;
  const channelId = command.channel_id;
  const meta = { userId, channelId };

  const firstRun = await isFirstRun(userId);

  if (firstRun) {
    await client.views.open({ trigger_id: body.trigger_id, view: buildLearnModal(1, meta) as unknown as View });
  } else {
    await client.views.open({ trigger_id: body.trigger_id, view: buildCondensedModal(meta) as unknown as View });
  }
}

// ─── Navigation actions ────────────────────────────────────────────

async function handleLearnNext({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('learn_next: no view in body'); return; }
  const targetScreen = parseInt((body.actions[0] as any).value, 10);
  const meta = JSON.parse(body.view.private_metadata || '{}');
  await client.views.update({ view_id: body.view.id, view: buildLearnModal(targetScreen, meta) as unknown as View });
}

async function handleLearnPrev({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('learn_prev: no view in body'); return; }
  const targetScreen = parseInt((body.actions[0] as any).value, 10);
  const meta = JSON.parse(body.view.private_metadata || '{}');
  await client.views.update({ view_id: body.view.id, view: buildLearnModal(targetScreen, meta) as unknown as View });
}

async function handleLearnRestartTour({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('learn_restart_tour: no view in body'); return; }
  const meta = JSON.parse(body.view.private_metadata || '{}');
  await client.views.update({ view_id: body.view.id, view: buildLearnModal(1, meta) as unknown as View });
}

// ─── Ceremony submission ───────────────────────────────────────────

async function handleLearnCeremonySubmit({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  const meta = JSON.parse(view.private_metadata || '{}');
  const userId = meta.userId || body.user.id;
  const channelId = meta.channelId;
  const choice = (view as any).state.values.learn_role_select?.learn_role_choice?.selected_option?.value;

  await markOnboarded(userId);

  // Route based on choice — close modal, send DM with next step
  const routeMessages: Record<string, string> = {
    new_study: 'Welcome aboard! Start with `/qori-discover` to do pre-study discovery, or `/qori-brief` to initiate a study directly.',
    analyze: 'Welcome aboard! Run `/qori-analyze` to upload and process your session transcripts.',
    ask: 'Welcome aboard! Run `/qori-ask` to query past research across all studies.',
    explore: 'Welcome aboard! When you\'re ready, start with `/qori-discover`. Run `/qori-learn` anytime to see all commands.',
  };

  const message = routeMessages[choice] || routeMessages.explore;
  await ack();

  try {
    const im = await client.conversations.open({ users: userId });
    await client.chat.postMessage({ channel: (im as any).channel.id, text: message });
  } catch (err) { const message = err instanceof Error ? err.message : String(err); console.error('Failed to send /qori-learn DM:', message); }
}

// ─── Noop ack ──────────────────────────────────────────────────────

async function handleLearnCeremonyNoop({ ack }: { ack: () => Promise<void> }): Promise<void> {
  await ack();
}

export {
  learnCommandHandler,
  learnCommandHandler as learnCommand,
  handleLearnNext,
  handleLearnNext as learnNext,
  handleLearnPrev,
  handleLearnPrev as learnPrev,
  handleLearnRestartTour,
  handleLearnRestartTour as learnRestartTour,
  handleLearnCeremonySubmit,
  handleLearnCeremonyNoop,
};

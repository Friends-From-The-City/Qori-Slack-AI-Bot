/**
 * studyLifecycleHandler.ts — Miscellaneous study lifecycle events
 *
 * Extracted from events.js. Contains:
 * - view_closed event handler (cleanup, currently noop)
 * - study-setup-modal-start-research view submission (Skip for Now)
 * - plan_study_modal view submission (no-op)
 * - user_select options handler (typeahead for adding team members)
 */

import type { AllMiddlewareArgs, SlackViewMiddlewareArgs, SlackOptionsMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';

// ─── view_closed event ─────────────────────────────────────────────

async function handleViewClosed({ event, client }: { event: { view: { callback_id: string } }; client: any } & Record<string, unknown>): Promise<void> {
  if (event.view.callback_id !== 'plan_study_modal' &&
    event.view.callback_id !== 'study-setup-modal-start-research') return;

  // Don't show placeholder message when modal is closed via other means
  // The placeholder will only be shown when user clicks "Skip for Now" button
}

// ─── plan_study_modal submission (no-op) ──────────────────────────

async function handlePlanStudyModalSubmission({ ack }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  // Just acknowledge - the modal can be closed, no action needed
  // Users can still click buttons to create documents/upload files
}

// ─── study-setup-modal-start-research submission (Skip for Now) ───

async function handleStudySetupSkipForNow({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  // Parse metadata to get channelId and studyName
  const { channelId, studyName } = JSON.parse(view.private_metadata || '{}');

  // Currently a no-op — the commented-out code that would post a completion
  // message was removed. This handler exists to prevent Slack from erroring
  // when the modal is submitted.
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
  handlePlanStudyModalSubmission,
  handlePlanStudyModalSubmission as handlePlanStudyNoop,
  handleStudySetupSkipForNow,
  handleStudySetupSkipForNow as handleStudySetupSkip,
  handleUserSelectOptions,
};

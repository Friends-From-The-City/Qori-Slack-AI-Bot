/**
 * syncHandler.ts — /qori-sync command (DISABLED)
 *
 * GOV-1B: Disabled. The /qori-sync command was built for the RAG pipeline
 * (vector store population) which is currently disabled. The handler had
 * no authorization and read GitHub folders without project membership checks.
 *
 * All entry points now return an ephemeral "not available" message and
 * perform NO GitHub reads or mutations.
 *
 * SLACK MANIFEST NOTE: The /qori-sync slash command should be removed from
 * the Slack app configuration dashboard (api.slack.com → App → Slash Commands).
 * Until removed there, Slack will still show the command autocomplete.
 *
 * To re-enable: restore from git history (pre-GOV-1B), add proper
 * authorization (assertProjectAccess or assertProjectOwner), and re-enable
 * the RAG pipeline.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackOptionsMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

// ─── Disabled command ────────────────────────────────────────────

async function syncCommandHandler({ ack, command, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();
  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: 'The `/qori-sync` command is not currently available. Data sync capabilities are being redesigned.',
  });
}

// ─── Disabled action/options/view stubs ──────────────────────────
// These remain exported so events.ts registrations don't break.
// They perform no work — the command never opens a modal to reach them.

const noopAction = async ({ ack }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => { await ack(); };
const noopOptions = async ({ ack }: SlackOptionsMiddlewareArgs<'block_suggestion'> & AllMiddlewareArgs): Promise<void> => { await ack({ options: [] }); };
const noopView = async ({ ack }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => { await ack(); };

export {
  syncCommandHandler,
  syncCommandHandler as syncCommand,
  noopOptions as syncFolderOptions,
  noopAction as syncFolderSelected,
  noopOptions as syncSubfolderOptions,
  noopAction as syncSubfolderSelected,
  noopOptions as syncResearchOptions,
  noopView as handleSyncSubmission,
};

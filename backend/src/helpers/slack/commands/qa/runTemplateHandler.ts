/**
 * runTemplateHandler.ts — /run-template command (DISABLED)
 *
 * GOV-1B: Disabled. The /run-template command was an internal QA tool
 * that could generate documents without authorization. It has no
 * researcher-facing purpose and no project membership checks.
 *
 * All entry points now return an ephemeral "not available" message and
 * perform NO document generation.
 *
 * SLACK MANIFEST NOTE: The /run-template slash command should be removed
 * from the Slack app configuration dashboard.
 *
 * To re-enable: restore from git history (pre-GOV-1B), add proper
 * authorization, and gate behind an admin/QA mechanism.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';

// ─── Disabled command ────────────────────────────────────────────

async function runTemplateCommandHandler({ ack, command, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();
  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: 'The `/run-template` command is not currently available.',
  });
}

// ─── Disabled action/view stubs ──────────────────────────────────

const noopAction = async ({ ack }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> => { await ack(); };
const noopView = async ({ ack }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> => { await ack(); };

export {
  runTemplateCommandHandler,
  runTemplateCommandHandler as runTemplateCommand,
  noopAction as handleTypeSelect,
  noopView as handleResearchShareoutSubmission,
  noopView as handleShareoutSubmission,
};

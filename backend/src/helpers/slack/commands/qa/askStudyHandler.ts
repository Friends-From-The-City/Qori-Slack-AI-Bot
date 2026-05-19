/**
 * askStudyHandler.ts — /ask-study command + modal
 *
 * Extracted from events.js. Opens a modal with a subfolder picker and
 * question input. The submission handler currently responds with a
 * "not available yet" message (RAG is disabled for alpha).
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';

import { readFolderContents } from '../../../github';

// ─── /ask-study command ───────────────────────────────────────────

async function askStudyCommandHandler({ ack, command, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();
  const channelId = command.channel_id;

  // fetch subfolders (keep this under 3s!)
  const subfolders = await readFolderContents(
    'beta-test/product-team-1/research',
    // @ts-expect-error — pre-existing type mismatch from require() → import migration
    process.env.GITHUB_REPO,
  );
  console.log('ask-study ~ subfolders:', subfolders);

  const options = subfolders.map((f: any) => ({
    text: { type: 'plain_text', text: f.name },
    value: f.name,
  }));
  console.log('ask-study ~ options:', options);

  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'ask-study-modal',
      title: { type: 'plain_text', text: 'Ask Study Bot' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ channelId }),
      blocks: [
        // @ts-expect-error — pre-existing type mismatch from require() → import migration
        {
          type: 'input',
          block_id: 'subfolder_block',
          label: { type: 'plain_text', text: 'Choose Subfolder' },
          element: {
            type: 'static_select',
            action_id: 'subfolder_selected',
            placeholder: { type: 'plain_text', text: 'Select a folder\u2026' },
            options,
          },
        },
        {
          type: 'input',
          block_id: 'question_block',
          label: { type: 'plain_text', text: 'Your Question' },
          element: {
            type: 'plain_text_input',
            action_id: 'question_input',
            multiline: true,
            placeholder: { type: 'plain_text', text: 'Type your question here\u2026' },
          },
        },
      ],
    },
  });
}

// ─── ask-study-modal submission ───────────────────────────────────

async function handleAskStudySubmission({ ack, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const { channelId } = JSON.parse(view.private_metadata);

  await client.chat.postMessage({
    channel: channelId,
    text: "This command isn't available yet. RAG-based study search is planned for a future release.",
  });
}

export {
  askStudyCommandHandler,
  askStudyCommandHandler as askStudyCommand,
  handleAskStudySubmission,
};

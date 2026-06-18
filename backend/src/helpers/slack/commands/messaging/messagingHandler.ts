/**
 * messagingHandler.ts — Copy email action
 *
 * Extracted from events.js. Contains:
 * - copy_email_formatted action (opens copy-to-clipboard email modal)
 *
 * NOTE: The generate_other_message_type action was removed (June 2026).
 * It was a broken convenience switcher that didn't load participants.
 * All message types are reachable via the direct outreach flow.
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, BlockAction } from '@slack/bolt';

import { copyEmailModal } from '../../ui/outreach/copyEmailModal';

// ─── copy_email_formatted action ──────────────────────────────────

async function handleCopyEmailFormatted({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  console.log('copy_email_formatted ~ body:', body);
  await ack();

  try {
    if (!('view' in body) || !body.view) { console.warn('copy_email_formatted: no view in body'); return; }

    // Extract message body from the modal's private_metadata
    const privateMetadata = body.view.private_metadata;
    let messageBody = '';

    if (privateMetadata) {
      try {
        const metadata = JSON.parse(privateMetadata);
        messageBody = metadata.messageBody || '';
      } catch (error) {
        console.error('Error parsing private_metadata:', error);
      }
    }

    console.log('Opening copy email modal with messageBody:', messageBody);

    // Open the copy email modal with the message body
    await client.views.push({
      trigger_id: body.trigger_id,
      // @ts-expect-error — pre-existing type mismatch from require() → import migration
      view: copyEmailModal({
        messageBody,
      }),
    });
  } catch (error) {
    console.error('Error opening copy email modal:', error);
  }
}

export {
  handleCopyEmailFormatted,
  handleCopyEmailFormatted as copyEmailFormatted,
};

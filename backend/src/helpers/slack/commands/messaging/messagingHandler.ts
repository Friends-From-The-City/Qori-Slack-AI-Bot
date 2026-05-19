/**
 * messagingHandler.ts — Message type switcher + copy email action
 *
 * Extracted from events.js. Contains:
 * - generate_other_message_type action (opens selected message type modal)
 * - copy_email_formatted action (opens copy-to-clipboard email modal)
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, BlockAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { copyEmailModal } from '../../ui/outreach/copyEmailModal';
import { sessionConfirmationModal } from '../../ui/outreach/sessionConfirmationModal';
import { sessionReminderModal } from '../../ui/outreach/sessionReminderModal';
import { reschedulingRequestModal } from '../../ui/outreach/reschedulingRequestModal';
import { followupModal } from '../../ui/outreach/followupModal';
import { thankyouModal } from '../../ui/outreach/thankyouModal';

// ─── generate_other_message_type action ───────────────────────────

async function handleGenerateOtherMessageType({ ack, body, client, action }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  try {
    if (!('view' in body) || !body.view) { console.warn('generate_other_message_type: no view in body'); return; }

    const selectedMessageType = (action as any).selected_option.value;
    const { participantName, researcherName, researcherEmail, studyName } = JSON.parse(body.view.private_metadata || '{}');

    let nextModal: any;
    let modalName: string;

    switch (selectedMessageType) {
      case 'session_confirmation':
        nextModal = sessionConfirmationModal;
        modalName = 'session-confirmation';
        break;
      case 'session_reminder':
        nextModal = sessionReminderModal;
        modalName = 'session-reminder';
        break;
      case 'rescheduling_request':
        nextModal = reschedulingRequestModal;
        modalName = 'rescheduling-request';
        break;
      case 'follow_up':
        nextModal = followupModal;
        modalName = 'followup';
        break;
      case 'thank_you':
        nextModal = thankyouModal;
        modalName = 'thankyou';
        break;
      default:
        console.error('Invalid message type selected:', selectedMessageType);
        return;
    }

    // Update the current modal in place — overflow menu actions don't
    // provide a trigger_id, so views.push would fail.
    await client.views.update({
      view_id: body.view.id,
      view: {
        ...nextModal,
        private_metadata: JSON.stringify({
          studyName,
          participantName,
          researcherName,
          researcherEmail,
        }),
      } as View,
    });
  } catch (error) {
    console.error('Error opening message type modal:', error);
  }
}

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
  handleGenerateOtherMessageType,
  handleGenerateOtherMessageType as generateOtherMessageType,
  handleCopyEmailFormatted,
  handleCopyEmailFormatted as copyEmailFormatted,
};

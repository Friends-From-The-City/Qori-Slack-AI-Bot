/**
 * messagingHandler.ts — Message type switcher + copy email action
 *
 * Extracted from events.js. Contains:
 * - generate_other_message_type action (opens selected message type modal)
 * - copy_email_formatted action (opens copy-to-clipboard email modal)
 */

import type { BlockActionContext } from '../../../../types/handlers';

const { copyEmailModal } = require('../../ui/outreach/copyEmailModal');
const { sessionConfirmationModal } = require('../../ui/outreach/sessionConfirmationModal');
const { sessionReminderModal } = require('../../ui/outreach/sessionReminderModal');
const { reschedulingRequestModal } = require('../../ui/outreach/reschedulingRequestModal');
const { followupModal } = require('../../ui/outreach/followupModal');
const { thankyouModal } = require('../../ui/outreach/thankyouModal');

// ─── generate_other_message_type action ───────────────────────────

async function handleGenerateOtherMessageType({ ack, body, client, action }: BlockActionContext): Promise<void> {
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

    // Open the selected modal with the existing participant data
    await client.views.push({
      trigger_id: (body as any).trigger_id,
      view: {
        ...nextModal,
        private_metadata: JSON.stringify({
          studyName,
          participantName,
          researcherName,
          researcherEmail,
        }),
      },
    });
  } catch (error: any) {
    console.error('Error opening message type modal:', error);
  }
}

// ─── copy_email_formatted action ──────────────────────────────────

async function handleCopyEmailFormatted({ ack, body, client }: BlockActionContext): Promise<void> {
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
      } catch (error: any) {
        console.error('Error parsing private_metadata:', error);
      }
    }

    console.log('Opening copy email modal with messageBody:', messageBody);

    // Open the copy email modal with the message body
    await client.views.push({
      trigger_id: (body as any).trigger_id,
      view: copyEmailModal({
        messageBody,
      }),
    });
  } catch (error: any) {
    console.error('Error opening copy email modal:', error);
  }
}

module.exports = {
  handleGenerateOtherMessageType,
  handleCopyEmailFormatted,
};

/**
 * runTemplateHandler.ts — /run-template command + modal
 *
 * Extracted from events.js. Opens the research shareout modal, handles
 * the type_select action (updates submit button label), and processes
 * the research-shareout-submit view submission.
 *
 * IMPORTANT: views.update does NOT take trigger_id — only view_id and hash.
 */

import type { SlashCommandContext, BlockActionContext, ViewSubmissionContext } from '../../../../types/handlers';

const { researchShareoutModal } = require('../../ui/researchShareoutModal');

// ─── /run-template command ────────────────────────────────────────

async function runTemplateCommandHandler({ ack, command, client }: SlashCommandContext): Promise<void> {
  try {
    await ack();

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        ...researchShareoutModal,
        private_metadata: JSON.stringify({ channelId: command.channel_id }),
      },
    });
  } catch (error: any) {
    console.error('Error opening modal:', error.data || error);
  }
}

// ─── type_select action (update submit label) ─────────────────────

async function handleTypeSelect({ ack, body, client, action }: BlockActionContext): Promise<void> {
  try {
    await ack();
    if (!('view' in body) || !body.view) { console.warn('type_select: no view in body'); return; }

    const selectedValue = (action as any).selected_option.value;

    const submitLabels: Record<string, string> = {
      stakeholder_summary: '\ud83c\udfaf Create Summary',
      executive_readout: '\ud83d\udcca Create Readout',
      team_shareout: '\ud83d\udc65 Create Shareout',
      research_report: '\ud83d\udccb Generate Report',
      policy_brief: '\ud83c\udfe1\ufe0f Create Brief',
      design_requirements: '\ud83d\udcc4 Generate Requirements',
    };

    const submitText = submitLabels[selectedValue] || 'Select Shareout Type';

    const updatedModal = JSON.parse(JSON.stringify(researchShareoutModal));
    updatedModal.submit = {
      type: 'plain_text',
      text: submitText,
    };

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: updatedModal,
    });
  } catch (error: any) {
    console.error('Error updating view:', error.data || error);
  }
}

// ─── research-shareout-submit ─────────────────────────────────────

async function handleResearchShareoutSubmission({ ack, body, view, client }: ViewSubmissionContext): Promise<void> {
  await ack();

  const values = (view as any).state.values;
  const { channelId } = JSON.parse(view.private_metadata);
  const extract = (id: string) => values[id]?.input?.value || '';
  const getSelect = (id: string) => values[id]?.input?.selected_option?.value || '';

  const data = {
    shareoutType: getSelect('shareout_type'),
    studyName: extract('study_name'),
    targetAudience: extract('target_audience'),
    meetingDeadline: extract('meeting_deadline'),
    findings: extract('synthesized_findings'),
    deliveryChannel: extract('delivery_channel'),
    peopleToNotify: extract('people_to_notify'),
    channelId,
  };

  console.log(`\ud83d\udce2 Research Shareout Submitted: study=${data.studyName}, channel=${data.deliveryChannel}`);

  await client.chat.postMessage({
    channel: body.user.id,
    text: `\u2705 *Your research shareout has been recorded!*\n\n*Study:* ${data.studyName}\n*To be shared in:* ${data.deliveryChannel}`,
  });
}

module.exports = {
  runTemplateCommandHandler,
  handleTypeSelect,
  handleResearchShareoutSubmission,
};

/**
 * Survey Privacy Review Handler — Slack adapter for content governance.
 *
 * Presents open-text entries for researcher privacy review.
 * Actions: USE AS WRITTEN (clear), EDIT SAFE VERSION (redacted), DO NOT USE (restricted).
 *
 * This handler is an ADAPTER to the content governance service.
 * Privacy state, disposition, and eligibility logic live in
 * content-governance.service.ts, not here.
 */

import type {
  SlackActionMiddlewareArgs,
  BlockAction,
  ButtonAction,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
  AllMiddlewareArgs,
} from '@slack/bolt';
import type { View } from '@slack/types';
import sequelize from '../../../database';
import type { SurveyQualitativeEntry, PiiStatus } from '../../../database/models/survey_qualitative_entry';
import {
  getRawContentForReview,
  buildDispositionUpdate,
  isPrivacyReviewComplete,
  countByStatus,
} from '../../../services/content-governance.service';

const QualitativeEntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;

interface PrivacyReviewMeta {
  evidenceSourceId: number;
  projectId: number;
  projectSlug: string;
  topic: string;
  topicSlug: string;
  surveyName: string;
  questionFocus: string;
  sourceIntent: string;
}

/**
 * Handle "Review Responses" button click — opens privacy review modal.
 */
export async function handlePrivacyReviewAction(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const meta: PrivacyReviewMeta = JSON.parse(action.value || '{}');

  const entries = await QualitativeEntryModel.findAll({
    where: { evidence_source_id: meta.evidenceSourceId, pii_status: 'pending' },
    order: [['field_name', 'ASC'], ['source_row_index', 'ASC']],
    limit: 10, // Review in batches for Slack block limits
  });

  if (entries.length === 0) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: '✅ All open-text responses have been reviewed. Qualitative synthesis can proceed.',
    });
    return;
  }

  const modal = buildPrivacyReviewModal(entries as SurveyQualitativeEntry[], meta);

  await client.views.open({
    trigger_id: body.trigger_id,
    view: modal as unknown as View,
  });
}

/**
 * Handle privacy review modal submission.
 */
export async function handlePrivacyReviewSubmission(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: PrivacyReviewMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;
  const values = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;

  // Process each entry's disposition
  const entries = await QualitativeEntryModel.findAll({
    where: { evidence_source_id: meta.evidenceSourceId, pii_status: 'pending' },
    order: [['id', 'ASC']],
    limit: 10,
  });

  for (const entry of entries) {
    const entryId = (entry as unknown as { id: number }).id;
    const dispositionBlock = values[`disposition_${entryId}`];
    const redactBlock = values[`redact_text_${entryId}`];

    const selectedAction = dispositionBlock?.disposition_select?.selected_option as { value: string } | null | undefined;
    if (!selectedAction) continue;

    const newStatus = selectedAction.value as PiiStatus;
    const editedRedactedText = redactBlock?.redact_input?.value as string | undefined;

    try {
      const update = buildDispositionUpdate(
        'pending',
        newStatus,
        userId,
        newStatus === 'redacted' ? editedRedactedText : undefined,
      );

      await entry.update(update);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Error reviewing entry: ${msg}`,
      });
      return;
    }
  }

  // Check if more entries need review
  const remaining = await QualitativeEntryModel.count({
    where: { evidence_source_id: meta.evidenceSourceId, pii_status: 'pending' },
  });

  if (remaining > 0) {
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ Batch reviewed. *${remaining} entries* remaining.`,
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Continue Review' },
            style: 'primary',
            action_id: 'survey_privacy_review',
            value: JSON.stringify(meta),
          },
        },
      ],
      text: `${remaining} entries remaining for privacy review.`,
    });
  } else {
    // All reviewed — count statuses
    const allEntries = await QualitativeEntryModel.findAll({
      where: { evidence_source_id: meta.evidenceSourceId },
    });
    const statusCounts = countByStatus(
      allEntries as Array<{ pii_status: PiiStatus }>,
    );

    await client.chat.postMessage({
      channel: userId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Privacy review complete.*\n\n• Cleared: ${statusCounts.clear}\n• Redacted: ${statusCounts.redacted}\n• Restricted: ${statusCounts.restricted}\n\nQori can now analyze the approved responses.`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Generate Survey Synthesis' },
              style: 'primary',
              action_id: 'survey_run_synthesis',
              value: JSON.stringify(meta),
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Generate Response Categories' },
              action_id: 'survey_generate_codebook',
              value: JSON.stringify(meta),
            },
          ],
        },
      ],
      text: 'Privacy review complete. Qori can now analyze the approved responses.',
    });
  }
}

function buildPrivacyReviewModal(
  entries: SurveyQualitativeEntry[],
  meta: PrivacyReviewMeta,
): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: 'Review each response. Choose how Qori may use it:\n\n• *Use as written* — the response is safe\n• *Edit safe version* — remove sensitive information\n• *Do not use* — exclude from analysis',
      }],
    },
    { type: 'divider' },
  ];

  for (const entry of entries) {
    const { originalText, suggestedSafeText } = getRawContentForReview(entry);
    const entryId = (entry as unknown as { id: number }).id;
    const truncated = (originalText ?? '').slice(0, 200) + ((originalText?.length ?? 0) > 200 ? '...' : '');

    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*${entry.display_respondent_id}* — ${entry.field_display_name}\n"${truncated}"`,
      }],
    });

    blocks.push({
      type: 'input',
      block_id: `disposition_${entryId}`,
      label: { type: 'plain_text', text: 'How should Qori use this response?' },
      element: {
        type: 'static_select',
        action_id: 'disposition_select',
        options: [
          { text: { type: 'plain_text', text: 'Use as written' }, value: 'clear' },
          { text: { type: 'plain_text', text: 'Edit safe version' }, value: 'redacted' },
          { text: { type: 'plain_text', text: 'Do not use' }, value: 'restricted' },
        ],
      },
    });

    // Editable redacted text field (visible for all — used only when "Edit safe version" selected)
    blocks.push({
      type: 'input',
      block_id: `redact_text_${entryId}`,
      optional: true,
      label: { type: 'plain_text', text: 'Edited safe version (only used with "Edit safe version")' },
      element: {
        type: 'plain_text_input',
        action_id: 'redact_input',
        multiline: true,
        initial_value: suggestedSafeText ?? '',
      },
    });

    blocks.push({ type: 'divider' });
  }

  return {
    type: 'modal',
    callback_id: 'survey_privacy_review_modal',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Review Responses' },
    submit: { type: 'plain_text', text: 'Save Review' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

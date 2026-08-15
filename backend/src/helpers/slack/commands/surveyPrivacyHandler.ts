/**
 * Survey Privacy Review Handler — Slack adapter for content governance.
 *
 * Presents open-text entries for researcher privacy review.
 * Distinguishes FLAGGED (phone/email detected) from UNFLAGGED entries.
 *
 * Actions:
 *   USE AS WRITTEN (clear) — individual or bulk for unflagged
 *   EDIT SAFE VERSION (redacted) — editable scrubbed derivative
 *   DO NOT USE (restricted) — excluded from analysis
 *
 * Privacy state and disposition logic live in content-governance.service.ts.
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

const ENTRIES_PER_PAGE = 10;

interface PrivacyReviewMeta {
  evidenceSourceId: number;
  projectId: number;
  projectSlug: string;
  topic: string;
  topicSlug: string;
  surveyName: string;
  questionFocus: string;
  sourceIntent: string;
  entryIds: number[];
}

export async function handlePrivacyReviewAction(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const rawMeta = JSON.parse(action.value || '{}');

  const entries = await QualitativeEntryModel.findAll({
    where: { evidence_source_id: rawMeta.evidenceSourceId, pii_status: 'pending' },
    order: [['source_row_index', 'ASC'], ['field_name', 'ASC'], ['id', 'ASC']],
    limit: ENTRIES_PER_PAGE,
  });

  if (entries.length === 0) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: '\u2705 All open-text responses have been reviewed.',
    });
    return;
  }

  const remaining = await QualitativeEntryModel.count({
    where: { evidence_source_id: rawMeta.evidenceSourceId, pii_status: 'pending' },
  });

  const meta: PrivacyReviewMeta = {
    ...rawMeta,
    entryIds: entries.map(e => (e as unknown as { id: number }).id),
  };

  const modal = buildPrivacyReviewModal(entries as SurveyQualitativeEntry[], meta, remaining);

  await client.views.open({
    trigger_id: body.trigger_id,
    view: modal as unknown as View,
  });
}

export async function handlePrivacyReviewSubmission(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: PrivacyReviewMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;
  const values = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;

  // Load ONLY the entries whose IDs were in the modal
  const entryIds = meta.entryIds ?? [];
  const entries = await QualitativeEntryModel.findAll({
    where: { id: entryIds },
    order: [['id', 'ASC']],
  });

  const bulkClearSelected = (values.bulk_clear_unflagged?.bulk_clear_check?.selected_options as Array<{ value: string }> | undefined);
  const doBulkClear = bulkClearSelected?.some(o => o.value === 'bulk_clear') ?? false;

  for (const entry of entries) {
    const entryId = (entry as unknown as { id: number }).id;
    const entryMeta = (entry as SurveyQualitativeEntry).metadata as Record<string, unknown>;
    const autoScrub = entryMeta?.auto_scrub as { has_detections?: boolean } | undefined;
    const isFlagged = autoScrub?.has_detections ?? false;

    if (!isFlagged && doBulkClear) {
      const dispositionBlock = values[`disposition_${entryId}`];
      const override = (dispositionBlock?.disposition_select?.selected_option as { value: string } | null)?.value;
      if (!override) {
        await entry.update(buildDispositionUpdate('pending', 'clear', userId));
        continue;
      }
    }

    const dispositionBlock = values[`disposition_${entryId}`];
    const selectedAction = (dispositionBlock?.disposition_select?.selected_option as { value: string } | null)?.value;
    if (!selectedAction) continue;

    const newStatus = selectedAction as PiiStatus;
    const editedText = (values[`redact_text_${entryId}`]?.redact_input?.value as string | undefined);

    try {
      const update = buildDispositionUpdate(
        'pending', newStatus, userId,
        newStatus === 'redacted' ? editedText : undefined,
      );
      await entry.update(update);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await client.chat.postMessage({ channel: userId, text: `\u274C Error: ${msg}` });
      return;
    }
  }

  const remaining = await QualitativeEntryModel.count({
    where: { evidence_source_id: meta.evidenceSourceId, pii_status: 'pending' },
  });

  if (remaining > 0) {
    const baseMeta = { evidenceSourceId: meta.evidenceSourceId, projectId: meta.projectId, projectSlug: meta.projectSlug, topic: meta.topic, topicSlug: meta.topicSlug, surveyName: meta.surveyName, questionFocus: meta.questionFocus, sourceIntent: meta.sourceIntent };
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `\u2705 Batch reviewed. *${remaining} entries* remaining.` }, accessory: { type: 'button', text: { type: 'plain_text', text: 'Continue Review' }, style: 'primary', action_id: 'survey_privacy_review', value: JSON.stringify(baseMeta) } },
      ],
      text: `${remaining} entries remaining.`,
    });
  } else {
    const allEntries = await QualitativeEntryModel.findAll({ where: { evidence_source_id: meta.evidenceSourceId } });
    const statusCounts = countByStatus(allEntries as Array<{ pii_status: PiiStatus }>);
    const baseMeta = { evidenceSourceId: meta.evidenceSourceId, projectId: meta.projectId, projectSlug: meta.projectSlug, topic: meta.topic, topicSlug: meta.topicSlug, surveyName: meta.surveyName, questionFocus: meta.questionFocus, sourceIntent: meta.sourceIntent };
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `\u2705 *Privacy review complete.*\n\n\u2022 Cleared: ${statusCounts.clear}\n\u2022 Redacted: ${statusCounts.redacted}\n\u2022 Restricted: ${statusCounts.restricted}` } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Generate Survey Synthesis' }, style: 'primary', action_id: 'survey_run_synthesis', value: JSON.stringify(baseMeta) },
          { type: 'button', text: { type: 'plain_text', text: 'Generate Response Categories' }, action_id: 'survey_generate_codebook', value: JSON.stringify({ ...baseMeta, surveyName: meta.surveyName, questionFocus: meta.questionFocus }) },
        ] },
      ],
      text: 'Privacy review complete.',
    });
  }
}

function buildPrivacyReviewModal(
  entries: SurveyQualitativeEntry[],
  meta: PrivacyReviewMeta,
  totalPending: number,
): Record<string, unknown> {
  const flagged: SurveyQualitativeEntry[] = [];
  const unflagged: SurveyQualitativeEntry[] = [];
  for (const entry of entries) {
    const m = entry.metadata as Record<string, unknown>;
    const s = m?.auto_scrub as { has_detections?: boolean } | undefined;
    (s?.has_detections ? flagged : unflagged).push(entry);
  }

  const blocks: Record<string, unknown>[] = [
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*${totalPending} responses* need review (showing ${entries.length}).` }] },
    { type: 'divider' },
  ];

  if (unflagged.length > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*No identifiers detected* (${unflagged.length} entries)` }] });
    blocks.push({
      type: 'input', block_id: 'bulk_clear_unflagged', optional: true,
      label: { type: 'plain_text', text: ' ' },
      element: { type: 'checkboxes', action_id: 'bulk_clear_check', options: [{ text: { type: 'plain_text', text: `Use all ${unflagged.length} unflagged responses as written` }, value: 'bulk_clear' }] },
    });
    for (const entry of unflagged) {
      const eid = (entry as unknown as { id: number }).id;
      const excerpt = (entry.entry_text ?? '').slice(0, 120) + ((entry.entry_text?.length ?? 0) > 120 ? '...' : '');
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*${entry.display_respondent_id}* \u2014 ${entry.field_display_name}\n"${excerpt}"` }] });
      blocks.push({
        type: 'input', block_id: `disposition_${eid}`, optional: true,
        label: { type: 'plain_text', text: `Override for ${entry.display_respondent_id}` },
        element: { type: 'static_select', action_id: 'disposition_select', placeholder: { type: 'plain_text', text: 'Use bulk action above' }, options: [
          { text: { type: 'plain_text', text: 'Use as written' }, value: 'clear' },
          { text: { type: 'plain_text', text: 'Edit safe version' }, value: 'redacted' },
          { text: { type: 'plain_text', text: 'Do not use' }, value: 'restricted' },
        ] },
      });
    }
    blocks.push({ type: 'divider' });
  }

  if (flagged.length > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*\u26A0\uFE0F Identifiers detected* (${flagged.length} entries) \u2014 individual review required` }] });
    for (const entry of flagged) {
      const eid = (entry as unknown as { id: number }).id;
      const { originalText, suggestedSafeText } = getRawContentForReview(entry);
      const m = entry.metadata as Record<string, unknown>;
      const s = m?.auto_scrub as { phone_count?: number; email_count?: number } | undefined;
      const reasons: string[] = [];
      if ((s?.phone_count ?? 0) > 0) reasons.push('Phone detected');
      if ((s?.email_count ?? 0) > 0) reasons.push('Email detected');
      const truncOrig = (originalText ?? '').slice(0, 200) + ((originalText?.length ?? 0) > 200 ? '...' : '');

      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*${entry.display_respondent_id}* \u2014 ${entry.field_display_name}\n*Reason:* ${reasons.join(', ')}\n*Original:* "${truncOrig}"` }] });
      blocks.push({
        type: 'input', block_id: `disposition_${eid}`,
        label: { type: 'plain_text', text: 'How should Qori use this response?' },
        element: { type: 'static_select', action_id: 'disposition_select', options: [
          { text: { type: 'plain_text', text: 'Use suggested safe version' }, value: 'redacted' },
          { text: { type: 'plain_text', text: 'Use original as written' }, value: 'clear' },
          { text: { type: 'plain_text', text: 'Do not use' }, value: 'restricted' },
        ] },
      });
      blocks.push({
        type: 'input', block_id: `redact_text_${eid}`, optional: true,
        label: { type: 'plain_text', text: 'Suggested safe version (edit if needed)' },
        element: { type: 'plain_text_input', action_id: 'redact_input', multiline: true, initial_value: suggestedSafeText ?? '' },
      });
      blocks.push({ type: 'divider' });
    }
  }

  return {
    type: 'modal', callback_id: 'survey_privacy_review_modal',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Review Responses' },
    submit: { type: 'plain_text', text: 'Save Review' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

/**
 * Survey Privacy Review Handler — Slack adapter for content governance.
 *
 * Plain-language UX. Flagged/unflagged separation.
 * Bulk approval NEVER affects flagged entries (invariant).
 *
 * Privacy state lives in content-governance.service.ts (domain service).
 */

import type {
  SlackActionMiddlewareArgs, BlockAction, ButtonAction,
  SlackViewMiddlewareArgs, ViewSubmitAction, AllMiddlewareArgs,
} from '@slack/bolt';
import type { View } from '@slack/types';
import sequelize from '../../../database';
import type { SurveyQualitativeEntry, PiiStatus } from '../../../database/models/survey_qualitative_entry';
import type { EvidenceSource } from '../../../database/models/evidence_source';
import {
  getRawContentForReview, buildDispositionUpdate, countByStatus,
} from '../../../services/content-governance.service';
import { assertProjectAccess, AuthorizationError } from '../../../services/authorization.service';

const EvidenceSourceModelRef = sequelize.models.EvidenceSource as typeof EvidenceSource;

const EntryModel = sequelize.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry;
const ENTRIES_PER_PAGE = 10;

interface PrivacyMeta {
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

// ═══════════════════════════════════════════════════════════════════════
// ACTION: Open review modal
// ═══════════════════════════════════════════════════════════════════════

export async function handlePrivacyReviewAction(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();
  const raw = JSON.parse(action.value || '{}');

  // ── GOV-1: Resolve canonical project from persisted evidence source ──
  const privacySource = await EvidenceSourceModelRef.findByPk(raw.evidenceSourceId);
  if (!privacySource) {
    await client.chat.postMessage({ channel: body.user.id, text: 'Error: evidence source not found.' });
    return;
  }
  if (raw.projectId && raw.projectId !== privacySource.project_id) {
    console.warn(`[AUTH] Privacy review: metadata projectId=${raw.projectId} != canonical ${privacySource.project_id}`);
    await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: project context mismatch.' });
    return;
  }
  try {
    await assertProjectAccess(body.user.id, privacySource.project_id, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Privacy review denied: user=${body.user.id} project=${privacySource.project_id}`);
      await client.chat.postMessage({ channel: body.user.id, text: 'Access denied: you are not a member of this project.' });
      return;
    }
    throw err;
  }

  const entries = await EntryModel.findAll({
    where: { evidence_source_id: raw.evidenceSourceId, pii_status: 'pending' },
    order: [['source_row_index', 'ASC'], ['field_name', 'ASC'], ['id', 'ASC']],
    limit: ENTRIES_PER_PAGE,
  });

  if (entries.length === 0) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: '\u2705 All responses have been reviewed.',
    });
    return;
  }

  const remaining = await EntryModel.count({
    where: { evidence_source_id: raw.evidenceSourceId, pii_status: 'pending' },
  });

  const meta: PrivacyMeta = {
    ...raw,
    entryIds: entries.map(e => (e as unknown as { id: number }).id),
  };

  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildModal(entries as SurveyQualitativeEntry[], meta, remaining) as unknown as View,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SUBMISSION: Process dispositions
// ═══════════════════════════════════════════════════════════════════════

export async function handlePrivacyReviewSubmission(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();
  const meta: PrivacyMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  // ── GOV-1: Resolve canonical project from persisted evidence source ──
  const submissionPrivacySource = await EvidenceSourceModelRef.findByPk(meta.evidenceSourceId);
  if (!submissionPrivacySource) {
    await client.chat.postMessage({ channel: userId, text: 'Error: evidence source not found.' });
    return;
  }
  if (meta.projectId && meta.projectId !== submissionPrivacySource.project_id) {
    console.warn(`[AUTH] Privacy review submission: metadata projectId=${meta.projectId} != canonical ${submissionPrivacySource.project_id}`);
    await client.chat.postMessage({ channel: userId, text: 'Access denied: project context mismatch.' });
    return;
  }
  try {
    await assertProjectAccess(userId, submissionPrivacySource.project_id, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Privacy review submission denied: user=${userId} project=${submissionPrivacySource.project_id}`);
      await client.chat.postMessage({ channel: userId, text: 'Access denied: you are not a member of this project.' });
      return;
    }
    throw err;
  }

  const vals = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;

  const entries = await EntryModel.findAll({ where: { id: meta.entryIds ?? [] }, order: [['id', 'ASC']] });

  const bulkSel = (vals.bulk_clear_unflagged?.bulk_clear_check?.selected_options as Array<{ value: string }> | undefined);
  const doBulk = bulkSel?.some(o => o.value === 'bulk_clear') ?? false;

  for (const entry of entries) {
    const eid = (entry as unknown as { id: number }).id;
    const isFlagged = ((entry as SurveyQualitativeEntry).metadata as Record<string, unknown>)
      ?.auto_scrub && ((entry as SurveyQualitativeEntry).metadata as Record<string, unknown>).auto_scrub
      ? (((entry as SurveyQualitativeEntry).metadata as Record<string, unknown>).auto_scrub as { has_detections?: boolean }).has_detections ?? false
      : false;

    // INVARIANT: bulk approval NEVER affects flagged entries
    if (!isFlagged && doBulk) {
      const override = (vals[`disposition_${eid}`]?.disposition_select?.selected_option as { value: string } | null)?.value;
      if (!override) {
        await entry.update(buildDispositionUpdate('pending', 'clear', userId));
        continue;
      }
    }

    const sel = (vals[`disposition_${eid}`]?.disposition_select?.selected_option as { value: string } | null)?.value;
    if (!sel) continue;

    const status = sel as PiiStatus;
    const editedText = vals[`redact_text_${eid}`]?.redact_input?.value as string | undefined;

    // Map plain-language actions to internal states
    const effectiveStatus = sel === 'use_suggested' ? 'redacted' as PiiStatus : status;
    const effectiveText = effectiveStatus === 'redacted'
      ? (editedText ?? (entry as SurveyQualitativeEntry).redacted_text ?? '')
      : undefined;

    try {
      await entry.update(buildDispositionUpdate('pending', effectiveStatus, userId, effectiveText));
    } catch (err) {
      await client.chat.postMessage({ channel: userId, text: `\u274C Error: ${(err as Error).message}` });
      return;
    }
  }

  const remaining = await EntryModel.count({
    where: { evidence_source_id: meta.evidenceSourceId, pii_status: 'pending' },
  });

  const baseMeta = {
    evidenceSourceId: meta.evidenceSourceId, projectId: meta.projectId,
    projectSlug: meta.projectSlug, topic: meta.topic, topicSlug: meta.topicSlug,
    surveyName: meta.surveyName, questionFocus: meta.questionFocus, sourceIntent: meta.sourceIntent,
  };

  if (remaining > 0) {
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `\u2705 Batch reviewed. *${remaining} responses* remaining.` },
          accessory: { type: 'button', text: { type: 'plain_text', text: 'Continue Review' }, style: 'primary',
            action_id: 'survey_privacy_review', value: JSON.stringify(baseMeta) } },
      ],
      text: `${remaining} responses remaining.`,
    });
  } else {
    const all = await EntryModel.findAll({ where: { evidence_source_id: meta.evidenceSourceId } });
    const counts = countByStatus(all as Array<{ pii_status: PiiStatus }>);
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `\u2705 *All responses reviewed.*\n\n\u2022 Approved as written: ${counts.clear}\n\u2022 Approved with edits: ${counts.redacted}\n\u2022 Excluded: ${counts.restricted}` } },
        { type: 'section', text: { type: 'mrkdwn', text: 'Qori can now group similar approved responses for review.' } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Review Groupings' }, style: 'primary',
            action_id: 'survey_generate_codebook', value: JSON.stringify({ ...baseMeta, surveyName: meta.surveyName, questionFocus: meta.questionFocus }) },
        ] },
      ],
      text: 'All responses reviewed. Review groupings next.',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildModal(
  entries: SurveyQualitativeEntry[],
  meta: PrivacyMeta,
  totalPending: number,
): Record<string, unknown> {
  const flagged: SurveyQualitativeEntry[] = [];
  const unflagged: SurveyQualitativeEntry[] = [];
  for (const e of entries) {
    const m = e.metadata as Record<string, unknown>;
    const s = m?.auto_scrub as { has_detections?: boolean } | undefined;
    (s?.has_detections ? flagged : unflagged).push(e);
  }

  const blocks: Record<string, unknown>[] = [];

  // Page summary
  const parts: string[] = [`*${totalPending} responses* need review (showing ${entries.length} on this page)`];
  if (unflagged.length > 0) parts.push(`\n${unflagged.length} response${unflagged.length !== 1 ? 's' : ''}: No phone/email pattern detected`);
  if (flagged.length > 0) parts.push(`${flagged.length} response${flagged.length !== 1 ? 's' : ''}: Needs individual review`);

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: parts.join('\n') }] });
  blocks.push({ type: 'divider' });

  // ── UNFLAGGED SECTION ──
  if (unflagged.length > 0) {
    blocks.push({ type: 'header', text: { type: 'plain_text', text: 'Ready for Bulk Review' } });
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Qori did not detect phone or email patterns in these responses. Automated screening is limited; please review the visible responses before approving.' }] });
    blocks.push({
      type: 'input', block_id: 'bulk_clear_unflagged', optional: true,
      label: { type: 'plain_text', text: ' ' },
      element: { type: 'checkboxes', action_id: 'bulk_clear_check', options: [
        { text: { type: 'plain_text', text: `I reviewed these ${unflagged.length} responses and approve them as written` }, value: 'bulk_clear' },
      ] },
    });

    for (const entry of unflagged) {
      const eid = (entry as unknown as { id: number }).id;
      const excerpt = (entry.entry_text ?? '').slice(0, 150) + ((entry.entry_text?.length ?? 0) > 150 ? '...' : '');
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*Respondent ${entry.display_respondent_id}* \u2014 ${entry.field_display_name}\n"${excerpt}"` }] });
      blocks.push({
        type: 'input', block_id: `disposition_${eid}`, optional: true,
        label: { type: 'plain_text', text: `Override for respondent ${entry.display_respondent_id}` },
        element: { type: 'static_select', action_id: 'disposition_select',
          placeholder: { type: 'plain_text', text: 'Use bulk action above' },
          options: [
            { text: { type: 'plain_text', text: 'Use as written' }, value: 'clear' },
            { text: { type: 'plain_text', text: 'Edit safe version' }, value: 'redacted' },
            { text: { type: 'plain_text', text: 'Do not use this response' }, value: 'restricted' },
          ] },
      });
    }
    blocks.push({ type: 'divider' });
  }

  // ── FLAGGED SECTION ──
  if (flagged.length > 0) {
    blocks.push({ type: 'header', text: { type: 'plain_text', text: 'Needs Individual Review' } });

    for (const entry of flagged) {
      const eid = (entry as unknown as { id: number }).id;
      const { originalText, suggestedSafeText } = getRawContentForReview(entry);
      const m = entry.metadata as Record<string, unknown>;
      const s = m?.auto_scrub as { phone_count?: number; email_count?: number } | undefined;
      const reasons: string[] = [];
      if ((s?.phone_count ?? 0) > 0) reasons.push('Phone detected');
      if ((s?.email_count ?? 0) > 0) reasons.push('Email detected');
      const truncOrig = (originalText ?? '').slice(0, 250) + ((originalText?.length ?? 0) > 250 ? '...' : '');

      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*Respondent ${entry.display_respondent_id}* \u2014 ${entry.field_display_name}\n*Flagged:* ${reasons.join(', ')}\n*Original response:* "${truncOrig}"` }] });
      blocks.push({
        type: 'input', block_id: `disposition_${eid}`,
        label: { type: 'plain_text', text: `Respondent ${entry.display_respondent_id} \u2014 ${entry.field_display_name}` },
        element: { type: 'static_select', action_id: 'disposition_select', options: [
          { text: { type: 'plain_text', text: 'Use suggested version' }, value: 'use_suggested' },
          { text: { type: 'plain_text', text: 'Edit suggested version' }, value: 'redacted' },
          { text: { type: 'plain_text', text: 'Use original response' }, value: 'clear' },
          { text: { type: 'plain_text', text: 'Do not use this response' }, value: 'restricted' },
        ] },
      });
      blocks.push({
        type: 'input', block_id: `redact_text_${eid}`, optional: true,
        label: { type: 'plain_text', text: 'Suggested safe version (edit if needed)' },
        element: { type: 'plain_text_input', action_id: 'redact_input', multiline: true,
          initial_value: suggestedSafeText ?? '' },
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

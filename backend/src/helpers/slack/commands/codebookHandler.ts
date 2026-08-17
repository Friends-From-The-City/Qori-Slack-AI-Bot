/**
 * Codebook Handler — generate + review qualitative response groupings.
 *
 * Researcher-facing language: "groupings" (not codebook/codes/categories).
 * Internal domain: survey_codebooks, survey_codes.
 *
 * Two-interaction flow to avoid expired trigger_id:
 * 1. handleGenerateCodebook: ack → model work → persist → DM with button
 * 2. handleOpenGroupingReview: fresh trigger_id → views.open from DB
 */

import type {
  SlackActionMiddlewareArgs, BlockAction, ButtonAction,
  SlackViewMiddlewareArgs, ViewSubmitAction, AllMiddlewareArgs,
} from '@slack/bolt';
import type { View } from '@slack/types';
import type { SurveyCode } from '../../../database/models/survey_code';
import { getDefaultModelName } from '../../modelProvider';
import {
  getEligibleEntries, createDraftCodebook, getCodebookWithCodes,
  acceptCodebook, updateCode, addResearcherCode,
  findActiveUnacceptedCodebook, findAcceptedCodebook,
  CodebookNotReadyError, CodebookImmutableError,
} from '../../../services/survey-codebook.service';
import { findActiveUnacceptedRun, findAcceptedCodingRun } from '../../../services/survey-coding-run.service';
import { generateDraftCodes, CodebookGenerationError } from '../../survey/codebookGenerator';
import { getProjectById } from '../../../services/project.service';
import { assertProjectAccess, AuthorizationError } from '../../../services/authorization.service';
import sequelize from '../../../database';
import type { EvidenceSource } from '../../../database/models/evidence_source';

const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;

const CODES_PER_PAGE = 5;

interface CodebookMeta {
  evidenceSourceId: number;
  projectId: number;
  codebookId?: number;
  surveyName: string;
  page?: number;
  totalCodes?: number;
}

// ═══════════════════════════════════════════════════════════════════════
// RESUME STATE — canonical next action from Postgres
// ═══════════════════════════════════════════════════════════════════════

/**
 * Determine the correct resume CTA for an accepted codebook based on coding run state.
 * Returns Slack blocks for the appropriate next action.
 */
async function buildResumeCTA(
  codebookId: number,
  evidenceSourceId: number,
  projectId: number,
  surveyName: string,
): Promise<{ text: string; blocks: unknown[] }> {
  const acceptedRun = await findAcceptedCodingRun(evidenceSourceId);
  if (acceptedRun) {
    return {
      text: 'Your survey analysis is ready. Click "Create Survey Summary" to continue.',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn',
          text: '✅ *Groupings and matches are already approved.* Your survey analysis is ready.' } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Create Survey Summary' }, style: 'primary',
            action_id: 'survey_run_synthesis',
            value: JSON.stringify({ evidenceSourceId, projectId, projectSlug: surveyName, surveyName }),
          },
        ] },
      ],
    };
  }

  const activeRun = await findActiveUnacceptedRun(evidenceSourceId, codebookId);
  if (activeRun) {
    return {
      text: 'Matches are ready for review. Click "Review Matches" to continue.',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn',
          text: '✅ *Groupings already approved.* Review the matches before Qori counts or summarizes them.' } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Review Matches' }, style: 'primary',
            action_id: 'survey_open_match_review',
            value: JSON.stringify({
              codingRunId: (activeRun as unknown as { id: number }).id,
              codebookId, evidenceSourceId, projectId, surveyName,
            }),
          },
        ] },
      ],
    };
  }

  // No coding run yet — offer Match Responses
  return {
    text: 'Groupings already approved. Click "Match Responses" to continue.',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn',
        text: '✅ *Groupings already approved.* Qori can now compare the approved responses with your groupings.' } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Match Responses' }, style: 'primary',
          action_id: 'survey_generate_assignments',
          value: JSON.stringify({ codebookId, evidenceSourceId, projectId, surveyName }),
        },
      ] },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 1: Generate groupings (no modal — posts DM with review button)
// ═══════════════════════════════════════════════════════════════════════

export async function handleGenerateCodebook(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack(); // Ack immediately — do NOT hold trigger_id across model work

  const rawMeta = JSON.parse(action.value || '{}');
  const userId = body.user.id;

  try {
    const evidenceSourceId = rawMeta.evidenceSourceId;
    const surveyName = rawMeta.surveyName ?? 'Survey';

    // ── GOV-1: Resolve canonical project from persisted evidence source ──
    const evidenceSource = await EvidenceSourceModel.findByPk(evidenceSourceId);
    if (!evidenceSource) {
      await client.chat.postMessage({ channel: userId, text: 'Error: evidence source not found.' });
      return;
    }
    const projectId = evidenceSource.project_id;
    // Verify against metadata — tampered/stale transport context → fail closed
    if (rawMeta.projectId && rawMeta.projectId !== projectId) {
      console.warn(`[AUTH] Codebook generate: metadata projectId=${rawMeta.projectId} != canonical ${projectId}`);
      await client.chat.postMessage({ channel: userId, text: 'Access denied: project context mismatch.' });
      return;
    }
    try {
      await assertProjectAccess(userId, projectId, client);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        console.warn(`[AUTH] Codebook generate denied: user=${userId} project=${projectId}`);
        await client.chat.postMessage({ channel: userId, text: 'Access denied: you are not a member of this project.' });
        return;
      }
      throw err;
    }

    // Resume: check for already-accepted codebook first
    const acceptedCodebook = await findAcceptedCodebook(evidenceSourceId);
    if (acceptedCodebook) {
      const codebookId = (acceptedCodebook as unknown as { id: number }).id;
      const cta = await buildResumeCTA(codebookId, evidenceSourceId, projectId, surveyName);
      await client.chat.postMessage({ channel: userId, blocks: cta.blocks as never[], text: cta.text });
      return;
    }

    // Idempotency: check for existing active unaccepted codebook
    const existingActive = await findActiveUnacceptedCodebook(evidenceSourceId);

    if (existingActive) {
      // Reuse existing groupings — do NOT regenerate
      const existingCodes = await getCodebookWithCodes((existingActive as unknown as { id: number }).id);
      const codeCount = existingCodes?.codes.length ?? 0;

      await client.chat.postMessage({
        channel: userId,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn',
            text: `Qori already prepared *${codeCount} proposed groupings*. Open them for review.` } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Review Groupings' }, style: 'primary',
              action_id: 'survey_open_grouping_review',
              value: JSON.stringify({
                codebookId: (existingActive as unknown as { id: number }).id,
                evidenceSourceId,
                projectId,
                surveyName,
              }),
            },
          ] },
        ],
        text: `Qori already prepared ${codeCount} proposed groupings. Click "Review Groupings" to review.`,
      });
      return;
    }

    // No active draft — generate new groupings
    await client.chat.postMessage({
      channel: userId,
      text: 'Qori is grouping similar responses. This may take a moment.',
    });

    const entries = await getEligibleEntries(evidenceSourceId);
    const project = await getProjectById(projectId);

    const proposedCodes = await generateDraftCodes(
      entries,
      project?.problem_statement ?? null,
      rawMeta.questionFocus ?? null,
    );

    const { codebook, codes } = await createDraftCodebook(
      evidenceSourceId, projectId, null, userId,
      proposedCodes,
      {
        approach: 'mixed_inductive_deductive',
        model: getDefaultModelName(),
        entry_count: entries.length,
      },
    );

    // Post DM with FRESH review button
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn',
          text: `Qori found *${codes.length} proposed groupings*.\n\nQori grouped similar responses together based on what people said. Review the groupings before Qori uses them in the final survey summary.` } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Review Groupings' }, style: 'primary',
            action_id: 'survey_open_grouping_review',
            value: JSON.stringify({
              codebookId: (codebook as unknown as { id: number }).id,
              evidenceSourceId,
              projectId,
              surveyName,
            }),
          },
        ] },
      ],
      text: `Qori found ${codes.length} proposed groupings. Click "Review Groupings" to review.`,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[codebook] Generation error:', err);
    if (err instanceof CodebookNotReadyError || err instanceof CodebookGenerationError) {
      await client.chat.postMessage({ channel: userId, text: `Qori couldn't create groupings: ${message}` });
    } else {
      await client.chat.postMessage({ channel: userId, text: "Qori couldn't open the grouping review. Try again." });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 2: Open review modal (fresh trigger_id from button click)
// ═══════════════════════════════════════════════════════════════════════

export async function handleOpenGroupingReview(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const rawMeta = JSON.parse(action.value || '{}');
  const userId = body.user.id;

  if (!rawMeta.codebookId) {
    await client.chat.postMessage({
      channel: userId,
      text: "Qori couldn't find the groupings. Try generating them again.",
    });
    return;
  }

  // ── GOV-1: Resolve canonical project from persisted evidence source ──
  const reviewSource = await EvidenceSourceModel.findByPk(rawMeta.evidenceSourceId);
  if (!reviewSource) {
    await client.chat.postMessage({ channel: userId, text: 'Error: evidence source not found.' });
    return;
  }
  try {
    await assertProjectAccess(userId, reviewSource.project_id, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Grouping review denied: user=${userId} project=${reviewSource.project_id}`);
      await client.chat.postMessage({ channel: userId, text: 'Access denied: you are not a member of this project.' });
      return;
    }
    throw err;
  }

  const result = await getCodebookWithCodes(rawMeta.codebookId);
  if (!result) {
    await client.chat.postMessage({
      channel: userId,
      text: "Qori couldn't find the groupings. Try generating them again.",
    });
    return;
  }

  // Resume: if codebook is already accepted, show next action instead of review modal
  if (result.codebook.status === 'accepted') {
    const cta = await buildResumeCTA(
      rawMeta.codebookId,
      rawMeta.evidenceSourceId,
      rawMeta.projectId,
      rawMeta.surveyName ?? 'Survey',
    );
    await client.chat.postMessage({ channel: userId, blocks: cta.blocks as never[], text: cta.text });
    return;
  }

  const meta: CodebookMeta = {
    evidenceSourceId: rawMeta.evidenceSourceId,
    projectId: rawMeta.projectId,
    codebookId: rawMeta.codebookId,
    surveyName: rawMeta.surveyName ?? 'Survey',
    page: 0,
    totalCodes: result.codes.length,
  };

  try {
    await client.views.open({
      trigger_id: body.trigger_id, // FRESH trigger_id from this button click
      view: buildReviewModal(result.codes as SurveyCode[], meta) as unknown as View,
    });
  } catch (err) {
    console.error('[codebook] views.open error:', err);
    await client.chat.postMessage({
      channel: body.user.id,
      text: "Qori couldn't open the grouping review. Try clicking Review Groupings again.",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 3: Handle review submission (paginated)
// ═══════════════════════════════════════════════════════════════════════

export async function handleCodebookReviewSubmission(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: CodebookMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  // ── GOV-1: Resolve canonical project from persisted evidence source ──
  const submissionSource = await EvidenceSourceModel.findByPk(meta.evidenceSourceId);
  if (!submissionSource) {
    await client.chat.postMessage({ channel: userId, text: 'Error: evidence source not found.' });
    return;
  }
  if (meta.projectId && meta.projectId !== submissionSource.project_id) {
    console.warn(`[AUTH] Codebook review: metadata projectId=${meta.projectId} != canonical ${submissionSource.project_id}`);
    await client.chat.postMessage({ channel: userId, text: 'Access denied: project context mismatch.' });
    return;
  }
  try {
    await assertProjectAccess(userId, submissionSource.project_id, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Codebook review submission denied: user=${userId} project=${submissionSource.project_id}`);
      await client.chat.postMessage({ channel: userId, text: 'Access denied: you are not a member of this project.' });
      return;
    }
    throw err;
  }

  if (!meta.codebookId) {
    await client.chat.postMessage({ channel: userId, text: "Groupings not found." });
    return;
  }

  const result = await getCodebookWithCodes(meta.codebookId);
  if (!result) {
    await client.chat.postMessage({ channel: userId, text: "Groupings not found." });
    return;
  }

  const vals = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;
  const page = meta.page ?? 0;
  const startIdx = page * CODES_PER_PAGE;
  const endIdx = Math.min(startIdx + CODES_PER_PAGE, result.codes.length);
  const pageCodes = result.codes.slice(startIdx, endIdx);
  const isLastPage = endIdx >= result.codes.length;

  try {
    // Process this page's decisions
    for (const code of pageCodes) {
      const cid = (code as unknown as { id: number }).id;
      const sel = (vals[`code_decision_${cid}`]?.code_action?.selected_option as { value: string } | null)?.value;

      if (sel === 'keep') {
        await updateCode(cid, { status: 'accepted' });
      } else if (sel === 'remove') {
        await updateCode(cid, { status: 'removed' });
      } else if (sel === 'edit') {
        const editLabel = vals[`code_edit_label_${cid}`]?.edit_label_input?.value as string | undefined;
        const editDef = vals[`code_edit_def_${cid}`]?.edit_def_input?.value as string | undefined;
        const editInclude = vals[`code_edit_include_${cid}`]?.edit_include_input?.value as string | undefined;
        const editExclude = vals[`code_edit_exclude_${cid}`]?.edit_exclude_input?.value as string | undefined;

        const updates: Partial<Pick<SurveyCode, 'status' | 'label' | 'definition' | 'include_when' | 'exclude_when'>> = { status: 'accepted' };
        if (editLabel?.trim()) updates.label = editLabel.trim();
        if (editDef?.trim()) updates.definition = editDef.trim();
        if (editInclude?.trim()) updates.include_when = editInclude.trim();
        if (editExclude !== undefined) updates.exclude_when = editExclude?.trim() || null;

        await updateCode(cid, updates);
      }
    }

    // Navigate to next page or finalize
    if (!isLastPage) {
      const allCodes = await getCodebookWithCodes(meta.codebookId);
      if (allCodes) {
        const nextMeta = { ...meta, page: page + 1 };
        await client.views.open({
          trigger_id: body.trigger_id,
          view: buildReviewModal(allCodes.codes as SurveyCode[], nextMeta) as unknown as View,
        });
      }
      return;
    }

    // Last page — process Add Grouping if provided
    const addLabel = vals.add_grouping_label?.add_label_input?.value as string | undefined;
    if (addLabel?.trim()) {
      const addDef = (vals.add_grouping_def?.add_def_input?.value as string | undefined)?.trim() ?? '';
      const addInclude = (vals.add_grouping_include?.add_include_input?.value as string | undefined)?.trim() ?? '';
      if (addDef && addInclude) {
        const codeKey = addLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        await addResearcherCode(meta.codebookId, {
          code_key: codeKey, label: addLabel.trim(),
          definition: addDef, include_when: addInclude,
        });
      }
    }

    // Accept the codebook
    try {
      await acceptCodebook(meta.codebookId, userId);
    } catch (acceptErr) {
      if (acceptErr instanceof CodebookImmutableError) {
        // Already accepted — treat as resume, show correct next action
        const cta = await buildResumeCTA(
          meta.codebookId, meta.evidenceSourceId, meta.projectId, meta.surveyName,
        );
        await client.chat.postMessage({ channel: userId, blocks: cta.blocks as never[], text: cta.text });
        return;
      }
      throw acceptErr;
    }

    await client.chat.postMessage({
      channel: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn',
          text: '\u2705 *Groupings approved.* Qori can now compare the approved responses with the groupings you reviewed.' } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Match Responses' }, style: 'primary',
            action_id: 'survey_generate_assignments',
            value: JSON.stringify({
              codebookId: meta.codebookId,
              evidenceSourceId: meta.evidenceSourceId,
              projectId: meta.projectId,
              surveyName: meta.surveyName,
            }),
          },
        ] },
      ],
      text: 'Groupings approved. Click "Match Responses" to continue.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await client.chat.postMessage({ channel: userId, text: `Couldn't approve groupings: ${message}` });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildReviewModal(
  allCodes: SurveyCode[],
  meta: CodebookMeta,
): Record<string, unknown> {
  const page = meta.page ?? 0;
  const totalPages = Math.ceil(allCodes.length / CODES_PER_PAGE);
  const startIdx = page * CODES_PER_PAGE;
  const endIdx = Math.min(startIdx + CODES_PER_PAGE, allCodes.length);
  const pageCodes = allCodes.slice(startIdx, endIdx);
  const isLastPage = endIdx >= allCodes.length;
  const pageLabel = totalPages > 1 ? ` \u2014 Page ${page + 1} of ${totalPages}` : '';

  const blocks: Record<string, unknown>[] = [
    { type: 'context', elements: [{ type: 'mrkdwn',
      text: `*${allCodes.length} proposed groupings*${pageLabel}\n\nQori grouped similar responses together. For each grouping: *Keep*, *Edit*, or *Remove*.` }] },
    { type: 'divider' },
  ];

  for (const code of pageCodes) {
    const cid = (code as unknown as { id: number }).id;

    let text = `*${code.label}*\n\n*What this grouping means:* ${code.definition}\n\n*Include responses like:* ${code.include_when}`;
    if (code.exclude_when) text += `\n\n*Do not include responses like:* ${code.exclude_when}`;

    blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
    blocks.push({
      type: 'input', block_id: `code_decision_${cid}`,
      label: { type: 'plain_text', text: `"${code.label}"` },
      element: { type: 'static_select', action_id: 'code_action',
        initial_option: { text: { type: 'plain_text', text: 'Keep' }, value: 'keep' },
        options: [
          { text: { type: 'plain_text', text: 'Keep' }, value: 'keep' },
          { text: { type: 'plain_text', text: 'Edit' }, value: 'edit' },
          { text: { type: 'plain_text', text: 'Remove' }, value: 'remove' },
        ] },
    });

    // Edit fields (optional)
    blocks.push({
      type: 'input', block_id: `code_edit_label_${cid}`, optional: true,
      label: { type: 'plain_text', text: 'Edit grouping name (only if editing)' },
      element: { type: 'plain_text_input', action_id: 'edit_label_input', initial_value: code.label },
    });
    blocks.push({
      type: 'input', block_id: `code_edit_def_${cid}`, optional: true,
      label: { type: 'plain_text', text: 'Edit what this grouping means' },
      element: { type: 'plain_text_input', action_id: 'edit_def_input', multiline: true, initial_value: code.definition },
    });
    blocks.push({
      type: 'input', block_id: `code_edit_include_${cid}`, optional: true,
      label: { type: 'plain_text', text: 'Edit include responses like' },
      element: { type: 'plain_text_input', action_id: 'edit_include_input', multiline: true, initial_value: code.include_when },
    });
    blocks.push({
      type: 'input', block_id: `code_edit_exclude_${cid}`, optional: true,
      label: { type: 'plain_text', text: 'Edit do not include responses like' },
      element: { type: 'plain_text_input', action_id: 'edit_exclude_input', multiline: true, initial_value: code.exclude_when ?? '' },
    });
    blocks.push({ type: 'divider' });
  }

  // Add Grouping (last page only)
  if (isLastPage) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '*Add a grouping* (optional) \u2014 create your own grouping that Qori missed.' }] });
    blocks.push({
      type: 'input', block_id: 'add_grouping_label', optional: true,
      label: { type: 'plain_text', text: 'New grouping name' },
      element: { type: 'plain_text_input', action_id: 'add_label_input',
        placeholder: { type: 'plain_text', text: 'e.g., Technical Interruption' } },
    });
    blocks.push({
      type: 'input', block_id: 'add_grouping_def', optional: true,
      label: { type: 'plain_text', text: 'What this grouping means' },
      element: { type: 'plain_text_input', action_id: 'add_def_input', multiline: true },
    });
    blocks.push({
      type: 'input', block_id: 'add_grouping_include', optional: true,
      label: { type: 'plain_text', text: 'Include responses like' },
      element: { type: 'plain_text_input', action_id: 'add_include_input', multiline: true },
    });
  }

  return {
    type: 'modal', callback_id: 'codebook_review_modal',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: totalPages > 1 ? `Groupings (${page + 1}/${totalPages})` : 'Review Groupings' },
    submit: { type: 'plain_text', text: isLastPage ? 'Approve Groupings' : 'Continue \u2192' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

/**
 * Match Review Handler — generate + review entry-to-grouping assignments.
 *
 * Researcher-facing language: "matches" and "groupings" (not assignments/codes/coding).
 * Internal domain: survey_coding_runs, survey_coding_assignments.
 *
 * Two-interaction flow (same as codebookHandler):
 * 1. handleGenerateAssignments: ack → model work → persist → DM with review button
 * 2. handleOpenMatchReview: fresh trigger_id → views.open from DB
 * 3. handleMatchReviewSubmission: paginated review → acceptance
 */

import type {
  SlackActionMiddlewareArgs, BlockAction, ButtonAction,
  SlackViewMiddlewareArgs, ViewSubmitAction, AllMiddlewareArgs,
} from '@slack/bolt';
import type { View } from '@slack/types';
import { getDefaultModelName } from '../../modelProvider';
import {
  findActiveUnacceptedRun,
  createDraftCodingRun,
  getCodingRunWithDetails,
  processPageReviewDecisions,
  acceptCodingRun,
  promoteAcceptedPatterns,
  CodingRunNotReadyError,
  CodingRunImmutableError,
  type EntryReviewDecision,
  type CodingRunDetails,
} from '../../../services/survey-coding-run.service';
import { getEligibleEntries, getCodebookWithCodes } from '../../../services/survey-codebook.service';
import { generateDraftAssignments, AssignmentGenerationError } from '../../survey/assignmentGenerator';
import { getProjectById } from '../../../services/project.service';
import type { EntryReviewStatus } from '../../../database/models/survey_coding_entry_review';

const ENTRIES_PER_PAGE = 5;

interface MatchReviewMeta {
  codingRunId: number;
  codebookId: number;
  evidenceSourceId: number;
  projectId: number;
  studyId: number | null;
  surveyName: string;
  /** Review IDs shown on this modal page — used to match form values to DB rows. */
  visibleReviewIds: number[];
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 1: Generate assignments (no modal — posts DM with review button)
// ═══════════════════════════════════════════════════════════════════════

export async function handleGenerateAssignments(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack(); // Ack immediately — do NOT hold trigger_id across model work

  const rawMeta = JSON.parse(action.value || '{}');
  const userId = body.user.id;

  try {
    const codebookId = rawMeta.codebookId;
    const evidenceSourceId = rawMeta.evidenceSourceId;

    // Idempotency: check for existing active unaccepted run for this codebook
    const existingRun = await findActiveUnacceptedRun(evidenceSourceId, codebookId);

    if (existingRun) {
      // Reuse existing run
      const details = await getCodingRunWithDetails((existingRun as unknown as { id: number }).id);
      const entryCount = details?.entryReviews.length ?? 0;

      await client.chat.postMessage({
        channel: userId,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn',
            text: `Qori already matched *${entryCount} responses* to your groupings. Review the matches.` } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Review Matches' }, style: 'primary',
              action_id: 'survey_open_match_review',
              value: JSON.stringify({
                codingRunId: (existingRun as unknown as { id: number }).id,
                codebookId,
                evidenceSourceId,
                projectId: rawMeta.projectId,
                studyId: rawMeta.studyId ?? null,
                surveyName: rawMeta.surveyName ?? 'Survey',
              }),
            },
          ] },
        ],
        text: `Qori already matched ${entryCount} responses. Click "Review Matches" to review.`,
      });
      return;
    }

    // No active run — generate assignments
    await client.chat.postMessage({
      channel: userId,
      text: 'Qori is matching responses to your approved groupings. This may take a moment.',
    });

    const entries = await getEligibleEntries(evidenceSourceId);
    const codebookResult = await getCodebookWithCodes(codebookId);
    if (!codebookResult) {
      await client.chat.postMessage({ channel: userId, text: 'Qori couldn\'t find the approved groupings.' });
      return;
    }

    const acceptedCodes = codebookResult.codes.filter(c => c.status === 'accepted');
    const project = await getProjectById(rawMeta.projectId);

    const generatedAssignments = await generateDraftAssignments(
      entries,
      acceptedCodes.map(c => ({
        public_id: c.public_id,
        label: c.label,
        definition: c.definition,
        include_when: c.include_when,
        exclude_when: c.exclude_when ?? null,
      })),
      project?.problem_statement ?? null,
      rawMeta.questionFocus ?? null,
    );

    const { run, assignmentCount, entryReviewCount } = await createDraftCodingRun(
      evidenceSourceId, codebookId, rawMeta.projectId, rawMeta.studyId ?? null,
      userId, generatedAssignments, entries,
      {
        approach: 'assignment_matching',
        model: getDefaultModelName(),
        entry_count: entries.length,
        code_count: acceptedCodes.length,
      },
    );

    // Post DM with review button
    await client.chat.postMessage({
      channel: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn',
          text: `Qori matched *${entryReviewCount} responses* to your groupings.\n\nQori suggested which groupings fit each response. Review the matches before Qori counts or summarizes them.` } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Review Matches' }, style: 'primary',
            action_id: 'survey_open_match_review',
            value: JSON.stringify({
              codingRunId: (run as unknown as { id: number }).id,
              codebookId,
              evidenceSourceId,
              projectId: rawMeta.projectId,
              studyId: rawMeta.studyId ?? null,
              surveyName: rawMeta.surveyName ?? 'Survey',
            }),
          },
        ] },
      ],
      text: `Qori matched ${entryReviewCount} responses. Click "Review Matches" to review.`,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[match-review] Generation error:', err);
    if (err instanceof AssignmentGenerationError) {
      await client.chat.postMessage({ channel: userId, text: `Qori couldn't match responses: ${message}` });
    } else {
      await client.chat.postMessage({ channel: userId, text: 'Qori couldn\'t match responses. Try again.' });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 2: Open review modal (fresh trigger_id from button click)
// ═══════════════════════════════════════════════════════════════════════

export async function handleOpenMatchReview(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const rawMeta = JSON.parse(action.value || '{}');

  if (!rawMeta.codingRunId) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: 'Qori couldn\'t find the matches. Try generating them again.',
    });
    return;
  }

  const details = await getCodingRunWithDetails(rawMeta.codingRunId);
  if (!details) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: 'Qori couldn\'t find the matches. Try generating them again.',
    });
    return;
  }

  // Count pending entries (only show unreviewed)
  const pendingReviews = details.entryReviews.filter(r => r.status === 'pending');
  if (pendingReviews.length === 0) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: '\u2705 All responses have been reviewed.',
    });
    return;
  }

  // Take first N pending entries (no offset — always first unresolved)
  const visibleReviews = pendingReviews.slice(0, ENTRIES_PER_PAGE);
  const visibleReviewIds = visibleReviews.map(r => (r as unknown as { id: number }).id);

  const meta: MatchReviewMeta = {
    codingRunId: rawMeta.codingRunId,
    codebookId: rawMeta.codebookId,
    evidenceSourceId: rawMeta.evidenceSourceId,
    projectId: rawMeta.projectId,
    studyId: rawMeta.studyId ?? null,
    surveyName: rawMeta.surveyName ?? 'Survey',
    visibleReviewIds,
  };

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildMatchReviewModal(details, pendingReviews.length, visibleReviews, meta) as unknown as View,
    });
  } catch (err) {
    console.error('[match-review] views.open error:', err);
    await client.chat.postMessage({
      channel: body.user.id,
      text: 'Qori couldn\'t open the match review. Try clicking Review Matches again.',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 3: Handle review submission (paginated)
// ═══════════════════════════════════════════════════════════════════════

export async function handleMatchReviewSubmission(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: MatchReviewMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  if (!meta.codingRunId) {
    await client.chat.postMessage({ channel: userId, text: 'Match review context not found.' });
    return;
  }

  const details = await getCodingRunWithDetails(meta.codingRunId);
  if (!details) {
    await client.chat.postMessage({ channel: userId, text: 'Matches not found.' });
    return;
  }

  const vals = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;

  // ── DIAGNOSTIC: trace the exact submission shape ──
  const valBlockIds = Object.keys(vals);
  console.log('[match-review-diag] meta.visibleReviewIds:', JSON.stringify(meta.visibleReviewIds ?? null));
  console.log('[match-review-diag] meta.codingRunId:', meta.codingRunId);
  console.log('[match-review-diag] vals block_ids:', JSON.stringify(valBlockIds));
  console.log('[match-review-diag] vals.bulk_approve_matches:', JSON.stringify(vals.bulk_approve_matches ?? null));
  // Log first entry block shape (safe — just block IDs and action structure, no PII)
  for (const blockId of valBlockIds.slice(0, 3)) {
    console.log(`[match-review-diag] vals[${blockId}]:`, JSON.stringify(vals[blockId]));
  }
  // ── END DIAGNOSTIC ──

  // Use visibleReviewIds from metadata to identify which entries this page showed.
  // This is the authoritative set — not derived from page offsets.
  const visibleReviewIds = new Set(meta.visibleReviewIds ?? []);
  const pageReviews = details.entryReviews.filter(
    r => visibleReviewIds.has((r as unknown as { id: number }).id),
  );

  console.log('[match-review-diag] visibleReviewIds set size:', visibleReviewIds.size);
  console.log('[match-review-diag] pageReviews matched:', pageReviews.length);
  console.log('[match-review-diag] total entryReviews in run:', details.entryReviews.length);
  console.log('[match-review-diag] entryReview IDs in run:', details.entryReviews.map(r => (r as unknown as { id: number }).id));

  try {
    // Check bulk approval
    const bulkSel = (vals.bulk_approve_matches?.bulk_approve_check?.selected_options as Array<{ value: string }> | undefined);
    const doBulk = bulkSel?.some(o => o.value === 'bulk_approve') ?? false;
    console.log('[match-review-diag] doBulk:', doBulk, 'bulkSel:', JSON.stringify(bulkSel ?? null));

    // Build decisions for each entry on this page
    const decisions: EntryReviewDecision[] = [];

    for (const review of pageReviews) {
      const reviewId = (review as unknown as { id: number }).id;
      const entryId = review.qualitative_entry_id;

      // Get assignments for this entry
      const entryAssignments = details.assignments.filter(
        a => a.qualitative_entry_id === entryId,
      );
      const proposedAssignments = entryAssignments.filter(a => a.origin === 'qori_proposed');
      const hasProposedMatches = proposedAssignments.length > 0;

      // Read entry status selection (null if user didn't interact with optional select)
      const statusBlock = vals[`entry_status_${reviewId}`];
      const statusSel = (statusBlock?.entry_status_select?.selected_option as { value: string } | null)?.value ?? null;

      // Read selected grouping IDs from checkboxes (may include initial_options)
      const codeBlock = vals[`match_codes_${reviewId}`];
      const selectedCodeIds = (
        codeBlock?.match_codes_select?.selected_options as Array<{ value: string }> | undefined
      )?.map(o => o.value) ?? [];
      const hasExplicitCodeSelection = codeBlock !== undefined && selectedCodeIds.length > 0;

      console.log(`[match-review-diag] entry reviewId=${reviewId} entryId=${entryId} proposedCount=${proposedAssignments.length} statusSel=${statusSel} codeBlockExists=${codeBlock !== undefined} selectedCodeIds=${JSON.stringify(selectedCodeIds)} hasExplicit=${hasExplicitCodeSelection} doBulk=${doBulk} hasProposed=${hasProposedMatches}`);

      // Determine effective status — individual override beats bulk
      let effectiveStatus: EntryReviewStatus;

      if (statusSel === 'no_grouping_applies' || statusSel === 'uncodable') {
        effectiveStatus = statusSel;
      } else if (statusSel === 'reviewed') {
        effectiveStatus = 'reviewed';
      } else if (doBulk && hasProposedMatches) {
        // Bulk approval applies to entries with Qori suggestions
        effectiveStatus = 'reviewed';
      } else if (!statusSel && !doBulk) {
        // No selection and no bulk — leave pending
        continue;
      } else {
        // Zero-suggestion entry without explicit selection — leave pending
        continue;
      }

      if (effectiveStatus === 'no_grouping_applies' || effectiveStatus === 'uncodable') {
        decisions.push({
          entryReviewId: reviewId,
          qualitativeEntryId: entryId,
          status: effectiveStatus,
          acceptAssignmentIds: [],
          rejectAssignmentIds: proposedAssignments.map(a => (a as unknown as { id: number }).id),
          newAssignments: [],
        });
      } else {
        // 'reviewed' — process grouping selections
        const proposedCodeIds = new Set(proposedAssignments.map(a => String(a.code_id)));

        // Build code ID lookup from accepted codes
        const codeIdByInternalId = new Map<string, number>();
        for (const code of details.acceptedCodes) {
          codeIdByInternalId.set(String(code.id), code.id);
        }

        // Determine which codes are selected:
        // 1. Explicit checkbox interaction → use those values
        // 2. Bulk approval (no checkbox interaction) → accept all proposed
        const effectiveSelectedIds: Set<string> = hasExplicitCodeSelection
          ? new Set(selectedCodeIds)
          : (doBulk && hasProposedMatches
            ? proposedCodeIds
            : new Set());

        const acceptIds: number[] = [];
        const rejectIds: number[] = [];
        const newAssigns: Array<{ codeId: number; rationale: string | null }> = [];

        // Process proposed assignments
        for (const a of proposedAssignments) {
          const aId = (a as unknown as { id: number }).id;
          if (effectiveSelectedIds.has(String(a.code_id))) {
            acceptIds.push(aId);
          } else {
            rejectIds.push(aId);
          }
        }

        // Process researcher-added groupings (selected but not proposed)
        for (const selectedId of effectiveSelectedIds) {
          if (!proposedCodeIds.has(selectedId)) {
            const codeId = codeIdByInternalId.get(selectedId);
            if (codeId) {
              newAssigns.push({ codeId, rationale: null });
            }
          }
        }

        // Validate: reviewed must have ≥1 accepted assignment
        if (acceptIds.length === 0 && newAssigns.length === 0) {
          // No codes selected and no proposed — leave pending
          continue;
        }

        decisions.push({
          entryReviewId: reviewId,
          qualitativeEntryId: entryId,
          status: 'reviewed',
          acceptAssignmentIds: acceptIds,
          rejectAssignmentIds: rejectIds,
          newAssignments: newAssigns,
        });
      }
    }

    // Process all decisions
    console.log(`[match-review-diag] decisions.length=${decisions.length} decisions:`, decisions.map(d => ({ id: d.entryReviewId, status: d.status, acceptCount: d.acceptAssignmentIds.length, rejectCount: d.rejectAssignmentIds.length })));

    if (decisions.length > 0) {
      await processPageReviewDecisions(meta.codingRunId, decisions, userId);
      console.log('[match-review-diag] processPageReviewDecisions completed');
    } else {
      console.log('[match-review-diag] WARNING: zero decisions produced — no DB mutations');
    }

    // Re-check pending count — canonical from DB
    const updatedDetails = await getCodingRunWithDetails(meta.codingRunId);
    const remainingPending = updatedDetails?.entryReviews.filter(r => r.status === 'pending') ?? [];
    const reviewedCount = updatedDetails?.entryReviews.filter(r => r.status === 'reviewed').length ?? 0;
    console.log(`[match-review-diag] POST-COMMIT: pending=${remainingPending.length} reviewed=${reviewedCount} total=${updatedDetails?.entryReviews.length}`);

    if (remainingPending.length > 0) {
      // More pages to review — post continue button
      await client.chat.postMessage({
        channel: userId,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn',
            text: `\u2705 Page reviewed. *${remainingPending.length} responses* remaining.` },
            accessory: { type: 'button', text: { type: 'plain_text', text: 'Continue Review' }, style: 'primary',
              action_id: 'survey_open_match_review',
              value: JSON.stringify({
                codingRunId: meta.codingRunId,
                codebookId: meta.codebookId,
                evidenceSourceId: meta.evidenceSourceId,
                projectId: meta.projectId,
                studyId: meta.studyId,
                surveyName: meta.surveyName,
              }),
            },
          },
        ],
        text: `Page reviewed. ${remainingPending.length} responses remaining.`,
      });
    } else {
      // All reviewed — accept the coding run
      try {
        const acceptedRun = await acceptCodingRun(meta.codingRunId, userId);

        // Two-stage promotion (idempotent)
        try {
          await promoteAcceptedPatterns(
            meta.codingRunId, meta.projectId, meta.studyId,
            meta.evidenceSourceId, userId,
          );
        } catch (promoErr) {
          console.error('[match-review] Evidence promotion failed (coding run accepted, promotion retryable):', promoErr);
          // Accepted coding state remains valid — promotion can be retried
        }

        // Build summary counts
        const finalDetails = await getCodingRunWithDetails(meta.codingRunId);
        const reviewedCount = finalDetails?.entryReviews.filter(r => r.status === 'reviewed').length ?? 0;
        const noGroupingCount = finalDetails?.entryReviews.filter(r => r.status === 'no_grouping_applies').length ?? 0;
        const uncodableCount = finalDetails?.entryReviews.filter(r => r.status === 'uncodable').length ?? 0;

        const summaryParts = [`\u2022 Matches approved: ${reviewedCount}`];
        if (noGroupingCount > 0) summaryParts.push(`\u2022 No grouping applies: ${noGroupingCount}`);
        if (uncodableCount > 0) summaryParts.push(`\u2022 Cannot be categorized: ${uncodableCount}`);

        await client.chat.postMessage({
          channel: userId,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn',
              text: `\u2705 *Matches approved.*\n\n${summaryParts.join('\n')}\n\nYour survey analysis is ready.` } },
            { type: 'actions', elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Create Survey Summary' }, style: 'primary',
                action_id: 'survey_run_synthesis',
                value: JSON.stringify({
                  evidenceSourceId: meta.evidenceSourceId,
                  projectId: meta.projectId,
                  projectSlug: meta.surveyName,
                  surveyName: meta.surveyName,
                }),
              },
            ] },
          ],
          text: 'Matches approved. Your survey analysis is ready.',
        });
      } catch (acceptErr) {
        if (acceptErr instanceof CodingRunNotReadyError) {
          await client.chat.postMessage({
            channel: userId,
            text: `Couldn't approve matches: ${acceptErr.message}`,
          });
        } else {
          throw acceptErr;
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[match-review] Submission error:', err);
    await client.chat.postMessage({ channel: userId, text: `Couldn't process match review: ${message}` });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildMatchReviewModal(
  details: CodingRunDetails,
  pendingCount: number,
  visibleReviews: CodingRunDetails['entryReviews'],
  meta: MatchReviewMeta,
): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [];

  // Header — remaining count from DB, not page math
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn',
      text: `*${pendingCount} responses* remaining\nQori suggested which groupings fit each response. Review the matches before Qori counts or summarizes them.` }],
  });
  blocks.push({ type: 'divider' });

  const pageReviews = visibleReviews;

  // Track entries with proposed matches for bulk approval
  let entriesWithProposals = 0;

  for (const review of pageReviews) {
    const reviewId = (review as unknown as { id: number }).id;
    const entryId = review.qualitative_entry_id;

    // Find the entry data from assignments (or load separately)
    const entryAssignments = details.assignments.filter(
      a => a.qualitative_entry_id === entryId,
    );
    const proposedAssignments = entryAssignments.filter(a => a.origin === 'qori_proposed');
    const hasProposedMatches = proposedAssignments.length > 0;

    if (hasProposedMatches) entriesWithProposals++;

    // Get entry display info from first assignment or fall back
    const displayInfo = entryAssignments[0];

    // Entry context — show respondent and governed text
    let entryText = '';
    if (displayInfo) {
      const text = displayInfo.entry_text_governed ?? '(text not available)';
      const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
      entryText = `*Respondent ${displayInfo.entry_display_respondent_id}* \u2014 ${displayInfo.entry_field_display_name}\n"${truncated}"`;
    } else {
      // Entry with no assignments — need to look it up
      entryText = `*Response* (entry ${entryId})`;
    }

    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: entryText }] });

    // Zero-suggestion notice
    if (!hasProposedMatches) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn',
        text: '_Qori did not find a matching grouping._' }] });
    }

    // Grouping selection — show ALL accepted codes, pre-check proposed ones
    const proposedCodeIds = new Set(proposedAssignments.map(a => a.code_id));

    // Build checkbox options: proposed first (pre-checked), then remaining
    const proposedOptions: Array<Record<string, unknown>> = [];
    const otherOptions: Array<Record<string, unknown>> = [];

    for (const code of details.acceptedCodes) {
      const isProposed = proposedCodeIds.has(code.id);
      const label = code.label.length > 65
        ? code.label.slice(0, 62) + '...'
        : code.label;
      const displayLabel = isProposed ? `${label} (Suggested)` : label;
      const truncatedLabel = displayLabel.length > 75
        ? displayLabel.slice(0, 72) + '...'
        : displayLabel;

      const option = {
        text: { type: 'plain_text', text: truncatedLabel },
        value: String(code.id),
      };

      if (isProposed) {
        proposedOptions.push(option);
      } else {
        otherOptions.push(option);
      }
    }

    const allOptions = [...proposedOptions, ...otherOptions];

    if (allOptions.length > 0) {
      const checkboxBlock: Record<string, unknown> = {
        type: 'input', block_id: `match_codes_${reviewId}`, optional: true,
        label: { type: 'plain_text', text: 'Groupings' },
        element: {
          type: 'checkboxes', action_id: 'match_codes_select',
          options: allOptions,
        },
      };

      // Pre-check proposed options
      if (proposedOptions.length > 0) {
        (checkboxBlock.element as Record<string, unknown>).initial_options = proposedOptions;
      }

      blocks.push(checkboxBlock);
    }

    // Entry status select
    blocks.push({
      type: 'input', block_id: `entry_status_${reviewId}`, optional: true,
      label: { type: 'plain_text', text: 'Status' },
      element: {
        type: 'static_select', action_id: 'entry_status_select',
        placeholder: { type: 'plain_text', text: hasProposedMatches ? 'Accept matches (default)' : 'Choose status' },
        options: [
          { text: { type: 'plain_text', text: 'Accept matches' }, value: 'reviewed' },
          { text: { type: 'plain_text', text: 'No grouping applies' }, value: 'no_grouping_applies' },
          { text: { type: 'plain_text', text: 'Cannot be categorized' }, value: 'uncodable' },
        ],
      },
    });

    blocks.push({ type: 'divider' });
  }

  // Bulk approval — only if entries with proposed matches exist
  if (entriesWithProposals > 0) {
    blocks.splice(2, 0, {
      type: 'input', block_id: 'bulk_approve_matches', optional: true,
      label: { type: 'plain_text', text: ' ' },
      element: {
        type: 'checkboxes', action_id: 'bulk_approve_check',
        options: [{
          text: { type: 'plain_text', text: `I reviewed these responses and approve Qori's suggested matches` },
          value: 'bulk_approve',
        }],
      },
    });
  }

  const isLastBatch = visibleReviews.length >= pendingCount;
  return {
    type: 'modal',
    callback_id: 'match_review_modal',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Review Matches' },
    submit: { type: 'plain_text', text: isLastBatch ? 'Approve Matches' : 'Continue \u2192' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

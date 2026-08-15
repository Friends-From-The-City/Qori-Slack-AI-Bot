/**
 * Codebook Handler — generate + review qualitative response categories.
 *
 * Plain-language UX: "Review Qori's proposed response categories"
 * Internally: versioned codebook with structured qualitative codes.
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
import type { SurveyCode } from '../../../database/models/survey_code';
import {
  getEligibleEntries,
  createDraftCodebook,
  getCodebookWithCodes,
  acceptCodebook,
  updateCode,
  addResearcherCode,
  CodebookNotReadyError,
  CodebookImmutableError,
} from '../../../services/survey-codebook.service';
import { generateDraftCodes, CodebookGenerationError } from '../../survey/codebookGenerator';
import { getAnalysisEligibleContent } from '../../../services/content-governance.service';
import { getProjectById } from '../../../services/project.service';
import type { SurveyQualitativeEntry } from '../../../database/models/survey_qualitative_entry';

interface CodebookMeta {
  evidenceSourceId: number;
  projectId: number;
  codebookId?: number;
  surveyName: string;
}

/**
 * Handle "Generate Response Categories" button.
 */
export async function handleGenerateCodebook(
  args: SlackActionMiddlewareArgs<BlockAction<ButtonAction>> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, action, client, body } = args;
  await ack();

  const rawMeta = JSON.parse(action.value || '{}');
  const userId = body.user.id;

  await client.chat.postMessage({
    channel: userId,
    text: 'Analyzing open-text responses to propose response categories...',
  });

  try {
    // Get eligible entries
    const entries = await getEligibleEntries(rawMeta.evidenceSourceId);

    // Get project context
    const project = await getProjectById(rawMeta.projectId);

    // Generate draft codes via model
    const proposedCodes = await generateDraftCodes(
      entries,
      project?.problem_statement ?? null,
      rawMeta.questionFocus ?? null,
    );

    // Persist codebook + codes
    const { codebook, codes } = await createDraftCodebook(
      rawMeta.evidenceSourceId,
      rawMeta.projectId,
      null, // study_id — discovery is project-scoped
      userId,
      proposedCodes,
      {
        approach: 'mixed_inductive_deductive',
        model: process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-6',
        entry_count: entries.length,
      },
    );

    // Open codebook review modal
    const meta: CodebookMeta = {
      evidenceSourceId: rawMeta.evidenceSourceId,
      projectId: rawMeta.projectId,
      codebookId: (codebook as unknown as { id: number }).id,
      surveyName: rawMeta.surveyName ?? 'Survey',
    };

    const modal = buildCodebookReviewModal(codes as SurveyCode[], entries, meta);

    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal as unknown as View,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof CodebookNotReadyError) {
      await client.chat.postMessage({
        channel: userId,
        text: `❌ ${message}`,
      });
    } else if (err instanceof CodebookGenerationError) {
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Codebook generation error: ${message}`,
      });
    } else {
      console.error('Error generating codebook:', err);
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Error generating response categories: ${message}`,
      });
    }
  }
}

/**
 * Handle codebook review modal submission.
 */
export async function handleCodebookReviewSubmission(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: CodebookMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  if (!meta.codebookId) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Codebook not found. Please try again.',
    });
    return;
  }

  const result = await getCodebookWithCodes(meta.codebookId);
  if (!result) {
    await client.chat.postMessage({
      channel: userId,
      text: '❌ Codebook not found.',
    });
    return;
  }

  const values = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;

  // Process each code's review decision
  for (const code of result.codes) {
    const codeId = (code as unknown as { id: number }).id;
    const decisionBlock = values[`code_decision_${codeId}`];
    const decision = (decisionBlock?.code_action?.selected_option as { value: string } | null)?.value;

    if (decision === 'accept') {
      await updateCode(codeId, { status: 'accepted' });
    } else if (decision === 'remove') {
      await updateCode(codeId, { status: 'removed' });
    }
    // 'proposed' stays as-is if no action taken
  }

  // Accept the codebook
  try {
    await acceptCodebook(meta.codebookId, userId);

    await client.chat.postMessage({
      channel: userId,
      text: `✅ *Response categories accepted.* The codebook is now the accepted analytical framework for this survey.\n\nFuture coding assignments (Slice 2B) will use these categories to classify individual responses.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await client.chat.postMessage({
      channel: userId,
      text: `❌ Could not accept categories: ${message}`,
    });
  }
}

function buildCodebookReviewModal(
  codes: SurveyCode[],
  entries: SurveyQualitativeEntry[],
  meta: CodebookMeta,
): Record<string, unknown> {
  const entryMap = new Map(entries.map(e => [e.public_id, e]));

  const blocks: Record<string, unknown>[] = [
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Qori grouped the open-text responses into *${codes.length} proposed categories*.\nReview these before Qori uses them for counting or synthesis.\n\nFor each category, choose *Accept* or *Remove*.`,
      }],
    },
    { type: 'divider' },
  ];

  for (const code of codes) {
    const codeId = (code as unknown as { id: number }).id;

    // Code details
    let codeText = `*${code.label}*\n\n*What this means:* ${code.definition}\n\n*Include when:* ${code.include_when}`;
    if (code.exclude_when) {
      codeText += `\n\n*Do not include when:* ${code.exclude_when}`;
    }

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: codeText },
    });

    // Decision
    blocks.push({
      type: 'input',
      block_id: `code_decision_${codeId}`,
      label: { type: 'plain_text', text: `Decision for "${code.label}"` },
      element: {
        type: 'static_select',
        action_id: 'code_action',
        initial_option: {
          text: { type: 'plain_text', text: 'Accept' },
          value: 'accept',
        },
        options: [
          { text: { type: 'plain_text', text: 'Accept' }, value: 'accept' },
          { text: { type: 'plain_text', text: 'Remove' }, value: 'remove' },
        ],
      },
    });

    blocks.push({ type: 'divider' });
  }

  return {
    type: 'modal',
    callback_id: 'codebook_review_modal',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Review Categories' },
    submit: { type: 'plain_text', text: 'Accept Response Categories' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

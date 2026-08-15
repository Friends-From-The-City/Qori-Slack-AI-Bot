/**
 * Codebook Handler — generate + review qualitative response categories.
 *
 * Plain-language UX: "Review Qori's proposed response categories"
 * Internally: versioned codebook with structured qualitative codes.
 *
 * Researcher actions: Accept, Edit, Remove, Add Category.
 * Uses existing LangChain/ChatAnthropic pattern for generation.
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
    const entries = await getEligibleEntries(rawMeta.evidenceSourceId);
    const project = await getProjectById(rawMeta.projectId);

    const proposedCodes = await generateDraftCodes(
      entries,
      project?.problem_statement ?? null,
      rawMeta.questionFocus ?? null,
    );

    const { codebook, codes } = await createDraftCodebook(
      rawMeta.evidenceSourceId,
      rawMeta.projectId,
      null,
      userId,
      proposedCodes,
      {
        approach: 'mixed_inductive_deductive',
        model: process.env.ANTHROPIC_MODEL_NAME || 'claude-sonnet-4-6',
        entry_count: entries.length,
      },
    );

    const meta: CodebookMeta = {
      evidenceSourceId: rawMeta.evidenceSourceId,
      projectId: rawMeta.projectId,
      codebookId: (codebook as unknown as { id: number }).id,
      surveyName: rawMeta.surveyName ?? 'Survey',
    };

    const modal = buildCodebookReviewModal(codes as SurveyCode[], meta);

    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal as unknown as View,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof CodebookNotReadyError || err instanceof CodebookGenerationError) {
      await client.chat.postMessage({ channel: userId, text: `❌ ${message}` });
    } else {
      console.error('Error generating codebook:', err);
      await client.chat.postMessage({ channel: userId, text: `❌ Error generating response categories: ${message}` });
    }
  }
}

/**
 * Handle codebook review modal submission.
 *
 * Processes: Accept/Edit/Remove per code + optional Add Category.
 * Then accepts the codebook version.
 */
export async function handleCodebookReviewSubmission(
  args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs,
): Promise<void> {
  const { ack, view, body, client } = args;
  await ack();

  const meta: CodebookMeta = JSON.parse(view.private_metadata || '{}');
  const userId = body.user.id;

  if (!meta.codebookId) {
    await client.chat.postMessage({ channel: userId, text: '❌ Codebook not found.' });
    return;
  }

  const result = await getCodebookWithCodes(meta.codebookId);
  if (!result) {
    await client.chat.postMessage({ channel: userId, text: '❌ Codebook not found.' });
    return;
  }

  const values = view.state.values as unknown as Record<string, Record<string, Record<string, unknown>>>;

  try {
    // Process each code's review decision
    for (const code of result.codes) {
      const codeId = (code as unknown as { id: number }).id;
      const decisionBlock = values[`code_decision_${codeId}`];
      const decision = (decisionBlock?.code_action?.selected_option as { value: string } | null)?.value;

      if (decision === 'accept') {
        await updateCode(codeId, { status: 'accepted' });
      } else if (decision === 'remove') {
        await updateCode(codeId, { status: 'removed' });
      } else if (decision === 'edit') {
        // Read edited fields
        const editLabel = values[`code_edit_label_${codeId}`]?.edit_label_input?.value as string | undefined;
        const editDef = values[`code_edit_def_${codeId}`]?.edit_def_input?.value as string | undefined;
        const editInclude = values[`code_edit_include_${codeId}`]?.edit_include_input?.value as string | undefined;
        const editExclude = values[`code_edit_exclude_${codeId}`]?.edit_exclude_input?.value as string | undefined;

        const updates: Partial<Pick<SurveyCode, 'status' | 'label' | 'definition' | 'include_when' | 'exclude_when'>> = { status: 'accepted' };
        if (editLabel?.trim()) updates.label = editLabel.trim();
        if (editDef?.trim()) updates.definition = editDef.trim();
        if (editInclude?.trim()) updates.include_when = editInclude.trim();
        if (editExclude !== undefined) updates.exclude_when = editExclude?.trim() || null;

        await updateCode(codeId, updates);
      }
    }

    // Process "Add Category" if provided
    const addLabelBlock = values.add_category_label;
    const addLabel = addLabelBlock?.add_label_input?.value as string | undefined;
    if (addLabel?.trim()) {
      const addDef = (values.add_category_def?.add_def_input?.value as string | undefined)?.trim() ?? '';
      const addInclude = (values.add_category_include?.add_include_input?.value as string | undefined)?.trim() ?? '';

      if (addDef && addInclude) {
        const codeKey = addLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        await addResearcherCode(meta.codebookId, {
          code_key: codeKey,
          label: addLabel.trim(),
          definition: addDef,
          include_when: addInclude,
        });
      }
    }

    // Accept the codebook
    await acceptCodebook(meta.codebookId, userId);

    await client.chat.postMessage({
      channel: userId,
      text: '✅ *Response categories accepted.* This is now the accepted analytical framework for this survey.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await client.chat.postMessage({ channel: userId, text: `❌ Could not accept categories: ${message}` });
  }
}

function buildCodebookReviewModal(
  codes: SurveyCode[],
  meta: CodebookMeta,
): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Qori grouped the open-text responses into *${codes.length} proposed categories*.\nReview these before Qori uses them for counting or synthesis.\n\nFor each category: *Accept*, *Edit* (modify details), or *Remove*.`,
      }],
    },
    { type: 'divider' },
  ];

  for (const code of codes) {
    const codeId = (code as unknown as { id: number }).id;

    let codeText = `*${code.label}*\n\n*What this means:* ${code.definition}\n\n*Include when:* ${code.include_when}`;
    if (code.exclude_when) {
      codeText += `\n\n*Do not include when:* ${code.exclude_when}`;
    }

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: codeText },
    });

    // Decision dropdown: Accept / Edit / Remove
    blocks.push({
      type: 'input',
      block_id: `code_decision_${codeId}`,
      label: { type: 'plain_text', text: `Decision for "${code.label}"` },
      element: {
        type: 'static_select',
        action_id: 'code_action',
        initial_option: { text: { type: 'plain_text', text: 'Accept' }, value: 'accept' },
        options: [
          { text: { type: 'plain_text', text: 'Accept' }, value: 'accept' },
          { text: { type: 'plain_text', text: 'Edit' }, value: 'edit' },
          { text: { type: 'plain_text', text: 'Remove' }, value: 'remove' },
        ],
      },
    });

    // Edit fields (optional — used only when "Edit" is selected)
    blocks.push({
      type: 'input',
      block_id: `code_edit_label_${codeId}`,
      optional: true,
      label: { type: 'plain_text', text: 'Edit label (only if editing)' },
      element: {
        type: 'plain_text_input',
        action_id: 'edit_label_input',
        initial_value: code.label,
      },
    });

    blocks.push({
      type: 'input',
      block_id: `code_edit_def_${codeId}`,
      optional: true,
      label: { type: 'plain_text', text: 'Edit definition (only if editing)' },
      element: {
        type: 'plain_text_input',
        action_id: 'edit_def_input',
        multiline: true,
        initial_value: code.definition,
      },
    });

    blocks.push({
      type: 'input',
      block_id: `code_edit_include_${codeId}`,
      optional: true,
      label: { type: 'plain_text', text: 'Edit include when (only if editing)' },
      element: {
        type: 'plain_text_input',
        action_id: 'edit_include_input',
        multiline: true,
        initial_value: code.include_when,
      },
    });

    blocks.push({
      type: 'input',
      block_id: `code_edit_exclude_${codeId}`,
      optional: true,
      label: { type: 'plain_text', text: 'Edit "do not include when" (only if editing)' },
      element: {
        type: 'plain_text_input',
        action_id: 'edit_exclude_input',
        multiline: true,
        initial_value: code.exclude_when ?? '',
      },
    });

    blocks.push({ type: 'divider' });
  }

  // Add Category section
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '*Add a category* (optional) — create your own response category.' }],
  });
  blocks.push({
    type: 'input', block_id: 'add_category_label', optional: true,
    label: { type: 'plain_text', text: 'New category label' },
    element: { type: 'plain_text_input', action_id: 'add_label_input', placeholder: { type: 'plain_text', text: 'e.g., Technical Interruption' } },
  });
  blocks.push({
    type: 'input', block_id: 'add_category_def', optional: true,
    label: { type: 'plain_text', text: 'Definition' },
    element: { type: 'plain_text_input', action_id: 'add_def_input', multiline: true, placeholder: { type: 'plain_text', text: 'What this category means' } },
  });
  blocks.push({
    type: 'input', block_id: 'add_category_include', optional: true,
    label: { type: 'plain_text', text: 'Include when' },
    element: { type: 'plain_text_input', action_id: 'add_include_input', multiline: true, placeholder: { type: 'plain_text', text: 'When a response should receive this category' } },
  });

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

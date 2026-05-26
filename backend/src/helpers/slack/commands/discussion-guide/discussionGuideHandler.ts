/**
 * discussionGuideHandler.ts — Discussion guide modal opener + submission
 *
 * v2.0: Cascade-driven redesign.
 * - Study name displayed as non-editable context block (not text input)
 * - Research focus pre-filled from brief's research_objectives
 * - Research questions pre-filled from brief's research_questions
 * - Methodology pre-selected from brief's methodology_selection
 * - Cascade gate: when required vars missing, show warning-only view
 * - Single study fetch (was duplicated)
 *
 * v1.0: Lead moderator converted to users_select (PR #157)
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, SlackViewMiddlewareArgs, BlockAction, ViewSubmitAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../../github';
import { resolveStudyFromName } from '../../../../services/research_study.service';
import { getProjectById } from '../../../../services/project.service';
import { processYamlTemplate } from '../../../yamlProcessor';
import { addStudyStatus } from '../../../../services/study-status.service';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../../ui/studyResultBlocks';
import { readStudyVariablesByContext, type VariableContext } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';
import {
  discussionGuideModal,
  DG_STUDY_DISPLAY_BLOCK_ID,
  METHODOLOGY_LABEL_TO_VALUE,
  METHODOLOGY_VALUE_TO_TEXT,
} from '../../ui/discussionGuideModal';

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { initial_value?: string; [key: string]: unknown };
  elements?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

// ─── Template input contract ──────────────────────────────────────

interface DiscussionGuideTemplateInput {
  selected_study: string;
  study_name: string;
  research_focus: string | null;
  research_questions: string | null;
  research_method: string;
  session_length: string;
  task_count: string;
  lead_researcher: string;
}

// ─── Cascade formatting helpers ─────────────────────────────────

interface ResearchQuestion {
  id?: string;
  question?: string;
  priority?: string;
}

/** Format research_objectives (array of strings) as bullet list for pre-fill. */
function formatObjectivesForPrefill(objectives: unknown): string {
  if (!Array.isArray(objectives)) return '';
  return objectives
    .map(obj => typeof obj === 'string' ? `• ${obj}` : '')
    .filter(Boolean)
    .join('\n');
}

/** Format research_questions (array of {id, question, priority}) for pre-fill. */
function formatQuestionsForPrefill(questions: unknown): string {
  if (!Array.isArray(questions)) return '';
  return questions
    .map((q: ResearchQuestion) => {
      const id = q.id || '';
      const question = q.question || '';
      const priority = q.priority ? ` (${q.priority})` : '';
      return id && question ? `${id}${priority}: ${question}` : question || '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Map cascade methodology label to select option value. Returns null if no match. */
function resolveMethodologyValue(cascadeMethod: unknown): string | null {
  if (typeof cascadeMethod !== 'string' || !cascadeMethod) return null;
  return METHODOLOGY_LABEL_TO_VALUE[cascadeMethod] || null;
}

// ─── Modal opener ─────────────────────────────────────────────────

async function openDiscussionGuideModal({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();

  if (!('view' in body) || !body.view) {
    console.warn('Discussion guide opener received non-modal action context');
    return;
  }

  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const selectedFromView = body.view.state?.values?.study_selection?.study_select?.selected_option || null;
    const studyName: string = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    const studyId: string | null = selectedFromView?.value || meta.studyId || null;

    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: '❌ Please select a study before creating a discussion guide.',
      });
      return;
    }

    const userId = body.user.id;

    // ── Single study fetch for all downstream uses ──
    let studyPath: string | null = null;
    let leadModeratorUserId: string = userId;
    let variableContext: VariableContext | null = null;
    try {
      const resolved = await resolveStudyFromName(studyName);
      if (resolved) {
        const study = resolved.study;
        variableContext = { projectId: resolved.projectId, studyId: resolved.studyId };
        if (study.created_by) leadModeratorUserId = study.created_by;
        if (study.path) studyPath = decodeURIComponent(study.path);
      }
    } catch (_err) { /* ignore — defaults are safe */ }

    // ── Load study variables for cascade pre-fill + readiness ──
    let cascadeBlocks: MutableBlock[] = [];
    let cascadeGate = false;
    let focusPrefill = '';
    let questionsPrefill = '';
    let methodologyValue: string | null = null;

    try {
      if (studyPath && variableContext) {
        const studyVars = await readStudyVariablesByContext(variableContext);

        // Cascade readiness check
        const cascadeData = buildCascadeReadiness(studyVars, 'discussion_guide');
        const rawBlocks = buildCascadeBlocks(cascadeData);
        if (rawBlocks.length > 0) {
          cascadeBlocks = rawBlocks as MutableBlock[];
          cascadeGate = true;
        }

        // Pre-fill from cascade variables (only if gate is open)
        if (!cascadeGate && studyVars?.variables) {
          const objectives = studyVars.variables.research_objectives?.value;
          focusPrefill = formatObjectivesForPrefill(objectives);

          const questions = studyVars.variables.research_questions?.value;
          questionsPrefill = formatQuestionsForPrefill(questions);

          const method = studyVars.variables.methodology_selection?.value;
          methodologyValue = resolveMethodologyValue(method);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Cascade readiness/prefill failed for discussion guide:', message);
    }

    const privateMetadata = JSON.stringify({
      ...(meta || {}),
      studyName,
      studyId,
      userId,
    });

    // ── Cascade gate: warning-only view when required vars missing ──
    if (cascadeGate) {
      const warningBlocks: MutableBlock[] = [
        {
          type: "context",
          block_id: DG_STUDY_DISPLAY_BLOCK_ID,
          elements: [
            {
              type: "mrkdwn",
              text: `:speech_balloon: *${studyName}*`,
            },
          ],
        },
        ...cascadeBlocks,
      ];

      await client.views.update({
        view_id: body.view.id,
        view: {
          type: "modal",
          callback_id: "discussion_guide_modal",
          title: discussionGuideModal.title,
          close: discussionGuideModal.close,
          blocks: warningBlocks,
          private_metadata: privateMetadata,
        } as View,
      });
      return;
    }

    // ── Normal view: study display + pre-filled form ──
    const blocks: MutableBlock[] = [...discussionGuideModal.blocks];

    // Set study name in context display block
    const studyDisplayIdx = blocks.findIndex(b => b.block_id === DG_STUDY_DISPLAY_BLOCK_ID);
    if (studyDisplayIdx !== -1) {
      blocks[studyDisplayIdx] = {
        ...blocks[studyDisplayIdx],
        elements: [
          {
            type: "mrkdwn",
            text: `:speech_balloon: *${studyName}*\nBuilding a session guide from your approved brief.`,
          },
        ],
      };
    }

    // Pre-fill research focus from cascade objectives
    if (focusPrefill) {
      const focusIdx = blocks.findIndex(b => b.block_id === 'research_focus_block');
      if (focusIdx !== -1 && blocks[focusIdx].element) {
        blocks[focusIdx] = {
          ...blocks[focusIdx],
          element: { ...blocks[focusIdx].element!, initial_value: focusPrefill },
        };
      }
    }

    // Pre-fill research questions from cascade
    if (questionsPrefill) {
      const questionsIdx = blocks.findIndex(b => b.block_id === 'research_questions_block');
      if (questionsIdx !== -1 && blocks[questionsIdx].element) {
        blocks[questionsIdx] = {
          ...blocks[questionsIdx],
          element: { ...blocks[questionsIdx].element!, initial_value: questionsPrefill },
        };
      }
    }

    // Pre-select methodology from cascade
    if (methodologyValue) {
      const methodIdx = blocks.findIndex(b => b.block_id === 'research_method_block');
      const methodText = METHODOLOGY_VALUE_TO_TEXT[methodologyValue];
      if (methodIdx !== -1 && methodText && blocks[methodIdx].element) {
        blocks[methodIdx] = {
          ...blocks[methodIdx],
          element: {
            ...blocks[methodIdx].element!,
            initial_option: {
              text: { type: "plain_text", text: methodText },
              value: methodologyValue,
            },
          },
        };
      }
    }

    // Set initial_user on lead moderator
    const moderatorIdx = blocks.findIndex(b => b.block_id === 'lead_moderator_block');
    if (moderatorIdx !== -1 && blocks[moderatorIdx].element) {
      blocks[moderatorIdx] = {
        ...blocks[moderatorIdx],
        element: { ...blocks[moderatorIdx].element!, initial_user: leadModeratorUserId },
      };
    }

    await client.views.update({
      view_id: body.view.id,
      view: {
        ...discussionGuideModal,
        blocks,
        private_metadata: privateMetadata,
      } as View,
    });
  } catch (err) {
    const detail = (err as Record<string, unknown>)?.data ?? err;
    console.error('Error opening discussion guide modal:', detail);
  }
}

// ─── Submission handler ───────────────────────────────────────────

async function handleDiscussionGuideSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { channelId, studyName } = meta;

  if (!studyName) {
    throw new Error('No study selected — private_metadata missing studyName');
  }

  // Resolve study first so we can determine the target channel for messages
  const resolved = await resolveStudyFromName(studyName);
  if (!resolved) throw new Error(`Study "${studyName}" not found`);
  const study = resolved.study;
  const variableContext: VariableContext = { projectId: resolved.projectId, studyId: resolved.studyId };

  // Resolve target channel: project's bound channel takes priority over trigger channel
  // This ensures success messages land in the project's dedicated channel, not where
  // the modal was triggered from (which may be a different project's channel).
  const projectForChannel = await getProjectById(resolved.projectId);
  const targetChannel = projectForChannel?.channel_id || channelId;

  const extract = (blockId: string, actionId: string): string | null => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option?.value || null;
    return null;
  };

  // Resolve lead moderator display name from users_select
  const moderatorUserId: string | null =
    values.lead_moderator_block?.lead_moderator_select?.selected_user || null;
  let leadResearcherName = '';
  if (moderatorUserId) {
    try {
      const userInfo = await client.users.info({ user: moderatorUserId });
      const user = userInfo.user as Record<string, any> | undefined;
      leadResearcherName = user?.real_name || user?.profile?.display_name || user?.name || moderatorUserId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not resolve moderator display name:', message);
      leadResearcherName = moderatorUserId;
    }
  }

  // Post "Generating..." progress message to project's bound channel
  let progressTs: string | undefined;
  try {
    const progressResult = await client.chat.postMessage({
      channel: targetChannel,
      text: `:hourglass_flowing_sand: Generating discussion guide for *${studyName}*...`,
    });
    progressTs = progressResult.ts;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Could not post progress message:', message);
  }

  const guideData: DiscussionGuideTemplateInput = {
    selected_study: studyName,
    study_name: studyName,
    research_focus: extract('research_focus_block', 'research_focus'),
    research_questions: extract('research_questions_block', 'research_questions'),
    research_method: extract('research_method_block', 'research_method') || 'usability_testing',
    session_length: extract('session_length_block', 'session_length') || '60',
    task_count: extract('task_count_block', 'task_count') || '5',
    lead_researcher: leadResearcherName || body.user?.name || '',
  };

  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'discussion_guide.yaml');
  const renderedYaml = await processYamlTemplate(file.content, guideData, study!.path ?? '', 'primary-research', false, variableContext);

  const url: string = renderedYaml.result.url;

  // Update progress message → completion notification (in project's bound channel)
  if (progressTs) {
    try {
      await client.chat.update({
        channel: targetChannel,
        ts: progressTs,
        text: `:speech_balloon: Discussion guide for *${studyName}* is ready — <${url}|view on GitHub>`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not update progress message:', message);
    }
  }

  const blocks = generateStudyResultBlocks(studyName, study, url, targetChannel, 'discussion');
  await sendStudyResultMessage(client, targetChannel, studyName, blocks, 'discussion');

  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });
}

export { openDiscussionGuideModal, handleDiscussionGuideSubmission };

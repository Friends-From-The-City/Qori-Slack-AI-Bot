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
import { getStudyById } from '../../../../services/research_study.service';
import { assertStudyAccess } from '../../../../services/authorization.service';
import { processYamlTemplate } from '../../../yamlProcessor';
import { addStudyStatus } from '../../../../services/study-status.service';
import { readStudyVariablesByContext, type VariableContext } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';
import {
  discussionGuideModal,
  DG_STUDY_DISPLAY_BLOCK_ID,
  METHODOLOGY_LABEL_TO_VALUE,
  METHODOLOGY_VALUE_TO_TEXT,
} from '../../ui/discussionGuideModal';
import type { StudySetupModalMetadata } from '../../ui/studySetupModal';

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

interface ResearchObjective {
  id?: string;
  objective?: string;
}

interface ResearchQuestion {
  id?: string;
  question?: string;
  priority?: string;
}

/** Format research_objectives (array of {id, objective}) as bullet list for pre-fill.
 * IDs (OBJ-001) stay in the cascade; pre-fill renders clean text per R5. */
function formatObjectivesForPrefill(objectives: unknown): string {
  if (!Array.isArray(objectives)) return '';
  return objectives
    .map((obj: ResearchObjective) => {
      const objective = obj.objective || '';
      return objective ? `• ${objective}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Format research_questions (array of {id, question, priority}) for pre-fill.
 * IDs (RQ-001) and priority labels stay in the cascade; pre-fill renders clean text per R5. */
function formatQuestionsForPrefill(questions: unknown): string {
  if (!Array.isArray(questions)) return '';
  return questions
    .map((q: ResearchQuestion) => {
      const question = q.question || '';
      return question || '';
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
    const preselectStudyName: string = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    const preselectStudyIdStr: string | null = selectedFromView?.value || meta.studyId || null;

    // Validate study selection
    if (!preselectStudyName || !preselectStudyIdStr || preselectStudyIdStr === 'loading' || preselectStudyIdStr === 'no_studies' || preselectStudyIdStr === 'none') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: '❌ Please select a study before creating a discussion guide.',
      });
      return;
    }

    // ── Guard rail #1: Parse studyId ──
    const studyId = parseInt(preselectStudyIdStr, 10);
    if (Number.isNaN(studyId)) {
      console.error(`❌ Discussion guide opener: invalid studyId "${preselectStudyIdStr}" — not a number`);
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: '❌ Invalid study selection. Please try again or contact support.',
      });
      return;
    }

    const userId = body.user.id;

    // ── Guard rail #2: Fetch study by ID ──
    const study = await getStudyById(studyId);
    if (!study) {
      console.error(`❌ Discussion guide opener: study ID ${studyId} not found`);
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: `❌ Study "${preselectStudyName}" not found. It may have been deleted. Please refresh and try again.`,
      });
      return;
    }

    // Authorization check: verify user has access to this study (ADR 0024)
    await assertStudyAccess(userId, studyId, client);

    // ── Guard rail #3: Validate study belongs to a project ──
    const projectId = study.project_id;
    if (!projectId) {
      console.error(`❌ Discussion guide opener: study ID ${studyId} has no project_id — orphaned study`);
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: `❌ Study "${preselectStudyName}" is not linked to a project. Please run \`/qori-start\` to create a project first, then use \`/qori-brief\` to create a new study within it.`,
      });
      return;
    }

    // Extract study data for downstream use
    const leadModeratorUserId: string = study.created_by || userId;
    const studyPath: string | null = study.path ? decodeURIComponent(study.path) : null;
    const variableContext: VariableContext = { projectId, studyId };

    console.log(`✅ Discussion guide opener: study=${studyId}, project=${projectId}, name="${preselectStudyName}"`);

    // ── Load study variables for cascade pre-fill + readiness ──
    let cascadeBlocks: MutableBlock[] = [];
    let cascadeGate = false;
    let focusPrefill = '';
    let questionsPrefill = '';
    let methodologyValue: string | null = null;

    try {
      if (studyPath) {
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

    // Phase 2D: Include projectId in metadata for FK-based cascade operations
    const privateMetadata = JSON.stringify({
      channelId: meta.channelId,
      studyName: preselectStudyName,
      studyId,
      projectId,
      userId,
    } satisfies StudySetupModalMetadata);

    // ── Cascade gate: warning-only view when required vars missing ──
    if (cascadeGate) {
      const warningBlocks: MutableBlock[] = [
        {
          type: "context",
          block_id: DG_STUDY_DISPLAY_BLOCK_ID,
          elements: [
            {
              type: "mrkdwn",
              text: `*${preselectStudyName}*`,
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
            text: `*${preselectStudyName}*\nBuilding a session guide from your approved brief.`,
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

  // Phase 2D: Parse typed metadata with projectId from opener
  let meta: StudySetupModalMetadata;
  try {
    meta = JSON.parse(view.private_metadata || '{}') as StudySetupModalMetadata;
  } catch {
    console.error('Failed to parse discussion guide modal metadata');
    return;
  }

  const { channelId, studyName, studyId, projectId } = meta;

  // Validate required metadata
  if (!studyName || !studyId || !projectId) {
    console.error('Missing required metadata in discussion guide submission:', { studyName, studyId, projectId });
    await client.chat.postEphemeral({
      channel: channelId || body.user.id,
      user: body.user.id,
      text: '❌ Missing study or project context. Please close this modal and try `/qori-plan` again.',
    });
    return;
  }


  // Fetch study by ID (not name) — Phase 2D pattern
  const study = await getStudyById(studyId);
  if (!study) {
    console.error(`❌ Discussion guide handler: study ID ${studyId} not found`);
    await client.chat.postEphemeral({
      channel: channelId || body.user.id,
      user: body.user.id,
      text: `❌ Study "${studyName}" not found. It may have been deleted. Please try again.`,
    });
    return;
  }

  // ── Risk #4 validation: project_id mismatch check ──
  // If study.project_id doesn't match metadata.projectId, something is wrong.
  // Do not proceed — log, notify user, return without writing.
  if (study.project_id !== projectId) {
    console.error(
      `❌ Discussion guide handler: project_id mismatch! metadata.projectId=${projectId}, study.project_id=${study.project_id}, studyId=${studyId}, studyName="${studyName}"`
    );
    await client.chat.postEphemeral({
      channel: channelId || body.user.id,
      user: body.user.id,
      text: `❌ Project context mismatch detected. The study "${studyName}" belongs to a different project than expected. Please run \`/qori-plan\` from the correct project channel or contact support.`,
    });
    return;
  }

  // Build VariableContext from validated metadata
  const variableContext: VariableContext = { projectId, studyId };

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

  // Post "working" message to researcher's DM (consistent with completion DM)
  try {
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Generating discussion guide for *${studyName}*... This may take a moment.`,
    });
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

  // PH-6D1: Canonical artifact identity for discussion guide
  (guideData as unknown as Record<string, unknown>).__artifactContext = {
    projectId,
    studyId,
    artifactType: 'plan', // shares 02-plan/ folder with research plan
    title: `Discussion guide — ${studyName}`,
    canonicalUpstreamInputs: [], // No canonical evidence constructs; cascade fingerprint used
    createdBy: body.user.id,
  };

  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'discussion_guide.yaml');
  const renderedYaml = await processYamlTemplate(file.content, guideData, study!.path ?? '', '', false, variableContext);

  const url: string = renderedYaml.result.url;

  // Notify researcher via DM (primary notification — no channel posting)
  try {
    const im = await client.conversations.open({ users: body.user.id });
    if (im.channel?.id) {
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Discussion Guide Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\n*Next:* Run \`/qori-fieldwork\` to manage participants and outreach, or \`/qori-analyze\` after sessions complete.`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to send discussion guide DM:', message);
  }

  await addStudyStatus({
    study_id: studyId,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });
}

export { openDiscussionGuideModal, handleDiscussionGuideSubmission };

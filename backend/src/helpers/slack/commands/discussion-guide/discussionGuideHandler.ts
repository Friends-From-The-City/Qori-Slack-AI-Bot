/**
 * discussionGuideHandler.ts — Discussion guide modal opener + submission
 *
 * Extracted from events.js. Handles the create_discussion_guide action
 * (opens the modal with study/moderator auto-population and cascade readiness)
 * and the discussion_guide_modal submission (renders YAML template, posts result).
 */

import type { BlockActionContext, ViewSubmissionContext } from '../../../../types/handlers';
import type { View } from '@slack/types';

import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../../github';
import { getResearchStudyWithRoles, getStudiesByUser } from '../../../../services/research_study.service';
import { processYamlTemplate } from '../../../yamlProcessor';
import { addStudyStatus } from '../../../../services/study-status.service';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../../ui/studyResultBlocks';
import { readStudyVariables } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';
import { discussionGuideModal } from '../../ui/discussionGuideModal';

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { initial_value?: string; [key: string]: unknown };
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

// ─── Modal opener ─────────────────────────────────────────────────

async function openDiscussionGuideModal({ ack, body, client }: BlockActionContext) {
  await ack();

  // This handler only operates on actions triggered from a modal view.
  // BlockAction doesn't always carry .view — guard against non-modal contexts.
  if (!('view' in body) || !body.view) {
    console.warn('Discussion guide opener received non-modal action context');
    return;
  }

  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const selectedFromView = body.view.state?.values?.study_selection?.study_select?.selected_option || null;
    let studyName: string = selectedFromView?.text?.text || meta.studyName || meta.selectedStudy || meta.study_name || '';
    let studyId: string | null = selectedFromView?.value || meta.studyId || null;

    if (!studyName || studyId === 'loading' || studyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: '❌ Please select a study before creating a discussion guide.',
      });
      return;
    }

    const blocks: MutableBlock[] = Array.from(discussionGuideModal.blocks);
    const studyIdx = blocks.findIndex(b => b.block_id === 'study_name');

    if (!studyName) {
      try {
        const userId = body.user.id;
        const studies = await getStudiesByUser(userId);
        if (Array.isArray(studies) && studies.length > 0) {
          studyName = studies[0].name;
          studyId = String(studies[0].id);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Could not infer studyName for discussion guide:', message);
      }
    }

    if (studyIdx !== -1 && studyName && blocks[studyIdx].element) {
      blocks[studyIdx] = {
        ...blocks[studyIdx],
        element: {
          ...blocks[studyIdx].element!,
          initial_value: studyName,
        },
      };
    }

    // Auto-fill lead moderator from study or Slack profile
    let leadModerator: string | null = null;
    try {
      const study = await getResearchStudyWithRoles(studyName);
      if (study?.researcher_name) leadModerator = study.researcher_name;
    } catch (_err) { /* ignore */ }
    if (!leadModerator) {
      try {
        const userInfo = await client.users.info({ user: body.user.id });
        const user = userInfo.user as Record<string, any> | undefined;
        leadModerator = user?.real_name || user?.profile?.display_name || user?.name || '';
      } catch (_err) { /* ignore */ }
    }
    const moderatorIdx = blocks.findIndex(b => b.block_id === 'lead_moderator_block');
    if (moderatorIdx !== -1 && leadModerator && blocks[moderatorIdx].element) {
      blocks[moderatorIdx] = {
        ...blocks[moderatorIdx],
        element: { ...blocks[moderatorIdx].element!, initial_value: leadModerator },
      };
    }

    // Cascade readiness — inject upstream variable status (optional enrichment)
    try {
      const studyForCascade = await getResearchStudyWithRoles(studyName);
      if (studyForCascade?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'discussion_guide');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          const firstDivider = blocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            // @ts-expect-error — pre-existing type mismatch from require() → import migration
            blocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err) {
      const cascadeMessage = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Cascade readiness failed for discussion guide:', cascadeMessage);
    }

    await client.views.update({
      view_id: body.view.id,
      view: {
        ...discussionGuideModal,
        blocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName, studyId }),
      } as View,
    });
  } catch (err) {
    const detail = (err as Record<string, unknown>)?.data ?? err;
    console.error('Error opening discussion guide modal:', detail);
  }
}

// ─── Submission handler ───────────────────────────────────────────

async function handleDiscussionGuideSubmission({ ack, body, view, client }: ViewSubmissionContext) {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  let { channelId, studyName } = meta;

  if (!studyName) {
    const studyBlock = values?.study_name;
    const inputStudy = studyBlock?.value?.value ?? studyBlock?.value ?? null;
    if (inputStudy && typeof inputStudy === 'string' && inputStudy.trim().length > 0) {
      studyName = inputStudy.trim();
    }
  }
  if (!studyName) {
    try {
      const userId = body.user?.id || meta.userId;
      const studies = await getStudiesByUser(userId);
      if (Array.isArray(studies) && studies.length > 0) {
        studyName = studies[0].name;
      }
    } catch (e) {
      const submissionMessage = e instanceof Error ? e.message : String(e);
      console.warn('⚠️ Could not infer studyName on submission:', submissionMessage);
    }
  }

  const extract = (blockId: string, actionId: string): string | null => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option?.value || null;
    return null;
  };

  const guideData: DiscussionGuideTemplateInput = {
    selected_study: studyName,
    study_name: studyName,
    research_focus: extract('research_focus_block', 'research_focus'),
    research_questions: extract('research_questions_block', 'research_questions'),
    research_method: extract('research_method_block', 'research_method') || 'usability_testing',
    session_length: extract('session_length_block', 'session_length') || '60',
    task_count: extract('task_count_block', 'task_count') || '5',
    lead_researcher: extract('lead_moderator_block', 'lead_moderator') || body.user?.name || '',
  };

  const study = await getResearchStudyWithRoles(studyName);
  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'discussion_guide.yaml');
  const renderedYaml = await processYamlTemplate(file.content, guideData, study!.path ?? '');

  const url: string = renderedYaml.result.url;
  const blocks = generateStudyResultBlocks(studyName, study as any, url, channelId, 'discussion');
  await sendStudyResultMessage(client, channelId, studyName, blocks, 'discussion');

  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });
}

export { openDiscussionGuideModal, handleDiscussionGuideSubmission };

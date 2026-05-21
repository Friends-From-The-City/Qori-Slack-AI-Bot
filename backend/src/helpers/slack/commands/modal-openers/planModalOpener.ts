/**
 * planModalOpener.ts — Research plan modal opener
 *
 * Extracted from events.js. Handles the create_research_plan action:
 * fetches study, extracts lead researcher (study record -> Slack profile
 * fallback), injects cascade readiness blocks, and opens the plan modal
 * via views.update.
 *
 * v6.1: Lead researcher changed to users_select. Pre-fills with study's
 * created_by (Slack user ID) or falls back to the opener's user ID.
 *
 * v6.0: Study name displayed as non-editable context block (not text input).
 * Cascade warning gates the form — when required vars missing, form fields
 * are replaced with a warning-only view (no submit button).
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, BlockAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { getResearchStudyWithRoles } from '../../../../services/research_study.service';
import { researchPlanGeneratorModal, STUDY_DISPLAY_BLOCK_ID } from '../../ui/researchPlanGeneratorModal';
import { readStudyVariables } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { initial_value?: string; [key: string]: unknown };
  elements?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

// ─── Modal opener: create_research_plan ──────────────────────────

async function openResearchPlanModal({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  try {
    await ack();

    if (!('view' in body) || !body.view) {
      console.warn('Research plan opener received non-modal action context');
      return;
    }

    console.log('🚀 ~ create_research_plan ~ body.view.private_metadata:', body.view.private_metadata);

    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get selected study from the input block
    const selectedFromView = body.view.state?.values?.study_selection?.study_select?.selected_option || null;
    const preselectStudyName: string | null = selectedFromView?.text?.text || meta.studyName || null;
    const preselectStudyId: string | null = selectedFromView?.value || meta.studyId || null;

    // Validate that study is selected
    if (!preselectStudyName || preselectStudyId === 'loading' || preselectStudyId === 'no_studies') {
      await client.chat.postEphemeral({
        channel: meta.channelId || body.user.id,
        user: body.user.id,
        text: '❌ Please select a study before creating a research plan.',
      });
      return;
    }

    const userId = body.user.id;

    // Fetch study for lead researcher ID and path
    let leadResearcherUserId: string = userId; // default: whoever opened the modal
    let studyPath: string | null = null;
    try {
      const study = await getResearchStudyWithRoles(preselectStudyName);
      if (study) {
        if (study.created_by) leadResearcherUserId = study.created_by;
        if (study.path) studyPath = decodeURIComponent(study.path);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Could not fetch study record:', message);
    }

    // ── Cascade readiness check ──
    // When required variables are missing, show warning-only view (no form, no submit).
    let cascadeBlocks: MutableBlock[] = [];
    let cascadeGate = false;
    try {
      if (studyPath) {
        const studyVars = await readStudyVariables(studyPath);
        const cascadeData = buildCascadeReadiness(studyVars, 'research_plan');
        const rawBlocks = buildCascadeBlocks(cascadeData);
        if (rawBlocks.length > 0) {
          cascadeBlocks = rawBlocks as MutableBlock[];
          cascadeGate = true; // required vars missing — gate the form
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Cascade readiness failed for research plan:', message);
    }

    const privateMetadata = JSON.stringify({
      ...(meta || {}),
      studyName: preselectStudyName,
      studyId: preselectStudyId,
      userId,
    });

    if (cascadeGate) {
      // ── Warning-only view: no form fields, no submit ──
      const warningBlocks: MutableBlock[] = [
        {
          type: "context",
          block_id: STUDY_DISPLAY_BLOCK_ID,
          elements: [
            {
              type: "mrkdwn",
              text: `:clipboard: *${preselectStudyName}*`,
            },
          ],
        },
        ...cascadeBlocks,
      ];

      await client.views.update({
        view_id: body.view.id,
        view: {
          type: "modal",
          callback_id: "research_plan_modal",
          title: researchPlanGeneratorModal.title,
          close: researchPlanGeneratorModal.close,
          // No submit property — researcher can only close
          blocks: warningBlocks,
          private_metadata: privateMetadata,
        } as View,
      });
      return;
    }

    // ── Normal view: study display + form fields ──
    const blocks: MutableBlock[] = [...researchPlanGeneratorModal.blocks];

    // Set study name in context display block
    const studyDisplayIndex = blocks.findIndex(
      block => block.block_id === STUDY_DISPLAY_BLOCK_ID,
    );
    if (studyDisplayIndex !== -1) {
      blocks[studyDisplayIndex] = {
        ...blocks[studyDisplayIndex],
        elements: [
          {
            type: "mrkdwn",
            text: `:clipboard: *${preselectStudyName}*\nGenerating an execution plan from your approved brief.`,
          },
        ],
      };
    }

    // Set initial_user on users_select to the study's lead researcher
    const leadResearcherIndex = blocks.findIndex(
      block => block.block_id === 'lead_researcher_block',
    );
    if (leadResearcherIndex !== -1 && blocks[leadResearcherIndex].element) {
      blocks[leadResearcherIndex] = {
        ...blocks[leadResearcherIndex],
        element: {
          ...blocks[leadResearcherIndex].element!,
          initial_user: leadResearcherUserId,
        },
      };
      console.log(`✅ Pre-populated lead researcher: ${leadResearcherUserId}`);
    }

    await client.views.update({
      view_id: body.view.id,
      view: {
        ...researchPlanGeneratorModal,
        blocks,
        private_metadata: privateMetadata,
      } as View,
    });
  } catch (error) {
    console.error('Error opening research plan modal:', error);
  }
}

export { openResearchPlanModal };

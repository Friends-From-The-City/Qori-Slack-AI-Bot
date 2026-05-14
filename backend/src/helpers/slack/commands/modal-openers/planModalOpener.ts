/**
 * planModalOpener.ts — Research plan modal opener
 *
 * Extracted from events.js. Handles the create_research_plan action:
 * fetches study, extracts lead researcher (study record -> Slack profile
 * fallback), injects cascade readiness blocks, and opens the plan modal
 * via views.update.
 *
 * This is the most complex modal opener — it auto-populates study folder,
 * lead researcher, and cascade readiness status before showing the form.
 */

import type { BlockActionContext } from '../../../../types/handlers';

const { getResearchStudyWithRoles, getStudiesByUser } = require('../../../../services/research_study.service');
const { researchPlanGeneratorModal } = require('../../ui/researchPlanGeneratorModal');
const { readStudyVariables } = require('../../../studyVariables');
const { buildCascadeReadiness, buildCascadeBlocks } = require('../../ui/cascadeReadinessBlocks');

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { initial_value?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// ─── Modal opener: create_research_plan ──────────────────────────

async function openResearchPlanModal({ ack, body, client }: BlockActionContext) {
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

    // Fetch studies for the user
    const userId = body.user.id;
    const studies = await getStudiesByUser(userId);

    // Fetch lead researcher: study record -> Slack profile fallback
    let leadResearcher: string | null = null;
    try {
      const study = await getResearchStudyWithRoles(preselectStudyName);
      if (study && study.researcher_name) {
        leadResearcher = study.researcher_name;
      }
    } catch (error: any) {
      console.warn('Could not fetch study for lead researcher:', error.message);
    }
    if (!leadResearcher) {
      try {
        const userInfo = await client.users.info({ user: userId });
        const user = userInfo.user as Record<string, any> | undefined;
        leadResearcher = user?.real_name || user?.profile?.display_name || user?.name || '';
      } catch (err: any) {
        console.warn('Could not fetch Slack profile for lead researcher:', err.message);
      }
    }

    // Start with the modal's blocks
    const blocks: MutableBlock[] = [...researchPlanGeneratorModal.blocks];

    // Find the study_folder_block and lead_researcher_block input blocks
    const studyFolderIndex = blocks.findIndex(
      block => block.block_id === 'study_folder_block',
    );
    const leadResearcherIndex = blocks.findIndex(
      block => block.block_id === 'lead_researcher_block',
    );

    // Auto-populate study folder with study name
    if (studyFolderIndex !== -1 && preselectStudyName && blocks[studyFolderIndex].element) {
      blocks[studyFolderIndex] = {
        ...blocks[studyFolderIndex],
        element: {
          ...blocks[studyFolderIndex].element!,
          initial_value: preselectStudyName,
        },
      };
    }

    // Auto-populate lead researcher
    if (leadResearcherIndex !== -1 && leadResearcher && blocks[leadResearcherIndex].element) {
      blocks[leadResearcherIndex] = {
        ...blocks[leadResearcherIndex],
        element: {
          ...blocks[leadResearcherIndex].element!,
          initial_value: leadResearcher,
        },
      };
      console.log(`✅ Pre-populated lead researcher: ${leadResearcher}`);
    }

    // Cascade readiness — inject upstream variable status
    try {
      const studyForCascade = await getResearchStudyWithRoles(preselectStudyName);
      if (studyForCascade?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'research_plan');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          // Insert cascade blocks after the first divider
          const firstDivider = blocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            blocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Cascade readiness failed for research plan:', err.message);
    }

    // views.update does NOT take trigger_id
    await client.views.update({
      view_id: body.view.id,
      view: {
        ...researchPlanGeneratorModal,
        blocks,
        private_metadata: JSON.stringify({ ...(meta || {}), studyName: preselectStudyName, studyId: preselectStudyId }),
      },
    });
  } catch (error: any) {
    console.error('Error opening research plan modal:', error);
  }
}

module.exports = { openResearchPlanModal };

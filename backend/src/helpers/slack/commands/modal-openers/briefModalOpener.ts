/**
 * briefModalOpener.ts — Research brief modal opener
 *
 * Extracted from events.js. Handles the create_research_brief action:
 * opens the brief modal with study name, start date (next Monday default),
 * stakeholder (from request metadata), and cascade readiness auto-populated.
 */

import type { BlockActionContext } from '../../../../types/handlers';
import type { View } from '@slack/types';

import { getResearchStudyWithRoles } from '../../../../services/research_study.service';
import { researchBriefModal } from '../../ui/researchBriefModal';
import { readStudyVariables } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { initial_value?: string; initial_date?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// ─── Modal opener: create_research_brief ─────────────────────────

async function openResearchBriefModal({ ack, body, client }: BlockActionContext) {
  try {
    await ack();

    if (!('view' in body) || !body.view) {
      console.warn('Research brief opener received non-modal action context');
      return;
    }

    const meta = JSON.parse(body.view.private_metadata || '{}');
    // Get study name from parent view's study selector (if coming from /qori-plan)
    const selectedFromView = body.view.state?.values?.study_selection?.study_select?.selected_option || null;
    const preselectStudyName: string = selectedFromView?.text?.text || meta.studyName || '';
    const preselectStudyId: string | null = selectedFromView?.value || meta.studyId || null;
    const userId = body.user.id;

    // Fetch lead researcher: study record -> Slack profile fallback
    let leadResearcher: string | null = null;
    if (preselectStudyName) {
      try {
        const study = await getResearchStudyWithRoles(preselectStudyName);
        if (study?.researcher_name) leadResearcher = study.researcher_name;
      } catch (_error) { /* study may not exist yet — that's OK */ }
    }
    if (!leadResearcher) {
      try {
        const userInfo = await client.users.info({ user: userId });
        const user = userInfo.user as Record<string, any> | undefined;
        leadResearcher = user?.real_name || user?.profile?.display_name || user?.name || '';
      } catch (_err) { /* ignore */ }
    }

    // Clone modal blocks and pre-fill
    const modalBlocks: MutableBlock[] = JSON.parse(JSON.stringify(researchBriefModal.blocks));

    // Pre-fill study name (text input)
    const studyNameIndex = modalBlocks.findIndex(b => b.block_id === 'study_name_block');
    if (studyNameIndex !== -1 && preselectStudyName && modalBlocks[studyNameIndex].element) {
      modalBlocks[studyNameIndex] = {
        ...modalBlocks[studyNameIndex],
        element: { ...modalBlocks[studyNameIndex].element!, initial_value: preselectStudyName },
      };
    }

    // Pre-fill stakeholder name if available from request
    const stakeholderName: string | null = meta.requestData?.prepared_by || null;
    const stakeholderIndex = modalBlocks.findIndex(b => b.block_id === 'stakeholder_block');
    if (stakeholderIndex !== -1 && stakeholderName && modalBlocks[stakeholderIndex].element) {
      modalBlocks[stakeholderIndex] = {
        ...modalBlocks[stakeholderIndex],
        element: { ...modalBlocks[stakeholderIndex].element!, initial_value: stakeholderName },
      };
    }

    // Calculate default start date (next Monday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    const defaultStartDate = nextMonday.toISOString().split('T')[0];
    const startDateIndex = modalBlocks.findIndex(b => b.block_id === 'start_date_block');
    if (startDateIndex !== -1 && modalBlocks[startDateIndex].element) {
      modalBlocks[startDateIndex] = {
        ...modalBlocks[startDateIndex],
        element: { ...modalBlocks[startDateIndex].element!, initial_date: defaultStartDate },
      };
    }

    // Cascade readiness (if study already exists and has upstream vars)
    if (preselectStudyName) {
      try {
        const studyForCascade = await getResearchStudyWithRoles(preselectStudyName);
        if (studyForCascade?.path) {
          const studyVars = await readStudyVariables(decodeURIComponent(studyForCascade.path));
          if (Object.keys(studyVars.variables).length > 0) {
            const cascadeData = buildCascadeReadiness(studyVars, 'research_brief');
            const cascadeBlocks = buildCascadeBlocks(cascadeData);
            const firstDivider = modalBlocks.findIndex(b => b.type === 'divider');
            if (firstDivider !== -1) {
              // @ts-expect-error — pre-existing type mismatch from require() → import migration
              modalBlocks.splice(firstDivider, 0, ...cascadeBlocks);
            }
          }
        }
      } catch (_err) { /* no cascade data yet — that's fine for briefs */ }
    }

    // views.update does NOT take trigger_id
    await client.views.update({
      view_id: body.view.id,
      view: {
        ...researchBriefModal,
        blocks: modalBlocks,
        private_metadata: JSON.stringify({
          ...meta,
          studyName: preselectStudyName,
          studyId: preselectStudyId,
          leadResearcher,
        }),
      } as View,
    });

    console.log(`✅ Opened research brief modal for study: ${preselectStudyName}`);
  } catch (err) {
    const errData = (err as Record<string, unknown>)?.data;
    console.error('Error opening brief modal - full error:', JSON.stringify(errData, null, 2));
    // Notify user of the error
    try {
      if ('view' in body && body.view) {
        const meta = JSON.parse(body.view.private_metadata || '{}');
        const errDetail = (errData as Record<string, unknown>)?.error || (err instanceof Error ? err.message : null) || 'Unknown error';
        await client.chat.postEphemeral({
          channel: meta.channelId || body.user.id,
          user: body.user.id,
          text: `❌ Error opening research brief: ${errDetail}`,
        });
      }
    } catch (notifyErr) {
      const notifyMessage = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      console.error('Could not notify user of error:', notifyMessage);
    }
  }
}

export { openResearchBriefModal };

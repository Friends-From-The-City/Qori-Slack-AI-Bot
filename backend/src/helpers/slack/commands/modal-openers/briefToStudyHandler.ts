/**
 * briefToStudyHandler.ts — Post-brief-approval modal openers
 *
 * Extracted from events.js. Contains two handlers for actions triggered
 * after a brief is approved:
 * - create_research_plan_from_brief: opens plan modal with brief data pre-filled
 * - create_study_from_brief: resolves user, opens create study modal with brief data
 */

import type { BlockActionContext } from '../../../../types/handlers';
import type { View } from '@slack/types';

import { getResearchStudyWithRoles } from '../../../../services/research_study.service';
import { researchPlanGeneratorModal } from '../../ui/researchPlanGeneratorModal';
import { createStudyModal } from '../../ui/createStudyModal';
import { readStudyVariables } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';

// ─── Block Kit manipulation type ──────────────────────────────────

/** Loose but documented shape for dynamically manipulated modal blocks. */
interface MutableBlock {
  type: string;
  block_id?: string;
  element?: { initial_value?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// ─── create_research_plan_from_brief ─────────────────────────────

async function openPlanFromBrief({ ack, body, client }: BlockActionContext) {
  await ack();

  try {
    const actionValue = (body as unknown as { actions: Array<{ value: string }> }).actions[0].value;
    const { studyName, channelId } = JSON.parse(actionValue);
    const study = await getResearchStudyWithRoles(studyName);

    // Fetch lead researcher
    let leadResearcher: string = study?.researcher_name || '';
    if (!leadResearcher) {
      try {
        const userInfo = await client.users.info({ user: body.user.id });
        const user = userInfo.user as Record<string, any> | undefined;
        leadResearcher = user?.real_name || user?.profile?.display_name || '';
      } catch (_err) { /* ignore */ }
    }

    // Build plan modal blocks with study pre-filled
    const blocks: MutableBlock[] = [...researchPlanGeneratorModal.blocks];
    const studyFolderIndex = blocks.findIndex(b => b.block_id === 'study_folder_block');
    if (studyFolderIndex !== -1 && studyName && blocks[studyFolderIndex].element) {
      blocks[studyFolderIndex] = {
        ...blocks[studyFolderIndex],
        element: { ...blocks[studyFolderIndex].element!, initial_value: studyName },
      };
    }
    const leadIdx = blocks.findIndex(b => b.block_id === 'lead_researcher_block');
    if (leadIdx !== -1 && leadResearcher && blocks[leadIdx].element) {
      blocks[leadIdx] = {
        ...blocks[leadIdx],
        element: { ...blocks[leadIdx].element!, initial_value: leadResearcher },
      };
    }

    // Inject cascade readiness
    try {
      if (study?.path) {
        const studyVars = await readStudyVariables(decodeURIComponent(study.path));
        if (Object.keys(studyVars.variables).length > 0) {
          const cascadeData = buildCascadeReadiness(studyVars, 'research_plan');
          const cascadeBlocks = buildCascadeBlocks(cascadeData);
          const firstDivider = blocks.findIndex(b => b.type === 'divider');
          if (firstDivider !== -1) {
            // @ts-expect-error — pre-existing type mismatch from require() → import migration
            blocks.splice(firstDivider, 0, ...cascadeBlocks);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Cascade readiness failed:', message);
    }

    // views.open DOES take trigger_id
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...researchPlanGeneratorModal,
        blocks,
        private_metadata: JSON.stringify({ studyName, studyId: study?.id?.toString(), channelId }),
      } as unknown as View,
    });
  } catch (err) {
    const detail = (err as Record<string, unknown>)?.data ?? err;
    console.error('Error opening research plan from brief approval:', detail);
  }
}

// ─── create_study_from_brief ─────────────────────────────────────

async function openStudyFromBrief({ ack, body, client }: BlockActionContext) {
  await ack();

  try {
    const actionValue = (body as unknown as { actions: Array<{ value: string }> }).actions[0].value;
    const { studyName, briefUrl, briefData, channelId } = JSON.parse(actionValue);

    // If we have a requestedBy user ID, fetch user info to get display name
    // Otherwise, try to look up user by requestor_name
    let userDisplayName: string = briefData.requestor_name;
    let requestedByUserId: string | null = briefData.requestedBy;

    // If we don't have requestedBy but we have requestor_name, try to look it up
    if (!requestedByUserId && briefData.requestor_name) {
      try {
        const usersList = await client.users.list({});
        const members = usersList.members as Array<Record<string, any>>;
        const foundUser = members.find(u =>
          !u.is_bot && u.id !== 'USLACKBOT' && (
            (u.profile?.real_name && u.profile.real_name.toLowerCase().includes(briefData.requestor_name.toLowerCase())) ||
            (u.name && u.name.toLowerCase().includes(briefData.requestor_name.toLowerCase()))
          ),
        );
        if (foundUser) {
          requestedByUserId = foundUser.id;
          userDisplayName = foundUser.profile?.real_name || foundUser.name || briefData.requestor_name;
        }
      } catch (error) {
        console.error('Error looking up user by name:', error);
      }
    }

    // If we have a requestedBy user ID, fetch user info to get display name
    // IMPORTANT: The display name must match exactly what the user_select options handler returns
    if (requestedByUserId) {
      try {
        const userInfo = await client.users.info({ user: requestedByUserId });
        const user = userInfo.user as Record<string, any> | undefined;
        userDisplayName = user?.profile?.real_name || user?.name || briefData.requestor_name;
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    }

    // views.open DOES take trigger_id
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...createStudyModal({
          briefData: {
            ...briefData,
            briefUrl,
            studyName,
            requestedBy: requestedByUserId,
            userDisplayName,
          },
        }),
        private_metadata: JSON.stringify({
          channelId,
          userId: body.user.id,
          isFromBrief: true,
          briefData: {
            ...briefData,
            briefUrl,
            studyName,
            requestedBy: requestedByUserId,
            userDisplayName,
          },
        }),
      } as unknown as View,
    });
  } catch (error) {
    const detail = (error as Record<string, unknown>)?.data ?? error;
    console.error('Error opening create study modal from brief:', detail);
  }
}

export { openPlanFromBrief, openStudyFromBrief };

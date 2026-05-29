/**
 * briefToStudyHandler.ts — Post-brief-approval modal openers
 *
 * Extracted from events.js. Contains two handlers for actions triggered
 * after a brief is approved:
 * - create_research_plan_from_brief: opens plan modal with brief data pre-filled
 * - create_study_from_brief: resolves user, opens create study modal with brief data
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, BlockAction } from '@slack/bolt';
import type { View } from '@slack/types';

import { getStudyById } from '../../../../services/research_study.service';
import { researchPlanGeneratorModal, STUDY_DISPLAY_BLOCK_ID } from '../../ui/researchPlanGeneratorModal';
import { createStudyModal } from '../../ui/createStudyModal';
import { readStudyVariablesByContext, type VariableContext } from '../../../studyVariables';
import { buildCascadeReadiness, buildCascadeBlocks } from '../../ui/cascadeReadinessBlocks';
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

// ─── create_research_plan_from_brief ─────────────────────────────

/**
 * Opens the research plan modal from a brief approval button.
 *
 * v2.0 (Phase 2D): Uses studyId and projectId from the button value.
 * No longer uses deprecated resolveStudyFromName.
 */
async function openPlanFromBrief({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
  await ack();

  try {
    const actionValue = (body as unknown as { actions: Array<{ value: string }> }).actions[0].value;
    const { studyName, studyId: actionStudyId, projectId: actionProjectId, channelId } = JSON.parse(actionValue);

    // ── Guard rail #1: Validate studyId from action ──
    const studyId = typeof actionStudyId === 'number' ? actionStudyId : parseInt(actionStudyId, 10);
    if (Number.isNaN(studyId)) {
      console.error(`❌ openPlanFromBrief: invalid studyId "${actionStudyId}" — not a number`);
      await client.chat.postEphemeral({
        channel: channelId || body.user.id,
        user: body.user.id,
        text: '❌ Invalid study context. The approval button may be outdated. Please re-approve the brief.',
      });
      return;
    }

    // ── Guard rail #2: Validate projectId from action ──
    const projectId = typeof actionProjectId === 'number' ? actionProjectId : parseInt(actionProjectId, 10);
    if (Number.isNaN(projectId)) {
      console.error(`❌ openPlanFromBrief: invalid projectId "${actionProjectId}" — not a number`);
      await client.chat.postEphemeral({
        channel: channelId || body.user.id,
        user: body.user.id,
        text: '❌ Invalid project context. The approval button may be outdated. Please re-approve the brief.',
      });
      return;
    }

    // ── Guard rail #3: Fetch study by ID ──
    const study = await getStudyById(studyId);
    if (!study) {
      console.error(`❌ openPlanFromBrief: study ID ${studyId} not found`);
      await client.chat.postEphemeral({
        channel: channelId || body.user.id,
        user: body.user.id,
        text: `❌ Study "${studyName}" not found. It may have been deleted. Please try again.`,
      });
      return;
    }

    // ── Guard rail #4: Validate project_id match ──
    if (study.project_id !== projectId) {
      console.error(
        `❌ openPlanFromBrief: project_id mismatch! action.projectId=${projectId}, study.project_id=${study.project_id}, studyId=${studyId}`
      );
      await client.chat.postEphemeral({
        channel: channelId || body.user.id,
        user: body.user.id,
        text: `❌ Project context mismatch detected. Please run \`/qori-plan\` from the correct project channel.`,
      });
      return;
    }

    console.log(`✅ openPlanFromBrief: study=${studyId}, project=${projectId}, name="${studyName}"`);

    const userId = body.user.id;
    const leadResearcherUserId: string = study.created_by || userId;
    const studyPath: string | null = study.path ? decodeURIComponent(study.path) : null;
    const variableContext: VariableContext = { projectId, studyId };

    // Build plan modal blocks with study pre-filled
    const blocks: MutableBlock[] = [...researchPlanGeneratorModal.blocks];

    // Set study name in context display block
    const studyDisplayIndex = blocks.findIndex(b => b.block_id === STUDY_DISPLAY_BLOCK_ID);
    if (studyDisplayIndex !== -1) {
      blocks[studyDisplayIndex] = {
        ...blocks[studyDisplayIndex],
        elements: [
          {
            type: "mrkdwn",
            text: `:clipboard: *${studyName}*\nGenerating an execution plan from your approved brief.`,
          },
        ],
      };
    }

    // Set initial_user on users_select to the study's lead researcher
    const leadResearcherIndex = blocks.findIndex(b => b.block_id === 'lead_researcher_block');
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

    // Inject cascade readiness
    let cascadeGate = false;
    let cascadeBlocks: MutableBlock[] = [];
    try {
      if (studyPath) {
        const studyVars = await readStudyVariablesByContext(variableContext);
        const cascadeData = buildCascadeReadiness(studyVars, 'research_plan');
        const rawBlocks = buildCascadeBlocks(cascadeData);
        if (rawBlocks.length > 0) {
          cascadeBlocks = rawBlocks as MutableBlock[];
          cascadeGate = true;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Cascade readiness failed:', message);
    }

    // Phase 2D: Include projectId in metadata for FK-based cascade operations
    const privateMetadata = JSON.stringify({
      channelId,
      studyName,
      studyId,
      projectId,
      userId,
    } satisfies StudySetupModalMetadata);

    if (cascadeGate) {
      // ── Warning-only view: no form fields, no submit ──
      const warningBlocks: MutableBlock[] = [
        {
          type: "context",
          block_id: STUDY_DISPLAY_BLOCK_ID,
          elements: [
            {
              type: "mrkdwn",
              text: `:clipboard: *${studyName}*`,
            },
          ],
        },
        ...cascadeBlocks,
      ];

      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          callback_id: "research_plan_modal",
          title: researchPlanGeneratorModal.title,
          close: researchPlanGeneratorModal.close,
          blocks: warningBlocks,
          private_metadata: privateMetadata,
        } as unknown as View,
      });
      return;
    }

    // Inject cascade readiness blocks into normal view
    if (cascadeBlocks.length > 0) {
      const firstDivider = blocks.findIndex(b => b.type === 'divider');
      if (firstDivider !== -1) {
        blocks.splice(firstDivider, 0, ...cascadeBlocks);
      }
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...researchPlanGeneratorModal,
        blocks,
        private_metadata: privateMetadata,
      } as unknown as View,
    });
  } catch (err) {
    const detail = (err as Record<string, unknown>)?.data ?? err;
    console.error('Error opening research plan from brief approval:', detail);
  }
}

// ─── create_study_from_brief ─────────────────────────────────────

async function openStudyFromBrief({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs) {
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

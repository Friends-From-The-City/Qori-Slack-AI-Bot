/**
 * planHandler.ts — /qori-plan submission handler
 *
 * Slack adapter for the research plan flow. Extracts form values from the
 * Slack modal, resolves display names via Slack API, then delegates ALL
 * business logic to the plan application service (executePlan).
 *
 * PLAT-3: Single business path — no legacy fallback. If the application
 * context cannot be built, the handler fails closed.
 *
 * v7.0 (Phase 2D): Uses projectId from modal metadata. No longer uses
 * deprecated resolveStudyFromName. Validates study.project_id matches
 * metadata.projectId before proceeding.
 */

import type { AllMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';
import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { executePlan } from '../../../application/plan.app-service';

import { getStudyById } from '../../../services/research_study.service';
import { assertStudyAccess, AuthorizationError } from '../../../services/authorization.service';
import type { StudySetupModalMetadata } from '../ui/studySetupModal';

// ─── Handler ────────────────────────────────────────────────────────

async function handlePlanSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) {
  await ack();

  const values = view.state.values;

  // Phase 2D: Parse typed metadata with projectId from opener
  let meta: StudySetupModalMetadata;
  try {
    meta = JSON.parse(view.private_metadata || '{}') as StudySetupModalMetadata;
  } catch {
    console.error('Failed to parse plan modal metadata');
    return;
  }

  const { channelId, studyName, studyId, projectId, userId } = meta;

  // Validate required metadata
  if (!studyName || !studyId || !projectId) {
    console.error('Missing required metadata in plan submission:', { studyName, studyId, projectId });
    await client.chat.postEphemeral({
      channel: channelId || body.user.id,
      user: body.user.id,
      text: '❌ Missing study or project context. Please close this modal and try `/qori-plan` again.',
    });
    return;
  }

  // ── GOV-1: Authorization check ──
  // Re-authorize at submission boundary. Do not trust modal opener's check.
  try {
    await assertStudyAccess(body.user.id, studyId, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Plan submission denied: user=${body.user.id} study=${studyId}`);
      await client.chat.postEphemeral({
        channel: channelId || body.user.id,
        user: body.user.id,
        text: 'Access denied: you are not a member of this study\'s project.',
      });
      return;
    }
    throw err;
  }

  // Post "working" message to researcher's DM (consistent with completion DM)
  try {
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Creating research plan for *${studyName}*... This may take a moment.`,
    });
  } catch (err) {
    const progressErr = err instanceof Error ? err.message : String(err);
    console.warn('Could not post plan progress message:', progressErr);
  }

  // Fetch study by ID (not name) — Phase 2D pattern
  const study = await getStudyById(studyId);
  if (!study) {
    console.error(`❌ Plan handler: study ID ${studyId} not found`);
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
      `❌ Plan handler: project_id mismatch! metadata.projectId=${projectId}, study.project_id=${study.project_id}, studyId=${studyId}, studyName="${studyName}"`
    );
    await client.chat.postEphemeral({
      channel: channelId || body.user.id,
      user: body.user.id,
      text: `❌ Project context mismatch detected. The study "${studyName}" belongs to a different project than expected. Please run \`/qori-plan\` from the correct project channel or contact support.`,
    });
    return;
  }

  // Form extraction helper — Bolt's view state values are loosely typed
  const extract = (blockId: string, actionId: string): string | string[] | null => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option?.value || null;
    if (action.selected_date !== undefined) return action.selected_date;
    if (action.selected_options !== undefined) return action.selected_options.map(opt => opt.value);
    return null;
  };

  // ── Modal inputs ──
  // Lead researcher is a users_select — extract Slack user ID, resolve to display name
  const leadResearcherUserId: string | null =
    values.lead_researcher_block?.lead_researcher_select?.selected_user || null;
  let leadResearcher = '';
  if (leadResearcherUserId) {
    try {
      const userInfo = await client.users.info({ user: leadResearcherUserId });
      const user = userInfo.user as Record<string, any> | undefined;
      leadResearcher = user?.real_name || user?.profile?.display_name || user?.name || leadResearcherUserId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not resolve lead researcher display name:', message);
      leadResearcher = leadResearcherUserId; // fall back to raw user ID
    }
  }
  const operationalRisks = (extract('operational_risks_block', 'operational_risks_input') as string) || '';

  // ── PLAT-3: Application service — single business path (fail closed) ──
  const appCtx = await buildSlackApplicationContext(body.user.id, (body as any).team?.id || '', leadResearcher);

  if (!appCtx) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: '❌ Unable to resolve your identity. Please contact your administrator to ensure your workspace is configured.',
    });
    return;
  }

  try {
    console.log(`[PLAT-3] Plan: using application service path for user=${body.user.id}`);
    const result = await executePlan(appCtx, {
      studyId,
      studyName,
      projectId,
      leadResearcher,
      createdByActorId: String(appCtx.actor.id),
      operationalRisks,
    });

    // Notify researcher via DM
    const dmUserId = userId || body.user.id;
    try {
      const im = await client.conversations.open({ users: dmUserId });
      if (im.channel?.id) {
        await client.chat.postMessage({
          channel: im.channel.id,
          text: `✅ *Research Plan Created*\n\n*Study:* ${studyName}\n*View:* <${result.url}|GitHub>\n\n*Next:* Run \`/qori-fieldwork\` to track participants, observers, and outreach.`,
        });
      }
    } catch (dmErr) {
      const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr);
      console.error('Failed to send plan DM:', dmMessage);
    }

    console.log(`✅ Research plan created via app service for study: ${studyName}`);
  } catch (appServiceErr) {
    const errMessage = appServiceErr instanceof Error ? appServiceErr.message : String(appServiceErr);
    console.error('❌ Plan app service failed:', errMessage);
    const displayErr = errMessage.includes('<!DOCTYPE')
      ? 'GitHub is temporarily unavailable. Please try again in a moment.'
      : errMessage;
    await client.chat.postEphemeral({
      channel: channelId || body.user.id,
      user: body.user.id,
      text: `❌ Could not create research plan: ${displayErr}`,
    });
  }
}

export { handlePlanSubmission };

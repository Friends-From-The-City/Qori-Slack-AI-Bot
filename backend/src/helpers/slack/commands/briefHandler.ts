/**
 * briefHandler.ts — /qori-brief submission handler
 *
 * Slack adapter for the research brief flow. Extracts form values from the
 * Slack modal, resolves display names via Slack API, then delegates ALL
 * business logic to the brief application service (executeBrief).
 *
 * PLAT-3: Single business path — no legacy fallback. If the application
 * context cannot be built, the handler fails closed.
 *
 * Phase 2D: Uses projectId from modal metadata. Study name inherits from
 * project slug. No resolveStudyFromName — uses getStudyByProjectAndName.
 */

import type { AllMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';

import { buildSlackApplicationContext } from '../../../middleware/auth/slackContextBridge';
import { executeBrief, type BriefInput } from '../../../application/brief.app-service';
import { getStudyByProjectAndName } from '../../../services/research_study.service';
import { getProjectApprover, assertProjectAccess, AuthorizationError } from '../../../services/authorization.service';
import { generateStudyResultBlocks, sendStudyResultMessage } from '../ui/studyResultBlocks';
import type { BriefEntryModalMetadata } from '../ui/researchBriefEntryModal';

// ─── Handler ────────────────────────────────────────────────────

/**
 * Handle research_brief_modal submission.
 *
 * Phase 2D: Study name inherits from project slug (no study_name_block).
 * Uses projectId from modal metadata for all FK-based operations.
 */
async function handleBriefSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const values = view.state.values;

  // Parse typed metadata from modal
  let meta: BriefEntryModalMetadata;
  try {
    meta = JSON.parse(view.private_metadata || '{}') as BriefEntryModalMetadata;
  } catch {
    console.error('Failed to parse brief modal metadata');
    return;
  }

  const { channelId, projectId, projectName, projectSlug } = meta;

  // Validate required metadata
  if (!projectId || !projectSlug) {
    console.error('Missing project context in brief modal metadata');
    return;
  }

  // ── GOV-1: Authorization check ──
  // User must be project member to create a study/brief in this project.
  try {
    await assertProjectAccess(body.user.id, projectId, client);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.warn(`[AUTH] Brief submission denied: user=${body.user.id} project=${projectId}`);
      await client.chat.postEphemeral({
        channel: channelId || body.user.id,
        user: body.user.id,
        text: 'Access denied: you are not a member of this project.',
      });
      return;
    }
    throw err;
  }

  // Helper function to extract values from different input types.
  const extract = (blockId: string, actionId: string): unknown => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option;
    if (action.selected_date !== undefined) return action.selected_date;
    if (action.selected_options !== undefined) return action.selected_options.map((opt: any) => opt.value);
    return null;
  };

  // Study name inherits from project slug (Phase 2D: no study_name_block)
  // NOTE: This produces a doubled path ({slug}/{slug}) in GitHub. This is a
  // known Phase 2D limitation — the architecture is single-study-per-project
  // and there is no study name input. Multi-study support requires a design
  // decision (restore study_name_block, derive distinct slugs).
  const studyName = projectSlug;

  // Post "working" message to researcher's DM (consistent with completion DM)
  try {
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Creating research brief for *${studyName}*... This may take a moment.`,
    });
  } catch (err) {
    const progressErr = err instanceof Error ? err.message : String(err);
    console.warn('Could not post brief progress message:', progressErr);
  }

  // ── Extract form values (Slack-specific) ──

  // Methodology (unchanged from v6.0)
  const methodologyLabels: Record<string, string> = {
    usability_testing: 'Moderated usability testing',
    user_interviews: 'User interviews',
    contextual_inquiry: 'Contextual inquiry',
    concept_testing: 'Concept testing',
    survey: 'Survey research',
    card_sorting: 'Card sorting',
    tree_testing: 'Tree testing',
    mixed_methods: 'Mixed methods',
  };

  const methodOverride = extract('method_override_block', 'method_override_input') as string | null;
  const methodRadio = extract('research_method_block', 'research_method_select') as { value: string } | null;
  const methodValue: string = methodOverride ? 'custom' : (methodRadio?.value || 'usability_testing');
  const methodLabel: string = methodOverride || methodologyLabels[methodRadio?.value || 'usability_testing'] || (methodRadio?.value || 'usability_testing');
  // Lead researcher comes from form input (pre-filled by modal builder)
  const leadResearcherInput = (extract('lead_researcher_block', 'lead_researcher_input') as string | null)
    || (extract('lead_researcher', 'lead_researcher_input') as string | null);
  const leadResearcher: string = leadResearcherInput || body.user.name || '';

  // Form values
  const problemStatement = (extract('problem_statement_block', 'problem_statement_input') as string) || '';
  const learningObjectives = (extract('learning_objectives_block', 'learning_objectives_input') as string) || '';
  const outOfScope = (extract('out_of_scope_block', 'out_of_scope_input') as string) || '';
  const participantApproach = (extract('participant_approach_block', 'participant_approach_input') as string) || '';
  const recruitmentSources = (extract('recruitment_sources_block', 'recruitment_sources_input') as string) || '';
  const startDate = (extract('start_date_block', 'start_date_picker') as string) || '';
  const decisionDeadline = (extract('decision_deadline_block', 'decision_deadline_picker') as string) || '';
  const budgetStr = (extract('budget_block', 'budget_input') as string) || '';
  const discoverySelections = (extract('discovery_selection_block', 'discovery_selection') as string[] | null) || [];

  // Resolve stakeholder display name from users_select
  const stakeholderUserId: string | null =
    values.stakeholder_block?.stakeholder_select?.selected_user || null;
  let requestorName = '';
  if (stakeholderUserId) {
    try {
      const stakeholderInfo = await client.users.info({ user: stakeholderUserId });
      const stakeholderUser = stakeholderInfo.user as Record<string, any> | undefined;
      requestorName = stakeholderUser?.real_name || stakeholderUser?.profile?.display_name || stakeholderUser?.name || stakeholderUserId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not resolve stakeholder display name:', message);
      requestorName = stakeholderUserId;
    }
  }

  // Resolve researcher email for study creation
  let researcherEmail = `${body.user.id}@slack.com`;
  try {
    const creatorInfo = await client.users.info({ user: body.user.id });
    researcherEmail = creatorInfo.user?.profile?.email || researcherEmail;
  } catch {
    // Fall back to default
  }

  // ── PLAT-3: Application service — single business path (fail closed) ──
  const ctx = await buildSlackApplicationContext(body.user.id, (body as any).team?.id || '', leadResearcher);

  if (!ctx) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: '❌ Unable to resolve your identity. Please contact your administrator to ensure your workspace is configured.',
    });
    return;
  }

  try {
    const briefInput: BriefInput = {
      projectId,
      projectSlug,
      projectName: projectName || projectSlug,
      leadResearcher,
      requestorName,
      createdByActorId: String(ctx.actor.id),
      researcherEmail,
      problemStatement,
      learningObjectives,
      outOfScope,
      methodology: methodLabel,
      methodologyValue: methodValue,
      participantApproach,
      recruitmentSources,
      startDate,
      decisionDeadline,
      budget: budgetStr,
      discoverySelections,
    };

    const result = await executeBrief(ctx, briefInput);

    // ── Slack-specific result handling ──

    // Send brief approval request to stakeholder (or owner fallback)
    const study = await getStudyByProjectAndName(projectId, result.studyName);
    if (study) {
      const briefBlocks = generateStudyResultBlocks(result.studyName, study, result.url, channelId || '', 'brief');
      await sendStudyResultMessage(client, channelId || '', result.studyName, briefBlocks, 'brief');

      // Update brief status to pending_approval
      const approverInfo = await getProjectApprover(projectId);
      try {
        await study.update({
          brief_status: 'pending_approval',
          brief_reviewer_id: approverInfo?.userId || null,
        });
        console.log(`📋 Brief status set to pending_approval, reviewer: ${approverInfo?.userId || 'none'}`);
      } catch (updateErr) {
        console.error('Failed to update brief status:', updateErr);
      }

      // Notify researcher via DM with specific approver info
      try {
        let approverDisplay = 'the project owner';
        let approverRole = 'owner';
        if (approverInfo) {
          approverRole = approverInfo.source === 'stakeholder' ? 'stakeholder' : 'owner';
          try {
            const approverUserInfo = await client.users.info({ user: approverInfo.userId });
            const approverUser = approverUserInfo.user as Record<string, unknown> | undefined;
            const approverProfile = approverUser?.profile as Record<string, unknown> | undefined;
            approverDisplay = (approverUser?.real_name || approverProfile?.display_name || approverUser?.name || `<@${approverInfo.userId}>`) as string;
          } catch {
            approverDisplay = `<@${approverInfo.userId}>`;
          }
        }

        const im = await client.conversations.open({ users: body.user.id });
        if (im.channel?.id) {
          await client.chat.postMessage({
            channel: im.channel.id,
            text: `✅ *Research Brief Created*\n\n*Study:* ${result.studyName}\n*View:* <${result.url}|GitHub>\n\nBrief sent to *${approverDisplay}* (${approverRole}) for approval.\n\n*Next:* Run \`/qori-plan\` to create an execution plan once approved.`,
          });
        }
      } catch (error) {
        console.error('Failed to send confirmation to researcher:', error);
      }
    }

    console.log(`✅ Research brief created via app service for study: ${result.studyName}`);
  } catch (appServiceErr) {
    const errMessage = appServiceErr instanceof Error ? appServiceErr.message : String(appServiceErr);
    console.error('❌ Brief app service failed:', errMessage);
    const displayErr = errMessage.includes('<!DOCTYPE')
      ? 'GitHub is temporarily unavailable. Please try again in a moment.'
      : errMessage;
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Could not create research brief: ${displayErr}`,
    });
  }
}

export { handleBriefSubmission };

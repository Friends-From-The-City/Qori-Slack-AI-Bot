/**
 * planHandler.ts — /qori-plan submission handler
 *
 * Handles the research_plan_modal submission: form extraction, compensation
 * calculation, timeline computation, cascade variable consumption, YAML
 * processing, and result messaging.
 *
 * This handler is the DATA ASSEMBLY POINT for the research plan template.
 * The template is dumb — it iterates and interpolates. Computed values
 * (compensation, dates, counts) are calculated here, not by the LLM.
 *
 * v7.0 (Phase 2D): Uses projectId from modal metadata. No longer uses
 * deprecated resolveStudyFromName. Validates study.project_id matches
 * metadata.projectId before proceeding.
 */

import type { AllMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';
import { TemplateContractError } from '../../../types/handlers';
import type { ResearchQuestion, TargetBarrier } from '../../../types/cascade';

import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../github';
import { getStudyById } from '../../../services/research_study.service';
import { processYamlTemplate } from '../../yamlProcessor';
import { addStudyStatus } from '../../../services/study-status.service';
import { calculatePerPersonCompensation } from '../../../utils/compensationCalculator';
import { buildTimelinePhases, buildTimelineSummary, type TimelinePhase } from '../../../utils/timelineComputation';
import { readUpstreamVariablesByContext, type VariableContext } from '../../studyVariables';
import research_planService from '../../../services/research_plan.service';
import type { StudySetupModalMetadata } from '../ui/studySetupModal';

// ─── Template input contract ──────────────────────────────────────

/** Data shape passed to the research_plan YAML template. Co-located with handler. */
interface PlanTemplateInput {
  selected_study: string;
  project_title: string;
  lead_researcher: string;
  recruitment_sources: string;
  operational_risks: string;
  per_participant_compensation: number | null;
  parsed_budget_amount: number | null;
  target_participants: string;
  timeline_phases: TimelinePhase[];
  timeline_summary: string;
  start_date: string;
  timeline_preference: string;
  objectives: { id: string; objective: string }[];
  research_questions: ResearchQuestion[];
  target_barriers: TargetBarrier[];
  methodology: string;
  objectives_count: number;
  research_questions_count: number;
  target_barriers_count: number;
}

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

  // Build VariableContext from validated metadata
  const variableContext: VariableContext = { projectId, studyId };

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

  // ── Compensation (mechanical) ──
  const perParticipantComp: number | null = calculatePerPersonCompensation(study);

  // ── Load upstream cascade variables (ADR 0007: fail loudly on missing required data) ──
  const upstream = await readUpstreamVariablesByContext(variableContext, [
    { key: 'research_objectives', required: true },
    { key: 'research_questions', required: true },
    { key: 'target_barriers', required: true },
    { key: 'methodology_selection', required: false },
    { key: 'timeline_preference', required: false },
    { key: 'start_date', required: false },
    { key: 'recruitment_sources', required: false },
    { key: 'participant_approach', required: false },
  ]);

  // ── Cascade-owned fields (brief owns these — plan modal no longer has these fields) ──
  const timelinePref = (upstream.timeline_preference?.value as string) || 'standard';
  const startDate = (upstream.start_date?.value as string) || '';
  const recruitmentSources = (upstream.recruitment_sources?.value as string) || '';
  const participantApproach = (upstream.participant_approach?.value as string) || '';

  // ── Timeline phases (mechanical) ──
  const timelinePhases = buildTimelinePhases(startDate, timelinePref);
  const timelineSummary = buildTimelineSummary(timelinePhases);

  const upstreamObjectives = upstream.research_objectives?.value as { id?: string; objective?: string }[] | undefined;
  const upstreamQuestions = (upstream.research_questions?.value || []) as ResearchQuestion[];
  const upstreamBarriers = (upstream.target_barriers?.value || []) as TargetBarrier[];
  const methodology = (upstream.methodology_selection?.value || '') as string;

  if (!upstreamObjectives || upstreamObjectives.length === 0) {
    throw new TemplateContractError(
      'Plan handler requires research_objectives from brief',
      'research_plan',
      'research_objectives',
      'I need research objectives from the brief to generate a plan. Please run `/qori-brief` first.',
    );
  }

  // ── Brief emits {id, objective} objects (schema updated June 6, 2026) ──
  const objectives = upstreamObjectives.map((item, index: number) => ({
    id: item.id || `OBJ-${String(index + 1).padStart(3, '0')}`,
    objective: item.objective || '',
  }));

  // ── Assemble the complete data object ──
  const data: PlanTemplateInput = {
    selected_study: studyName,
    project_title: studyName,
    lead_researcher: leadResearcher,
    recruitment_sources: recruitmentSources,
    operational_risks: operationalRisks,

    per_participant_compensation: perParticipantComp,
    parsed_budget_amount: study!.parsed_budget_amount,
    target_participants: participantApproach || (study!.target_participants ? String(study!.target_participants) : ''),

    timeline_phases: timelinePhases,
    timeline_summary: timelineSummary,
    start_date: startDate,
    timeline_preference: timelinePref,

    objectives,
    research_questions: Array.isArray(upstreamQuestions) ? upstreamQuestions : [],
    target_barriers: Array.isArray(upstreamBarriers) ? upstreamBarriers : [],
    methodology: methodology,

    objectives_count: objectives.length,
    research_questions_count: Array.isArray(upstreamQuestions) ? upstreamQuestions.length : 0,
    target_barriers_count: Array.isArray(upstreamBarriers) ? upstreamBarriers.length : 0,
  };

  console.log(`📋 Assembled plan data: ${Object.keys(data).length} fields, ${data.objectives_count} objectives, ${data.research_questions_count} RQs, study: ${studyName}`);

  // PH-6D1: Canonical artifact identity for research plan
  (data as unknown as Record<string, unknown>).__artifactContext = {
    projectId,
    studyId,
    artifactType: 'plan',
    title: `Research plan — ${studyName}`,
    canonicalUpstreamInputs: [], // No canonical evidence constructs; cascade fingerprint used
    createdBy: userId,
  };

  // TemplateContractError propagates to global error middleware in events.ts
  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'research_plan.yaml');
  const studyPath = study?.path;
  if (!studyPath) throw new Error('Unexpected: study.path missing after resolution');

  const renderedYaml = await processYamlTemplate(
    file.content,
    data,
    studyPath,
    '',
    false,
    variableContext
  );

  // CRITICAL: Await extraction to ensure cascade variables are committed before returning success.
  // Without this, downstream modals (discussion guide) may read stale data. See ADR 0019.
  if (renderedYaml.extractionPromise) {
    const extractResult = await renderedYaml.extractionPromise;
    if (!extractResult.success) {
      throw new Error(`Cascade variable extraction failed: ${extractResult.error}. Document was saved but variables were not written.`);
    }
    console.log(`✅ Cascade variables committed: ${extractResult.variableCount} items (${extractResult.keys?.join(', ')})`);
  }

  const url: string = renderedYaml.result.url;
  const urlParts: string[] = renderedYaml.result.path.split('/');
  const fileName = urlParts[urlParts.length - 1];
  const planData = {
    study_id: study!.id,
    study_name: studyName,
    filename: fileName,
    file_path: renderedYaml.result.path,
    file_url: renderedYaml.result.url,
    created_by: userId || body.user.id,
  };
  await research_planService.createResearchPlan(planData);

  // Notify researcher via DM (primary notification — no channel posting)
  const dmUserId = userId || body.user.id;
  try {
    const im = await client.conversations.open({ users: dmUserId });
    if (im.channel?.id) {
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Research Plan Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\n*Next:* Run \`/qori-fieldwork\` to track participants, observers, and outreach.`,
      });
    }
  } catch (dmErr) { const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr); console.error('Failed to send plan DM:', dmMessage); }

  await addStudyStatus({
    study_id: studyId,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });
}

export { handlePlanSubmission };

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
 */

import type { AllMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';
import { TemplateContractError } from '../../../types/handlers';
import type { ResearchQuestion, TargetBarrier } from '../../../types/cascade';

import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../github';
import { getResearchStudyWithRoles } from '../../../services/research_study.service';
import { processYamlTemplate } from '../../yamlProcessor';
import { addStudyStatus } from '../../../services/study-status.service';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../ui/studyResultBlocks';
import { calculatePerPersonCompensation } from '../../../utils/compensationCalculator';
import { buildTimelinePhases, buildTimelineSummary, type TimelinePhase } from '../../../utils/timelineComputation';
import { readUpstreamVariables } from '../../studyVariables';
import research_planService from '../../../services/research_plan.service';

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
  target_participants: number | null;
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
  const { channelId, studyName: metaStudyName, userId } = JSON.parse(view.private_metadata || '{}');

  const studyName: string = values.study_folder_block?.study_folder_input?.value || metaStudyName;
  if (!studyName) {
    throw new Error('No study selected or provided');
  }

  console.log('🚀 ~ Research Plan Generator ~ studyName:', studyName);

  const study = await getResearchStudyWithRoles(studyName);

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
  const leadResearcher = (extract('lead_researcher_block', 'lead_researcher_input') as string) || '';
  const operationalRisks = (extract('operational_risks_block', 'operational_risks_input') as string) || '';

  // ── Compensation (mechanical) ──
  const perParticipantComp: number | null = calculatePerPersonCompensation(study);

  // ── Load upstream cascade variables (ADR 0007: fail loudly on missing required data) ──
  const upstream = await readUpstreamVariables(study!.path || '', [
    { key: 'research_objectives', required: true },
    { key: 'research_questions', required: true },
    { key: 'target_barriers', required: true },
    { key: 'methodology_selection', required: false },
    { key: 'timeline_preference', required: false },
    { key: 'start_date', required: false },
    { key: 'recruitment_sources', required: false },
  ]);

  // ── Cascade-owned fields (brief owns these — plan modal no longer has these fields) ──
  const timelinePref = (upstream.timeline_preference?.value as string) || 'standard';
  const startDate = (upstream.start_date?.value as string) || '';
  const recruitmentSources = (upstream.recruitment_sources?.value as string) || '';

  // ── Timeline phases (mechanical) ──
  const timelinePhases = buildTimelinePhases(startDate, timelinePref);
  const timelineSummary = buildTimelineSummary(timelinePhases);

  const upstreamObjectives = upstream.research_objectives?.value as string[] | undefined;
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

  // ── Transform objectives: brief emits plain strings (ADR 0006), plan needs {id, objective} ──
  const objectives = upstreamObjectives.map((item: string, index: number) => ({
    id: `OBJ-${String(index + 1).padStart(3, '0')}`,
    objective: item,
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
    target_participants: study!.target_participants,

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

  // TemplateContractError propagates to global error middleware in events.ts
  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'research_plan.yaml');
  // @ts-expect-error — pre-existing type mismatch from require() → import migration
  const renderedYaml = await processYamlTemplate(file.content, data, study!.path);

  const url: string = renderedYaml.result.url;
  const urlParts: string[] = renderedYaml.result.path.split('/');
  const fileName = urlParts[urlParts.length - 1];
  const planData = {
    study_id: study!.id,
    study_name: studyName,
    filename: fileName,
    file_path: renderedYaml.result.path,
    file_url: renderedYaml.result.url,
    created_by: userId,
  };
  await research_planService.createResearchPlan(planData);
  const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'plan');
  await sendStudyResultMessage(client, channelId, studyName, blocks, 'plan');

  // Send DM with next-step suggestion
  try {
    const im = await client.conversations.open({ users: userId });
    if (im.channel?.id) {
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Research Plan Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\n*Next:* Run \`/qori-fieldwork\` to track participants, observers, and outreach.`,
      });
    }
  } catch (dmErr) { const dmMessage = dmErr instanceof Error ? dmErr.message : String(dmErr); console.error('Failed to send plan DM:', dmMessage); }

  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });
}

export { handlePlanSubmission };

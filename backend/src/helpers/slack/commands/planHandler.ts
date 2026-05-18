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

import type { ViewSubmissionContext } from '../../../types/handlers';
import type { View } from '@slack/types';
import { TemplateContractError } from '../../../types/handlers';
import type { ResearchQuestion, TargetBarrier } from '../../../types/cascade';

import { addDays, format, parseISO, isValid } from 'date-fns';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../github';
import { getResearchStudyWithRoles } from '../../../services/research_study.service';
import { processYamlTemplate } from '../../yamlProcessor';
import { addStudyStatus } from '../../../services/study-status.service';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../ui/studyResultBlocks';
import { calculatePerPersonCompensation } from '../../../utils/compensationCalculator';
import { readUpstreamVariables } from '../../studyVariables';
import research_planService from '../../../services/research_plan.service';

// ─── Timeline computation ───────────────────────────────────────────

type TimelinePreference = 'standard' | 'accelerated' | 'extended';

interface PhaseDurations {
  planning: number;
  recruitment: number;
  fieldwork: number;
  analysis: number;
  reporting: number;
}

interface TimelinePhase {
  phase: string;
  dates: string;
  duration: string;
}

const PHASE_DURATIONS: Record<TimelinePreference, PhaseDurations> = {
  standard:    { planning: 3, recruitment: 7, fieldwork: 5, analysis: 1, reporting: 1 },
  accelerated: { planning: 2, recruitment: 4, fieldwork: 3, analysis: 1, reporting: 1 },
  extended:    { planning: 7, recruitment: 14, fieldwork: 10, analysis: 3, reporting: 2 },
};

/**
 * Build timeline phases with calculated dates.
 * Returns an array of { phase, dates, duration } objects for Handlebars iteration.
 */
function buildTimelinePhases(startDateStr: string, timelinePref: string): TimelinePhase[] {
  const durations = PHASE_DURATIONS[timelinePref as TimelinePreference] || PHASE_DURATIONS.standard;

  let cursor: Date;
  if (startDateStr) {
    const parsed = parseISO(startDateStr);
    cursor = isValid(parsed) ? parsed : addDays(new Date(), 7);
  } else {
    cursor = addDays(new Date(), 7);
  }

  const phases = [
    { name: 'Planning and stakeholder alignment', days: durations.planning },
    { name: 'Recruitment', days: durations.recruitment },
    { name: 'Fieldwork (sessions)', days: durations.fieldwork },
    { name: 'Analysis', days: durations.analysis },
    { name: 'Reporting', days: durations.reporting },
  ];

  return phases.map(p => {
    const phaseStart = new Date(cursor);
    const phaseEnd = addDays(phaseStart, p.days - 1);
    const result: TimelinePhase = {
      phase: p.name,
      dates: `${format(phaseStart, 'MMM d')} – ${format(phaseEnd, 'MMM d, yyyy')}`,
      duration: `${p.days} day${p.days > 1 ? 's' : ''}`,
    };
    cursor = addDays(phaseEnd, 1);
    return result;
  });
}

/**
 * Compute a human-readable timeline summary from the phases array.
 */
function buildTimelineSummary(timelinePhases: TimelinePhase[]): string {
  if (!timelinePhases || timelinePhases.length === 0) return 'TBD';

  const totalDays = timelinePhases.reduce((sum, p) => {
    const match = p.duration.match(/(\d+)/);
    return sum + (match ? parseInt(match[1], 10) : 0);
  }, 0);

  if (totalDays === 0) return 'TBD';

  const startPart = timelinePhases[0].dates.split('–')[0].trim();
  const lastDates = timelinePhases[timelinePhases.length - 1].dates;
  const yearMatch = lastDates.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : '';
  const startLabel = startPart.match(/\d{4}/) ? startPart : `${startPart}, ${year}`;

  if (totalDays < 7) {
    return `${totalDays} day${totalDays > 1 ? 's' : ''}, starting ${startLabel}`;
  }

  const weeks = Math.ceil(totalDays / 7);
  return `${weeks} week${weeks > 1 ? 's' : ''}, starting ${startLabel}`;
}

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

async function handlePlanSubmission({ ack, body, view, client }: ViewSubmissionContext) {
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
    if (action.selected_options !== undefined) return action.selected_options.map((opt: any) => opt.value);
    return null;
  };

  // ── Modal inputs ──
  const leadResearcher = (extract('lead_researcher_block', 'lead_researcher_input') as string) || '';
  const recruitmentSources = (extract('recruitment_source_block', 'recruitment_source_input') as string) || '';
  const operationalRisks = (extract('operational_risks_block', 'operational_risks_input') as string) || '';
  const startDate = (extract('start_date_block', 'start_date_picker') as string) || '';
  const timelinePref = (extract('timeline_block', 'timeline_radio') as string) || 'standard';

  // ── Compensation (mechanical) ──
  const perParticipantComp: number | null = calculatePerPersonCompensation(study);

  // ── Timeline phases (mechanical) ──
  const timelinePhases = buildTimelinePhases(startDate, timelinePref);
  const timelineSummary = buildTimelineSummary(timelinePhases);

  // ── Load upstream cascade variables (ADR 0007: fail loudly on missing required data) ──
  const upstream = await readUpstreamVariables(study!.path || '', [
    { key: 'research_objectives', required: true },
    { key: 'research_questions', required: true },
    { key: 'target_barriers', required: true },
    { key: 'methodology_selection', required: false },
  ]);

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

export { handlePlanSubmission, buildTimelinePhases, buildTimelineSummary };

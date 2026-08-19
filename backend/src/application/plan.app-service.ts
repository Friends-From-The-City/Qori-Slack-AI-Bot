/**
 * Plan Application Service — PLAT-3
 *
 * Extracted from planHandler.ts
 * Orchestrates research plan creation: cascade variable consumption,
 * compensation calculation, timeline computation, YAML template processing,
 * plan record creation, and status tracking.
 */

import type { ApplicationContext } from '../types/application-context';
import { TemplateContractError } from '../types/handlers';
import type { ResearchQuestion, TargetBarrier } from '../types/cascade';
import type { TimelinePhase } from '../utils/timelineComputation';
import { assertStudyAccessByActor } from '../services/authorization.service';
import { getStudyById } from '../services/research_study.service';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../helpers/github';
import { processYamlTemplate } from '../helpers/yamlProcessor';
import { addStudyStatus } from '../services/study-status.service';
import { calculatePerPersonCompensation } from '../utils/compensationCalculator';
import { buildTimelinePhases, buildTimelineSummary } from '../utils/timelineComputation';
import { readUpstreamVariablesByContext, type VariableContext } from '../helpers/studyVariables';
import research_planService from '../services/research_plan.service';

// ─── Input/Output Types ──────────────────────────────────────────

export interface PlanInput {
  /** Study to create the plan for */
  studyId: number;
  studyName: string;
  projectId: number;

  /** Researcher info */
  leadResearcher: string;
  createdByActorId: string;

  /** Form fields */
  operationalRisks: string;
}

export interface PlanResult {
  /** URL of the generated plan on GitHub */
  url: string;
  /** File path in the repo */
  filePath: string;
  /** Plan database record ID */
  planId: number;
  /** Objective/question/barrier counts from cascade */
  objectivesCount: number;
  researchQuestionsCount: number;
  targetBarriersCount: number;
  /** Cascade extraction outcome */
  extractionSuccess: boolean;
  extractionVariableCount: number;
}

// ─── Main Orchestration ─────────────────────────────────────────

export async function executePlan(
  ctx: ApplicationContext,
  input: PlanInput,
): Promise<PlanResult> {
  // Authorization: actor must have study access
  await assertStudyAccessByActor(ctx.actor.id, input.studyId, ctx.organization.id);

  // Fetch study
  const study = await getStudyById(input.studyId);
  if (!study) {
    throw new Error(`Study ID ${input.studyId} not found`);
  }

  // Validate project_id matches
  if (study.project_id !== input.projectId) {
    throw new Error(
      `Project context mismatch: expected project ${input.projectId}, study belongs to ${study.project_id}`,
    );
  }

  const variableContext: VariableContext = { projectId: input.projectId, studyId: input.studyId };

  // Compensation calculation
  const perParticipantComp = calculatePerPersonCompensation(study);

  // Load upstream cascade variables
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

  // Cascade-owned fields
  const timelinePref = (upstream.timeline_preference?.value as string) || 'standard';
  const startDate = (upstream.start_date?.value as string) || '';
  const recruitmentSources = (upstream.recruitment_sources?.value as string) || '';
  const participantApproach = (upstream.participant_approach?.value as string) || '';

  // Timeline phases
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
      'Research objectives from the brief are required to generate a plan.',
    );
  }

  const objectives = upstreamObjectives.map((item, index) => ({
    id: item.id || `OBJ-${String(index + 1).padStart(3, '0')}`,
    objective: item.objective || '',
  }));

  // Assemble template data
  const data: Record<string, unknown> = {
    selected_study: input.studyName,
    project_title: input.studyName,
    lead_researcher: input.leadResearcher,
    recruitment_sources: recruitmentSources,
    operational_risks: input.operationalRisks,
    per_participant_compensation: perParticipantComp,
    parsed_budget_amount: study.parsed_budget_amount,
    target_participants: participantApproach || (study.target_participants ? String(study.target_participants) : ''),
    timeline_phases: timelinePhases,
    timeline_summary: timelineSummary,
    start_date: startDate,
    timeline_preference: timelinePref,
    objectives,
    research_questions: Array.isArray(upstreamQuestions) ? upstreamQuestions : [],
    target_barriers: Array.isArray(upstreamBarriers) ? upstreamBarriers : [],
    methodology,
    objectives_count: objectives.length,
    research_questions_count: Array.isArray(upstreamQuestions) ? upstreamQuestions.length : 0,
    target_barriers_count: Array.isArray(upstreamBarriers) ? upstreamBarriers.length : 0,
    __artifactContext: {
      projectId: input.projectId,
      studyId: input.studyId,
      artifactType: 'plan',
      title: `Research plan — ${input.studyName}`,
      canonicalUpstreamInputs: [],
      createdBy: input.createdByActorId,
    },
  };

  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'research_plan.yaml');
  const studyPath = study.path;
  if (!studyPath) throw new Error('Unexpected: study.path missing after resolution');

  const renderedYaml = await processYamlTemplate(
    file.content, data, studyPath, '', false, variableContext,
  );

  let extractionSuccess = true;
  let extractionVariableCount = 0;

  if (renderedYaml.extractionPromise) {
    const extractResult = await renderedYaml.extractionPromise;
    extractionSuccess = extractResult.success;
    extractionVariableCount = extractResult.variableCount || 0;
    if (!extractResult.success) {
      throw new Error(`Cascade variable extraction failed: ${extractResult.error}`);
    }
  }

  const url: string = renderedYaml.result.url;
  const urlParts: string[] = renderedYaml.result.path.split('/');
  const fileName = urlParts[urlParts.length - 1];

  const planRecord = await research_planService.createResearchPlan({
    study_id: study.id,
    study_name: input.studyName,
    filename: fileName,
    file_path: renderedYaml.result.path,
    file_url: url,
    created_by: input.createdByActorId,
  });

  await addStudyStatus({
    study_id: input.studyId,
    path: url,
    status: 'created',
    created_by: input.createdByActorId,
  });

  return {
    url,
    filePath: renderedYaml.result.path,
    planId: planRecord.id,
    objectivesCount: objectives.length,
    researchQuestionsCount: Array.isArray(upstreamQuestions) ? upstreamQuestions.length : 0,
    targetBarriersCount: Array.isArray(upstreamBarriers) ? upstreamBarriers.length : 0,
    extractionSuccess,
    extractionVariableCount,
  };
}

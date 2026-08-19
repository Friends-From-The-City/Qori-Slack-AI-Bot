/**
 * Brief Application Service — PLAT-3
 *
 * Extracted from briefHandler.ts
 * Orchestrates research brief creation: study creation/lookup, mechanical
 * computations (timeline, display date), discovery injection, pre-render
 * structured LLM tasks (barriers + questions), YAML processing, cascade
 * variable extraction, and approval routing.
 */

import type { ApplicationContext, ScopedApplicationContext } from '../types/application-context';
import type { TimelinePhase, TimelinePreference } from '../utils/timelineComputation';
import { format, parseISO, differenceInCalendarDays, isValid } from 'date-fns';
import { assertProjectAccessByActor } from '../services/authorization.service';
import { getProjectById } from '../services/project.service';
import { addResearchStudyWithRoles, getStudyByProjectAndName } from '../services/research_study.service';
import { scaffoldStudy } from '../services/scaffolding.service';
import { addStudyStatus } from '../services/study-status.service';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../helpers/github';
import { processYamlTemplate } from '../helpers/yamlProcessor';
import { executeAiGenerationTasks } from '../helpers/langchain';
import { loadDiscoveryArtifacts, aggregateDiscoveryVariables, type DiscoveryArtifact } from '../helpers/discoveryLoader';
import { parseBudget, parseParticipantTarget } from '../utils/budgetParser';
import { buildTimelinePhases, TIMELINE_DISPLAY_LABELS } from '../utils/timelineComputation';
import type { VariableContext } from '../helpers/studyVariables';
import sequelize from '../database';

// ─── Input/Output Types ──────────────────────────────────────────

export interface BriefInput {
  /** Project to create the brief under */
  projectId: number;
  projectSlug: string;
  projectName: string;

  /** Researcher info */
  leadResearcher: string;
  requestorName: string;
  createdByActorId: string;
  researcherEmail: string;

  /** Form fields */
  problemStatement: string;
  learningObjectives: string;
  outOfScope: string;
  methodology: string;
  methodologyValue: string;
  participantApproach: string;
  recruitmentSources: string;
  startDate: string;
  decisionDeadline: string;
  budget: string;

  /** Discovery artifact selections (type::slug format) */
  discoverySelections: string[];
}

export interface BriefBarrier {
  id: string;
  barrier: string;
  source: string;
}

export interface BriefQuestion {
  id: string;
  question: string;
  priority: string;
}

export interface BriefObjective {
  id: string;
  objective: string;
}

export interface BriefResult {
  /** URL of the generated brief on GitHub */
  url: string;
  /** Study ID (created or existing) */
  studyId: number;
  /** Study name */
  studyName: string;
  /** Structured data produced by the handler */
  objectives: BriefObjective[];
  researchQuestions: BriefQuestion[];
  targetBarriers: BriefBarrier[];
  /** Cascade extraction outcome */
  extractionSuccess: boolean;
  extractionVariableCount: number;
}

// ─── Discovery type maps ────────────────────────────────────────

type DiscoveryType = 'desk-research' | 'stakeholder-interviews' | 'survey-synthesis';

const markerPrefixes: Record<DiscoveryType, string> = {
  'desk-research': 'D',
  'stakeholder-interviews': 'S',
  'survey-synthesis': 'V',
};

const typeLabels: Record<DiscoveryType, string> = {
  'desk-research': 'Desk research',
  'stakeholder-interviews': 'Stakeholder interviews',
  'survey-synthesis': 'Survey synthesis',
};

// ─── Pre-render LLM task builder ────────────────────────────────

function buildStructuredTasks(data: Record<string, unknown>) {
  return [
    {
      task_id: 'target_barriers_raw',
      output_format: 'json',
      prompt: `Identify the target barriers for validation in this research study.

Problem statement: ${data.problem_statement}
Learning objectives: ${data.learning_objectives}
Methodology: ${data.methodology}

${data.upstream_discovered_barriers ? `DISCOVERY BARRIERS: ${data.upstream_discovered_barriers}` : ''}
${data.upstream_stakeholder_constraints ? `STAKEHOLDER CONSTRAINTS: ${data.upstream_stakeholder_constraints}` : ''}
${data.upstream_survey_findings ? `SURVEY FINDINGS: ${data.upstream_survey_findings}` : ''}

Rules:
1. Each barrier is a specific, testable hypothesis about what prevents users from succeeding.
2. If discovery data exists, ground barriers in that evidence. Include the source.
3. If no discovery data, derive barriers from the problem statement and learning objectives.
4. 3-6 barriers. Fewer is better if they are precise.
5. Do NOT invent statistics, metrics, or numbers. Use ONLY data from the inputs provided.

Output ONLY valid JSON. No prose, no code fences.
Schema: [{"barrier": "string", "source": "string or null"}]`,
    },
    {
      task_id: 'research_questions_raw',
      output_format: 'json',
      prompt: `Generate research questions for this study.

Learning objectives: ${data.learning_objectives}
Problem statement: ${data.problem_statement}
Methodology: ${data.methodology}

${data.upstream_stakeholder_questions_for_users ? `STAKEHOLDER QUESTIONS FOR USERS: ${data.upstream_stakeholder_questions_for_users}` : ''}

Rules:
1. If stakeholder questions exist, use them as research questions (they come pre-prioritized).
2. Otherwise, transform learning objectives into research questions.
3. Mark priority: Primary (must-answer), Secondary (valuable), or Exploratory (nice-to-have).
4. 3-7 questions. Primary questions first.
5. Do NOT invent statistics, metrics, or numbers. Use ONLY data from the inputs provided.

Output ONLY valid JSON. No prose, no code fences.
Schema: [{"question": "string", "priority": "Primary|Secondary|Exploratory"}]`,
    },
  ];
}

function parseJsonResponse<T>(raw: string, taskId: string): T {
  let cleaned = raw;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  try {
    return JSON.parse(cleaned.trim()) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Handler pre-render task '${taskId}' returned invalid JSON: ${message}`);
  }
}

// ─── Main Orchestration ─────────────────────────────────────────

export async function executeBrief(
  ctx: ApplicationContext,
  input: BriefInput,
): Promise<BriefResult> {
  // Authorization: actor must have project access
  await assertProjectAccessByActor(ctx.actor.id, input.projectId, ctx.organization.id);

  const studyName = input.projectSlug;

  // Study creation or lookup
  let study = await getStudyByProjectAndName(input.projectId, studyName);
  let studyId: number;

  if (!study || !study.path) {
    const t = await sequelize.transaction();
    try {
      const project = await getProjectById(input.projectId);
      if (!project) throw new Error('Project not found');

      const scaffoldResult = await scaffoldStudy(
        project.slug,
        studyName,
        studyName,
        project.name,
        input.leadResearcher,
      );

      if (scaffoldResult.errors.length > 0) {
        console.warn('Study scaffolding had non-fatal errors:', scaffoldResult.errors);
      }

      study = await addResearchStudyWithRoles({
        name: studyName,
        project_id: input.projectId,
        slug: studyName,
        description: 'Created from research brief',
        created_by: input.createdByActorId,
        researcher_name: input.leadResearcher,
        researcher_email: input.researcherEmail,
        link: scaffoldResult.studyReadmeUrl,
        path: `${project.slug}/${studyName}`,
        channel_name: '',
        assignments: [],
      });

      studyId = study.id;
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } else {
    studyId = study.id;
  }

  // Parse budget and target participants
  const parsedBudget = parseBudget(input.budget);
  const targetParticipants = parseParticipantTarget(input.participantApproach);
  const studyUpdates: Record<string, unknown> = {};
  if (parsedBudget !== null) studyUpdates.parsed_budget_amount = parsedBudget;
  if (targetParticipants !== null) studyUpdates.target_participants = targetParticipants;
  if (Object.keys(studyUpdates).length > 0) {
    try {
      await study!.update({ ...studyUpdates, updated_at: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Failed to save parsed budget/target:', message);
    }
  }

  // Timeline preference inference
  let timelinePref: TimelinePreference = 'standard';
  if (input.startDate && input.decisionDeadline) {
    const start = parseISO(input.startDate);
    const deadline = parseISO(input.decisionDeadline);
    if (isValid(start) && isValid(deadline)) {
      const gap = differenceInCalendarDays(deadline, start);
      if (gap < 35) timelinePref = 'accelerated';
      else if (gap > 49) timelinePref = 'extended';
    }
  }

  // Mechanical computations
  const displayDate = format(new Date(), 'MMMM d, yyyy');
  const timelineDisplay = TIMELINE_DISPLAY_LABELS[timelinePref] || TIMELINE_DISPLAY_LABELS.standard;
  const timelinePhases = buildTimelinePhases(input.startDate, timelinePref);

  // Discovery injection
  const discoveryContext: Record<string, unknown> = {};
  let discoveryCount: number | undefined;
  let discoverySources: string | undefined;
  let citationConvention: string | undefined;

  if (input.discoverySelections.length > 0) {
    try {
      const allArtifacts: DiscoveryArtifact[] = await loadDiscoveryArtifacts(input.projectId);
      const selectedSlugs = new Set(input.discoverySelections);
      const selectedArtifacts = allArtifacts.filter(
        (a: DiscoveryArtifact) => selectedSlugs.has(`${a.type}::${a.slug}`),
      );

      if (selectedArtifacts.length > 0) {
        const upstreamVars = aggregateDiscoveryVariables(selectedArtifacts);
        Object.assign(discoveryContext, upstreamVars);
        discoveryCount = selectedArtifacts.length;
        discoverySources = selectedArtifacts
          .map((a: DiscoveryArtifact) => {
            const prefix = markerPrefixes[a.type as DiscoveryType] || '?';
            return `| **${prefix}** | ${a.slug} | ${typeLabels[a.type as DiscoveryType] || a.type} | ${a.date} | ${a.variableCount} variables |`;
          })
          .join('\n');
        citationConvention = selectedArtifacts
          .map((a: DiscoveryArtifact) => `[${markerPrefixes[a.type as DiscoveryType] || '?'}N] = ${typeLabels[a.type as DiscoveryType] || a.type} (${a.slug})`)
          .join('; ');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Failed to load discovery variables for brief:', message);
    }
  }

  // Pre-render LLM tasks: barriers + questions
  const structuredTaskData: Record<string, unknown> = {
    problem_statement: input.problemStatement,
    learning_objectives: input.learningObjectives,
    methodology: input.methodology,
    ...discoveryContext,
  };
  const structuredTasks = buildStructuredTasks(structuredTaskData);
  const structuredResponses = await executeAiGenerationTasks(structuredTasks, structuredTaskData);

  interface RawBarrier { barrier: string; source?: string | null }
  interface RawQuestion { question: string; priority?: string | null }

  const rawBarriers = parseJsonResponse<RawBarrier[]>(structuredResponses.target_barriers_raw, 'target_barriers_raw');
  const rawQuestions = parseJsonResponse<RawQuestion[]>(structuredResponses.research_questions_raw, 'research_questions_raw');

  const targetBarriers: BriefBarrier[] = rawBarriers.map((b, i) => ({
    id: `TB-${String(i + 1).padStart(3, '0')}`,
    barrier: b.barrier,
    source: b.source || 'Researcher hypothesis',
  }));

  const researchQuestions: BriefQuestion[] = rawQuestions.map((q, i) => ({
    id: `RQ-${String(i + 1).padStart(3, '0')}`,
    question: q.question,
    priority: q.priority || 'Primary',
  }));

  const researchObjectives: BriefObjective[] = input.learningObjectives
    .split(/\n/)
    .map(line => line.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter(Boolean)
    .map((objective, idx) => ({
      id: `OBJ-${String(idx + 1).padStart(3, '0')}`,
      objective,
    }));

  // Assemble template data
  const data: Record<string, unknown> = {
    selected_study: studyName,
    lead_researcher: input.leadResearcher,
    requestor_name: input.requestorName,
    problem_statement: input.problemStatement,
    learning_objectives: input.learningObjectives,
    out_of_scope: input.outOfScope,
    methodology: input.methodology,
    methodology_value: input.methodologyValue,
    participant_approach: input.participantApproach,
    recruitment_sources: input.recruitmentSources,
    timeline_preference: timelinePref,
    start_date: input.startDate,
    decision_deadline: input.decisionDeadline,
    budget: input.budget,
    display_date: displayDate,
    timeline_display: timelineDisplay,
    timeline_phases: timelinePhases,
    target_barriers: targetBarriers,
    research_questions: researchQuestions,
    research_objectives: researchObjectives,
    objectives_count: researchObjectives.length,
    research_questions_count: researchQuestions.length,
    target_barriers_count: targetBarriers.length,
    ...(discoveryCount !== undefined ? { discovery_count: discoveryCount } : {}),
    ...(discoverySources !== undefined ? { discovery_sources: discoverySources } : {}),
    ...(citationConvention !== undefined ? { citation_convention: citationConvention } : {}),
    ...discoveryContext,
    __artifactContext: {
      projectId: input.projectId,
      studyId,
      artifactType: 'brief',
      title: `Research brief — ${studyName}`,
      canonicalUpstreamInputs: [],
      createdBy: input.createdByActorId,
    },
  };

  const variableContext: VariableContext = { projectId: input.projectId, studyId };

  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, 'research_brief.yaml');
  const renderedYaml = await processYamlTemplate(file.content, data, study!.path ?? '', '', false, variableContext);

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

  await addStudyStatus({
    study_id: studyId,
    path: url,
    status: 'created',
    created_by: input.createdByActorId,
  });

  return {
    url,
    studyId,
    studyName,
    objectives: researchObjectives,
    researchQuestions,
    targetBarriers,
    extractionSuccess,
    extractionVariableCount,
  };
}

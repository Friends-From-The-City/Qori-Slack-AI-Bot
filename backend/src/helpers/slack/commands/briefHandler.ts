/**
 * briefHandler.ts — /qori-brief submission handler
 *
 * DATA ASSEMBLY POINT for the research brief template (ADR 0005).
 * The handler computes all mechanical values (display date, timeline phases,
 * timeline display label, cascade counts). It also runs two structured LLM
 * tasks (target barriers, research questions) directly so it can assign
 * stable IDs before passing the complete data to yamlProcessor for prose
 * tasks + rendering.
 *
 * v7.0 restructure: interleaved Handlebars/AI architecture.
 *
 * Phase 2D: Uses projectId from modal metadata. Study name inherits from
 * project slug. No resolveStudyFromName — uses getStudyByProjectAndName.
 */

import type { AllMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';

import { format, parseISO, differenceInCalendarDays, isValid } from 'date-fns';
import sequelize from '../../../database';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } from '../../github';
import { addResearchStudyWithRoles, getStudyByProjectAndName } from '../../../services/research_study.service';
import { getProjectById } from '../../../services/project.service';
import { scaffoldStudy } from '../../../services/scaffolding.service';
import type { VariableContext } from '../../studyVariables';
import { processYamlTemplate } from '../../yamlProcessor';
import { executeAiGenerationTasks } from '../../langchain';
import { addStudyStatus } from '../../../services/study-status.service';
import { getProjectApprover } from '../../../services/authorization.service';
import { generateStudyResultBlocks, sendStudyResultMessage } from '../ui/studyResultBlocks';
import { loadDiscoveryArtifacts, aggregateDiscoveryVariables, type DiscoveryArtifact } from '../../discoveryLoader';
import { parseBudget, parseParticipantTarget } from '../../../utils/budgetParser';
import {
  buildTimelinePhases,
  TIMELINE_DISPLAY_LABELS,
  type TimelinePhase,
  type TimelinePreference,
} from '../../../utils/timelineComputation';
import type { BriefEntryModalMetadata } from '../ui/researchBriefEntryModal';

// ─── Discovery type maps ────────────────────────────────────────

type DiscoveryType = 'desk-research' | 'stakeholder-interviews' | 'survey-synthesis';

const typeLabels: Record<DiscoveryType, string> = {
  'desk-research': 'Desk research',
  'stakeholder-interviews': 'Stakeholder interviews',
  'survey-synthesis': 'Survey synthesis',
};

const markerPrefixes: Record<DiscoveryType, string> = {
  'desk-research': 'D',
  'stakeholder-interviews': 'S',
  'survey-synthesis': 'V',
};

// ─── Structured LLM output types ────────────────────────────────

interface RawBarrier {
  barrier: string;
  source?: string | null;
}

interface RawQuestion {
  question: string;
  priority?: string | null;
}

interface BriefBarrier {
  id: string;
  barrier: string;
  source: string;
}

interface BriefQuestion {
  id: string;
  question: string;
  priority: string;
}

interface BriefObjective {
  id: string;
  objective: string;
}

// ─── Template input contract ────────────────────────────────────

/** Data shape passed to the research_brief YAML template. Co-located with handler. */
interface BriefTemplateInput {
  selected_study: string;
  lead_researcher: string;
  requestor_name: string;
  problem_statement: string;
  learning_objectives: string;
  out_of_scope: string;
  methodology: string;
  methodology_value: string;
  participant_approach: string;
  recruitment_sources: string;
  timeline_preference: string;
  start_date: string;
  decision_deadline: string;
  budget: string;
  // Mechanical computations (handler-assembled, not LLM-generated)
  display_date: string;
  timeline_display: string;
  timeline_phases: TimelinePhase[];
  // Handler-assigned structured data (from pre-render LLM JSON tasks + ID assignment)
  target_barriers: BriefBarrier[];
  research_questions: BriefQuestion[];
  research_objectives: BriefObjective[];
  // Cascade summary counts
  objectives_count: number;
  research_questions_count: number;
  target_barriers_count: number;
  // Discovery enrichment (optional, injected conditionally)
  discovery_count?: number;
  discovery_sources?: string;
  citation_convention?: string;
  [key: string]: unknown; // upstream discovery variables merged via Object.assign
}

// ─── Pre-render LLM tasks ───────────────────────────────────────

/**
 * Build the two structured JSON tasks that the handler runs directly
 * (Option C from the delta document). These produce barrier/question
 * arrays without IDs. The handler assigns IDs mechanically after parsing.
 */
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
2. Otherwise, transform learning objectives into research questions. Research questions
   must be answerable through sessions — transform each objective into what a researcher
   would actually investigate, not a restatement. If a question would be near-identical
   to its objective, sharpen it toward observable behavior or decision criteria.
3. Mark priority: Primary (must-answer), Secondary (valuable), or Exploratory (nice-to-have).
4. 3-7 questions. Primary questions first.
5. Do NOT invent statistics, metrics, or numbers. Use ONLY data from the inputs provided.

Output ONLY valid JSON. No prose, no code fences.
Schema: [{"question": "string", "priority": "Primary|Secondary|Exploratory"}]`,
    },
  ];
}

/**
 * Parse a JSON AI response, stripping code fences if present.
 */
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

  // ── Study creation (Phase 2D: uses projectId from metadata) ──
  let study = await getStudyByProjectAndName(projectId, studyName);
  let studyId: number;

  if (!study || !study.path) {
    console.log('📁 Study does not exist yet — creating from brief submission');

    // Start transaction: study creation + brief generation succeed or fail together
    const t = await sequelize.transaction();

    try {
      const userInfo = await client.users.info({ user: body.user.id });
      const userEmail: string = userInfo.user?.profile?.email || `${body.user.id}@slack.com`;
      const userName: string = userInfo.user?.real_name || userInfo.user?.profile?.display_name || body.user.id;

      // Get project for folder path
      const project = await getProjectById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Scaffold study folder in GitHub: {project-slug}/{study-slug}/
      // Phase B-0.5: Uses scaffolding service instead of folder template copy
      const scaffoldResult = await scaffoldStudy(
        project.slug,
        studyName,
        studyName, // studyName serves as both name and slug (Phase 2D)
        project.name,
        userName,
      );

      // Log any non-fatal scaffolding errors (e.g., observer guide fetch failures)
      if (scaffoldResult.errors.length > 0) {
        console.warn('⚠️ Study scaffolding had non-fatal errors:', scaffoldResult.errors);
      }

      // Create study with project_id (Phase 2D: no @ts-expect-error)
      study = await addResearchStudyWithRoles({
        name: studyName,
        project_id: projectId,
        slug: studyName,
        description: `Created from research brief`,
        created_by: body.user.id,
        researcher_name: userName,
        researcher_email: userEmail,
        link: scaffoldResult.studyReadmeUrl,
        path: `${project.slug}/${studyName}`,
        channel_name: channelId,
        assignments: [],
      });

      studyId = study.id;
      await t.commit();
      console.log(`✅ Study "${studyName}" created from brief, path: ${study.path}`);
    } catch (createError) {
      await t.rollback();
      const createMessage = createError instanceof Error ? createError.message : String(createError);
      console.error('❌ Failed to create study from brief:', createError);
      const errMsg: string = createMessage.includes('<!DOCTYPE')
        ? 'GitHub is temporarily unavailable. Please try again in a moment.'
        : createMessage;
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Could not create study folder: ${errMsg}`,
      });
      return;
    }
  } else {
    studyId = study.id;
  }

  // ── Methodology (unchanged from v6.0) ──
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

  // ── Form values ──
  const problemStatement = (extract('problem_statement_block', 'problem_statement_input') as string) || '';
  const learningObjectives = (extract('learning_objectives_block', 'learning_objectives_input') as string) || '';
  const outOfScope = (extract('out_of_scope_block', 'out_of_scope_input') as string) || '';
  const participantApproach = (extract('participant_approach_block', 'participant_approach_input') as string) || '';
  const recruitmentSources = (extract('recruitment_sources_block', 'recruitment_sources_input') as string) || '';
  const startDate = (extract('start_date_block', 'start_date_picker') as string) || '';
  const decisionDeadline = (extract('decision_deadline_block', 'decision_deadline_picker') as string) || '';
  const budgetStr = (extract('budget_block', 'budget_input') as string) || '';

  // ── Parse budget and target participants, save to study row ──
  const parsedBudget: number | null = parseBudget(budgetStr);
  const targetParticipants: number | null = parseParticipantTarget(participantApproach);
  const studyUpdates: Record<string, unknown> = {};
  if (parsedBudget !== null) studyUpdates.parsed_budget_amount = parsedBudget;
  if (targetParticipants !== null) studyUpdates.target_participants = targetParticipants;
  if (Object.keys(studyUpdates).length > 0) {
    try {
      await study!.update({ ...studyUpdates, updated_at: new Date() });
      console.log(`💰 Parsed budget: ${parsedBudget}, target: ${targetParticipants} for study ${studyName}`);
    } catch (budgetErr) {
      const message = budgetErr instanceof Error ? budgetErr.message : String(budgetErr);
      console.warn('⚠️ Failed to save parsed budget/target:', message);
    }
  }

  // ── Compute timeline_preference from date gap (replaces modal radio) ──
  // Researchers think in dates, not buckets. Handler infers the preference
  // from (decision_deadline - start_date): <35 days = accelerated, 35-49 = standard, >49 = extended.
  let timelinePref: TimelinePreference = 'standard';
  if (startDate && decisionDeadline) {
    const start = parseISO(startDate);
    const deadline = parseISO(decisionDeadline);
    if (isValid(start) && isValid(deadline)) {
      const gap = differenceInCalendarDays(deadline, start);
      if (gap < 35) timelinePref = 'accelerated';
      else if (gap > 49) timelinePref = 'extended';
    }
  }

  // ── Mechanical computations (ADR 0005: handler computes, not LLM) ──
  const displayDate = format(new Date(), 'MMMM d, yyyy');
  const timelineDisplay = TIMELINE_DISPLAY_LABELS[timelinePref] || TIMELINE_DISPLAY_LABELS.standard;
  const timelinePhases = buildTimelinePhases(startDate, timelinePref);

  // ── Discovery injection (Phase 2D: uses projectId from metadata) ──
  const discoveryContext: Record<string, unknown> = {};
  let discoveryCount: number | undefined;
  let discoverySources: string | undefined;
  let citationConvention: string | undefined;

  const discoverySelections = (extract('discovery_selection_block', 'discovery_selection') as string[] | null) || [];
  if (discoverySelections.length > 0) {
    try {
      const allArtifacts: DiscoveryArtifact[] = await loadDiscoveryArtifacts(projectId);
      const selectedSlugs = new Set(discoverySelections);
      const selectedArtifacts = allArtifacts.filter((a: DiscoveryArtifact) => selectedSlugs.has(`${a.type}::${a.slug}`));

      if (selectedArtifacts.length > 0) {
        const upstreamVars: Record<string, unknown> = aggregateDiscoveryVariables(selectedArtifacts);
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

        console.log(`✅ Injected ${Object.keys(upstreamVars).length} upstream variables from ${selectedArtifacts.length} discovery artifact(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('⚠️ Failed to load discovery variables for brief, proceeding without:', message);
    }
  }

  // ── Pre-render LLM tasks: barriers + questions (Option C) ──
  // The handler runs these directly so it can assign IDs before yamlProcessor
  // runs the prose tasks. The prose tasks receive the ID'd data as context.
  const structuredTaskData: Record<string, unknown> = {
    problem_statement: problemStatement,
    learning_objectives: learningObjectives,
    methodology: methodLabel,
    ...discoveryContext,
  };
  const structuredTasks = buildStructuredTasks(structuredTaskData);

  console.log('📋 Running pre-render structured LLM tasks (barriers + questions)...');
  const structuredResponses = await executeAiGenerationTasks(structuredTasks, structuredTaskData);

  // Parse and assign IDs
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

  // Research objectives: split learning objectives into individual items and assign IDs
  const researchObjectives: BriefObjective[] = learningObjectives
    .split(/\n/)
    .map(line => line.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter(Boolean)
    .map((objective, idx) => ({
      id: `OBJ-${String(idx + 1).padStart(3, '0')}`,
      objective,
    }));

  console.log(`📋 Structured data assembled: ${targetBarriers.length} barriers, ${researchQuestions.length} questions, ${researchObjectives.length} objectives`);

  // ── Resolve stakeholder display name from users_select ──
  const stakeholderUserId: string | null =
    values.stakeholder_block?.stakeholder_select?.selected_user || null;
  let requestorName = '';
  if (stakeholderUserId) {
    try {
      const userInfo = await client.users.info({ user: stakeholderUserId });
      const user = userInfo.user as Record<string, any> | undefined;
      requestorName = user?.real_name || user?.profile?.display_name || user?.name || stakeholderUserId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Could not resolve stakeholder display name:', message);
      requestorName = stakeholderUserId;
    }
  }

  // ── Assemble complete data object ──
  const data: BriefTemplateInput = {
    selected_study: studyName,
    lead_researcher: leadResearcher,
    requestor_name: requestorName,
    problem_statement: problemStatement,
    learning_objectives: learningObjectives,
    out_of_scope: outOfScope,
    methodology: methodLabel,
    methodology_value: methodValue,
    participant_approach: participantApproach,
    recruitment_sources: recruitmentSources,
    timeline_preference: timelinePref,
    start_date: startDate,
    decision_deadline: decisionDeadline,
    budget: budgetStr,

    // Mechanical computations
    display_date: displayDate,
    timeline_display: timelineDisplay,
    timeline_phases: timelinePhases,

    // Handler-assigned structured data
    target_barriers: targetBarriers,
    research_questions: researchQuestions,
    research_objectives: researchObjectives,

    // Cascade summary counts
    objectives_count: researchObjectives.length,
    research_questions_count: researchQuestions.length,
    target_barriers_count: targetBarriers.length,

    // Discovery enrichment
    ...(discoveryCount !== undefined ? { discovery_count: discoveryCount } : {}),
    ...(discoverySources !== undefined ? { discovery_sources: discoverySources } : {}),
    ...(citationConvention !== undefined ? { citation_convention: citationConvention } : {}),
    ...discoveryContext,
  };

  console.log(`📋 Assembled brief data: ${Object.keys(data).length} fields, ${data.objectives_count} objectives, ${data.research_questions_count} RQs, ${data.target_barriers_count} TBs, study: ${studyName}`);

  // ── Process YAML template (prose tasks + rendering + extraction) ──
  const variableContext: VariableContext = { projectId, studyId };

  // PH-6D1: Canonical artifact identity for research brief
  (data as unknown as Record<string, unknown>).__artifactContext = {
    projectId,
    studyId,
    artifactType: 'brief',
    title: `Research brief — ${studyName}`,
    canonicalUpstreamInputs: [], // No canonical evidence constructs; cascade fingerprint used
    createdBy: body.user.id,
  };

  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "research_brief.yaml");
  const renderedYaml = await processYamlTemplate(file.content, data, study.path ?? '', '', false, variableContext);

  // CRITICAL: Await extraction to ensure cascade variables are committed before returning success.
  // Without this, downstream modals (plan) may read stale data. See ADR 0019.
  if (renderedYaml.extractionPromise) {
    const extractResult = await renderedYaml.extractionPromise;
    if (!extractResult.success) {
      throw new Error(`Cascade variable extraction failed: ${extractResult.error}. Document was saved but variables were not written.`);
    }
    console.log(`✅ Cascade variables committed: ${extractResult.variableCount} items (${extractResult.keys?.join(', ')})`);
  }

  const url: string = renderedYaml.result.url;

  // ── Send brief approval request to stakeholder (or owner fallback) ──
  // This is the CRITICAL approval routing that was missing
  const briefBlocks = generateStudyResultBlocks(studyName, study, url, channelId || '', 'brief');
  await sendStudyResultMessage(client, channelId || '', studyName, briefBlocks, 'brief');

  // ── Update brief status to pending_approval ──
  const approverInfo = await getProjectApprover(projectId);
  try {
    await study.update({
      brief_status: 'pending_approval',
      brief_reviewer_id: approverInfo?.userId || null,
    });
    console.log(`📋 Brief status set to pending_approval, reviewer: ${approverInfo?.userId || 'none'}`);
  } catch (updateErr) {
    console.error('Failed to update brief status:', updateErr);
    // Non-fatal: brief was created, just status tracking failed
  }

  // ── Notify researcher via DM with specific approver info ──
  try {
    let approverDisplay = 'the project owner';
    let approverRole = 'owner';
    if (approverInfo) {
      approverRole = approverInfo.source === 'stakeholder' ? 'stakeholder' : 'owner';
      try {
        const userInfo = await client.users.info({ user: approverInfo.userId });
        const user = userInfo.user as Record<string, unknown> | undefined;
        const profile = user?.profile as Record<string, unknown> | undefined;
        approverDisplay = (user?.real_name || profile?.display_name || user?.name || `<@${approverInfo.userId}>`) as string;
      } catch {
        approverDisplay = `<@${approverInfo.userId}>`;
      }
    }

    const im = await client.conversations.open({ users: body.user.id });
    if (im.channel?.id) {
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Research Brief Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\nBrief sent to *${approverDisplay}* (${approverRole}) for approval.\n\n*Next:* Run \`/qori-plan\` to create an execution plan once approved.`,
      });
    }
  } catch (error) {
    console.error('Failed to send confirmation to researcher:', error);
  }

  await addStudyStatus({
    study_id: studyId,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });

  console.log(`✅ Research brief created for study: ${studyName}`);
}

export { handleBriefSubmission };

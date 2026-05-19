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
 */

import type { AllMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';

import { format, parseISO, differenceInCalendarDays, isValid } from 'date-fns';
import { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, readFolders, copyFilesToFolder } from '../../github';
import { getResearchStudyWithRoles, addResearchStudyWithRoles } from '../../../services/research_study.service';
import { getChannelConfigByChannelId } from '../../../services/channel-config.service';
import { processYamlTemplate } from '../../yamlProcessor';
import { executeAiGenerationTasks } from '../../langchain';
import { addStudyStatus } from '../../../services/study-status.service';
import { sendStudyResultMessage, generateStudyResultBlocks } from '../ui/studyResultBlocks';
import { loadDiscoveryArtifacts, aggregateDiscoveryVariables, type DiscoveryArtifact } from '../../discoveryLoader';
import { parseBudget, parseParticipantTarget } from '../../../utils/budgetParser';
import {
  buildTimelinePhases,
  TIMELINE_DISPLAY_LABELS,
  type TimelinePhase,
  type TimelinePreference,
} from '../../../utils/timelineComputation';

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
  research_objectives: string[];
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
2. Otherwise, reframe learning objectives as answerable research questions.
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
 */
async function handleBriefSubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const { channelId } = meta as { channelId: string };

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

  // Extract and slugify study name
  const studyNameRaw = (extract('study_name_block', 'study_name_input') as string | null) || meta.studyName;
  const studyName: string | null = studyNameRaw
    ? studyNameRaw.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : null;

  if (!studyName) {
    console.error('No study name provided for research brief');
    return;
  }

  console.log("🚀 ~ Research Brief ~ studyName:", studyName);

  // ── Study creation (unchanged from v6.0) ──
  let study = await getResearchStudyWithRoles(studyName!);

  if (!study || !study.path) {
    console.log('📁 Study does not exist yet — creating from brief submission');
    try {
      const userInfo = await client.users.info({ user: body.user.id });
      const userEmail: string = userInfo.user?.profile?.email || `${body.user.id}@slack.com`;
      const userName: string = userInfo.user?.real_name || userInfo.user?.profile?.display_name || body.user.id;

      const channelConfig = await getChannelConfigByChannelId(channelId);
      if (!channelConfig) {
        throw new Error('No channel config found — run /qori-repo first to link a repository folder');
      }

      const templateFiles = await readFolders('config/templates', getConfigRepo());
      const folderResult = await copyFilesToFolder(
        templateFiles,
        `${channelConfig.sub_folder_name}/research`,
        studyName,
        // @ts-expect-error — pre-existing type mismatch from require() → import migration
        process.env.GITHUB_REPO,
        channelConfig.product_folder_name
      );

      await addResearchStudyWithRoles({
        name: studyName,
        description: `Created from research brief`,
        created_by: body.user.id,
        researcher_name: userName,
        researcher_email: userEmail,
        link: folderResult.url,
        path: folderResult.path,
        channel_name: channelId,
        assignments: [],
      });

      study = await getResearchStudyWithRoles(studyName!);
      console.log(`✅ Study "${studyName}" created from brief, path: ${study!.path}`);
    } catch (createError) {
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
  const leadResearcher: string = meta.leadResearcher || body.user.name || '';

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

  // ── Discovery injection (unchanged from v6.0) ──
  const discoveryContext: Record<string, unknown> = {};
  let discoveryCount: number | undefined;
  let discoverySources: string | undefined;
  let citationConvention: string | undefined;

  const discoverySelections = (extract('discovery_selection_block', 'discovery_selection') as string[] | null) || [];
  if (discoverySelections.length > 0) {
    const team: string = meta.team || process.env.QORI_TEAM_SLUG || 'friends-lab';
    try {
      const allArtifacts: DiscoveryArtifact[] = await loadDiscoveryArtifacts(team);
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

  // Research objectives: split learning objectives into individual items
  const researchObjectives: string[] = learningObjectives
    .split(/\n/)
    .map(line => line.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter(Boolean);

  console.log(`📋 Structured data assembled: ${targetBarriers.length} barriers, ${researchQuestions.length} questions, ${researchObjectives.length} objectives`);

  // ── Assemble complete data object ──
  const data: BriefTemplateInput = {
    selected_study: studyName,
    lead_researcher: leadResearcher,
    requestor_name: (extract('stakeholder_block', 'stakeholder_input') as string) || '',
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
  const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "research_brief.yaml");
  const renderedYaml = await processYamlTemplate(file.content, data, study!.path ?? '');

  const url: string = renderedYaml.result.url;

  const blocks = generateStudyResultBlocks(studyName, study, url, channelId, 'brief');
  await sendStudyResultMessage(client, channelId, studyName, blocks, 'brief');

  // Notify researcher via DM
  try {
    const im = await client.conversations.open({ users: body.user.id });
    if (im.channel?.id) {
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Research Brief Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\nThe brief has been sent to the study team for approval.\n\n*Next:* Run \`/qori-plan\` to create an execution plan once approved.`,
      });
    }
  } catch (error) {
    console.error('Failed to send confirmation to researcher:', error);
  }

  await addStudyStatus({
    study_name: studyName,
    path: url,
    status: 'created',
    created_by: body.user?.id || null,
  });

  console.log(`✅ Research brief created for study: ${studyName}`);
}

export { handleBriefSubmission };

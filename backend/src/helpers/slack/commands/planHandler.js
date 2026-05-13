/**
 * planHandler.js — /qori-plan submission handler
 *
 * Extracted from events.js for maintainability. Handles the research_plan_modal
 * submission: form extraction, compensation calculation, timeline computation,
 * cascade variable consumption, YAML processing, and result messaging.
 *
 * This handler is the DATA ASSEMBLY POINT for the research plan template.
 * The template is dumb — it iterates and interpolates. Computed values
 * (compensation, dates, counts) are calculated here, not by the LLM.
 */
const { addDays, format, parseISO, isValid } = require('date-fns');
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } = require('../../github');
const { getResearchStudyWithRoles } = require('../../../services/research_study.service');
const { processYamlTemplate, TemplateContractError } = require('../../yamlProcessor');
const { addStudyStatus } = require('../../../services/study-status.service');
const { sendStudyResultMessage, generateStudyResultBlocks } = require('../ui/studyResultBlocks');
const { calculatePerPersonCompensation } = require('../../../utils/compensationCalculator');
const { readUpstreamVariables } = require('../../studyVariables');
const research_planService = require('../../../services/research_plan.service');

// ─── Timeline computation ───────────────────────────────────────────

// Alpha-phase durations (hardcoded). Revisit when we have signal from real runs.
const PHASE_DURATIONS = {
  standard:    { planning: 3, recruitment: 7, fieldwork: 5, analysis: 1, reporting: 1 },
  accelerated: { planning: 2, recruitment: 4, fieldwork: 3, analysis: 1, reporting: 1 },
  extended:    { planning: 7, recruitment: 14, fieldwork: 10, analysis: 3, reporting: 2 },
};

/**
 * Build timeline phases with calculated dates.
 * Returns an array of { phase, dates, duration } objects for Handlebars iteration.
 */
function buildTimelinePhases(startDateStr, timelinePref) {
  const durations = PHASE_DURATIONS[timelinePref] || PHASE_DURATIONS.standard;

  let cursor;
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
    const result = {
      phase: p.name,
      dates: `${format(phaseStart, 'MMM d')} – ${format(phaseEnd, 'MMM d, yyyy')}`,
      duration: `${p.days} day${p.days > 1 ? 's' : ''}`,
    };
    cursor = addDays(phaseEnd, 1); // next phase starts day after
    return result;
  });
}

/**
 * Compute a human-readable timeline summary from the phases array.
 * Returns e.g. "3 weeks, starting Jun 1, 2026" or "12 days, starting Jun 1, 2026".
 */
function buildTimelineSummary(timelinePhases) {
  if (!timelinePhases || timelinePhases.length === 0) return 'TBD';

  // Sum days from duration strings like "3 days", "1 day"
  const totalDays = timelinePhases.reduce((sum, p) => {
    const match = p.duration.match(/(\d+)/);
    return sum + (match ? parseInt(match[1], 10) : 0);
  }, 0);

  if (totalDays === 0) return 'TBD';

  // Extract start date from the first phase's dates string (e.g. "Jun 1 – Jun 3, 2026")
  const startPart = timelinePhases[0].dates.split('–')[0].trim();
  // Append the year from the last phase's end date
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

// ─── Handler ────────────────────────────────────────────────────────

async function handlePlanSubmission({ ack, body, view, client }) {
  await ack();

  const values = view.state.values;
  const { channelId, studyName: metaStudyName, userId } = JSON.parse(view.private_metadata || '{}');

  const studyName = values.study_folder_block?.study_folder_input?.value || metaStudyName;
  if (!studyName) {
    throw new Error('No study selected or provided');
  }

  console.log("🚀 ~ Research Plan Generator ~ studyName:", studyName);

  const study = await getResearchStudyWithRoles(studyName);

  // Form extraction helper
  const extract = (blockId, actionId) => {
    const block = values[blockId];
    if (!block) return null;
    const action = block[actionId];
    if (!action) return null;
    if (action.value !== undefined) return action.value?.trim() || null;
    if (action.selected_option !== undefined) return action.selected_option.value || null;
    if (action.selected_date !== undefined) return action.selected_date;
    if (action.selected_options !== undefined) return action.selected_options.map(opt => opt.value);
    return null;
  };

  // ── Modal inputs ──
  const leadResearcher = extract('lead_researcher_block', 'lead_researcher_input') || '';
  const recruitmentSources = extract('recruitment_source_block', 'recruitment_source_input') || '';
  const operationalRisks = extract('operational_risks_block', 'operational_risks_input') || '';
  const startDate = extract('start_date_block', 'start_date_picker') || '';
  const timelinePref = extract('timeline_block', 'timeline_radio') || 'standard';

  // ── Compensation (mechanical) ──
  const perParticipantComp = calculatePerPersonCompensation(study);

  // ── Timeline phases (mechanical) ──
  const timelinePhases = buildTimelinePhases(startDate, timelinePref);
  const timelineSummary = buildTimelineSummary(timelinePhases);

  // ── Load upstream cascade variables for template iteration ──
  // The processor also loads them (via consumes block) for AI prompt injection,
  // but we need raw arrays here for Handlebars iteration in the output_template.
  let upstreamObjectives = [];
  let upstreamQuestions = [];
  let upstreamBarriers = [];
  let methodology = '';
  try {
    const upstream = await readUpstreamVariables(study.path, [
      { key: 'research_objectives', required: false },
      { key: 'research_questions', required: false },
      { key: 'target_barriers', required: false },
      { key: 'methodology_selection', required: false },
    ]);
    upstreamObjectives = upstream.research_objectives?.value || [];
    upstreamQuestions = upstream.research_questions?.value || [];
    upstreamBarriers = upstream.target_barriers?.value || [];
    methodology = upstream.methodology_selection?.value || '';
  } catch (err) {
    console.warn('⚠️ Plan handler: upstream load for iteration failed, template will use AI-only:', err.message);
  }

  // ── Transform objectives: brief emits plain strings, template needs {id, objective} ──
  // Defensive: handles both string arrays (current brief schema) and object arrays
  // (future schema evolution) so the transform works either way.
  const objectives = (Array.isArray(upstreamObjectives) ? upstreamObjectives : []).map((item, index) => ({
    id: `OBJ-${String(index + 1).padStart(3, '0')}`,
    objective: typeof item === 'string' ? item : item.objective || '',
  }));

  // ── Assemble the complete data object ──
  const data = {
    // Pass-through identifiers
    selected_study: studyName,
    project_title: studyName,
    lead_researcher: leadResearcher,
    recruitment_sources: recruitmentSources,
    operational_risks: operationalRisks,

    // Compensation (mechanical)
    per_participant_compensation: perParticipantComp,
    parsed_budget_amount: study.parsed_budget_amount ? parseFloat(study.parsed_budget_amount) : null,
    target_participants: study.target_participants,

    // Timeline (mechanical)
    timeline_phases: timelinePhases,
    timeline_summary: timelineSummary,
    start_date: startDate,
    timeline_preference: timelinePref,

    // Upstream arrays for Handlebars iteration
    objectives,
    research_questions: Array.isArray(upstreamQuestions) ? upstreamQuestions : [],
    target_barriers: Array.isArray(upstreamBarriers) ? upstreamBarriers : [],
    methodology: methodology,

    // Counts (mechanical)
    objectives_count: objectives.length,
    research_questions_count: Array.isArray(upstreamQuestions) ? upstreamQuestions.length : 0,
    target_barriers_count: Array.isArray(upstreamBarriers) ? upstreamBarriers.length : 0,
  };

  console.log(`📋 Assembled plan data: ${Object.keys(data).length} fields, ${data.objectives_count} objectives, ${data.research_questions_count} RQs, study: ${studyName}`);

  try {
    const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "research_plan.yaml");
    const renderedYaml = await processYamlTemplate(file.content, data, study.path);

    const url = renderedYaml.result.url;
    const urlParts = renderedYaml.result.path.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const planData = {
      study_id: study.id,
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
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `✅ *Research Plan Created*\n\n*Study:* ${studyName}\n*View:* <${url}|GitHub>\n\n*Next:* Run \`/qori-fieldwork\` to track participants, observers, and outreach.`,
      });
    } catch (dmErr) { console.error('Failed to send plan DM:', dmErr.message); }

    await addStudyStatus({
      study_name: studyName,
      path: url,
      status: 'created',
      created_by: body.user?.id || body.user_id || null,
    });
  } catch (err) {
    if (err instanceof TemplateContractError) {
      console.warn(`⚠️ Cascade contract error for plan: ${err.message}`);
      try {
        const im = await client.conversations.open({ users: userId });
        await client.chat.postMessage({
          channel: im.channel.id,
          text: `⚠️ *Could not generate the research plan*\n\n${err.userMessage}\n\nRun \`/qori-brief\` to complete the brief, then try \`/qori-plan\` again.`,
        });
      } catch (dmErr) { console.error('Failed to send contract error DM:', dmErr.message); }
    } else {
      throw err;
    }
  }
}

module.exports = { handlePlanSubmission, buildTimelinePhases, buildTimelineSummary };

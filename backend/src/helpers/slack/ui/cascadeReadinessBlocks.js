// cascadeReadinessBlocks.js — Build Slack Block Kit blocks for cascade readiness display

// Consumes specs per template (from cascade contracts in YAML)
// Must stay in sync with YAML templates' consumes: blocks
const TEMPLATE_CONSUMES = {
  // Synthesis modal — method-dependent
  affinity_mapping: [
    { key: 'atomic_nuggets', required: true, label: 'Atomic nuggets', source_hint: 'Run session summaries first' },
    { key: 'target_barriers', required: false, label: 'Target barriers', source_hint: 'Run research brief first' },
  ],
  journey_mapping: [
    { key: 'atomic_nuggets', required: true, label: 'Atomic nuggets', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
  ],
  persona_generation: [
    { key: 'atomic_nuggets', required: true, label: 'Atomic nuggets', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
    { key: 'participant_metadata', required: true, label: 'Participant metadata', source_hint: 'Run session summaries first' },
  ],
  jobs_to_be_done: [
    { key: 'atomic_nuggets', required: true, label: 'Atomic nuggets', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
  ],
  usability_issues: [
    { key: 'atomic_nuggets', required: true, label: 'Atomic nuggets', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
  ],
  design_opportunities: [
    { key: 'atomic_nuggets', required: true, label: 'Atomic nuggets', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder constraints', source_hint: 'Run stakeholder synthesis first' },
  ],
  service_blueprint: [
    { key: 'atomic_nuggets', required: true, label: 'Atomic nuggets', source_hint: 'Run session summaries first' },
    { key: 'backstage_observations', required: false, label: 'Backstage observations', source_hint: 'Run stakeholder synthesis first' },
    { key: 'system_failure_modes', required: false, label: 'System failure modes', source_hint: 'Run stakeholder synthesis first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder constraints', source_hint: 'Run stakeholder synthesis first' },
  ],

  // Planning modals
  research_brief: [
    { key: 'discovered_barriers', required: false, label: 'Discovered barriers', source_hint: 'Run desk research first' },
    { key: 'knowledge_gaps', required: false, label: 'Knowledge gaps', source_hint: 'Run desk research first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder constraints', source_hint: 'Run stakeholder synthesis first' },
    { key: 'stakeholder_priorities', required: false, label: 'Stakeholder priorities', source_hint: 'Run stakeholder synthesis first' },
  ],
  research_plan: [
    { key: 'research_objectives', required: false, label: 'Research objectives', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: false, label: 'Methodology', source_hint: 'Create research brief first' },
    { key: 'participant_approach', required: false, label: 'Participant approach', source_hint: 'Create research brief first' },
    { key: 'timeline_preference', required: false, label: 'Timeline', source_hint: 'Create research brief first' },
    { key: 'start_date', required: false, label: 'Start date', source_hint: 'Create research brief first' },
    { key: 'decision_deadline', required: false, label: 'Decision deadline', source_hint: 'Create research brief first' },
  ],
  discussion_guide: [
    { key: 'research_objectives', required: false, label: 'Research objectives', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: false, label: 'Research questions', source_hint: 'Create research brief first' },
    { key: 'target_barriers', required: false, label: 'Target barriers', source_hint: 'Create research brief first' },
  ],
  stakeholder_interview_guide: [
    { key: 'discovered_barriers', required: false, label: 'Discovered barriers', source_hint: 'Run desk research first' },
    { key: 'knowledge_gaps', required: false, label: 'Knowledge gaps', source_hint: 'Run desk research first' },
  ],
};

/**
 * Build cascade readiness from study variables for a given template.
 * @param {Object} studyVars - Parsed study-variables.json
 * @param {string} templateKey - Key from TEMPLATE_CONSUMES
 * @returns {{ available: Array, missing: Array }} or null
 */
function buildCascadeReadiness(studyVars, templateKey) {
  const consumes = TEMPLATE_CONSUMES[templateKey];
  if (!consumes) return null;

  const available = [];
  const missing = [];

  for (const spec of consumes) {
    const variable = studyVars.variables[spec.key];
    if (variable && variable.value) {
      const count = Array.isArray(variable.value) ? variable.value.length : 1;
      const sourceTemplate = variable.source?.template || 'unknown';
      const sourceDates = variable.source?.dates || (variable.source?.date ? [variable.source.date] : []);
      available.push({
        key: spec.key,
        label: spec.label,
        count,
        source: sourceTemplate,
        sessions: sourceDates.length,
        required: spec.required,
      });
    } else {
      missing.push({
        key: spec.key,
        label: spec.label,
        required: spec.required,
        hint: spec.source_hint,
      });
    }
  }

  return { available, missing };
}

/**
 * Build Slack Block Kit blocks for cascade readiness display.
 * Returns an array of blocks to insert into any modal.
 * Returns empty array if no cascade data.
 */
function buildCascadeBlocks(cascadeData) {
  if (!cascadeData) return [];

  const blocks = [
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: "*Cascade Context*" } },
  ];

  // Available variables
  if (cascadeData.available.length > 0) {
    blocks.push({
      type: "context",
      block_id: "cascade_available",
      elements: [
        {
          type: "mrkdwn",
          text: cascadeData.available.map(v => {
            const countStr = v.count === 1 ? '1 item' : `${v.count} items`;
            const sessionStr = v.sessions > 1 ? ` from ${v.sessions} sessions` : '';
            return `${v.required ? ':white_check_mark:' : ':large_blue_circle:'} *${v.label}* — ${countStr}${sessionStr}`;
          }).join('\n'),
        },
      ],
    });
  }

  // Missing variables
  if (cascadeData.missing.length > 0) {
    blocks.push({
      type: "context",
      block_id: "cascade_missing",
      elements: [
        {
          type: "mrkdwn",
          text: cascadeData.missing.map(v => {
            const icon = v.required ? ':warning:' : ':white_circle:';
            return `${icon} *${v.label}* — ${v.hint}`;
          }).join('\n'),
        },
      ],
    });
  }

  // Summary
  const requiredMissing = cascadeData.missing.filter(v => v.required).length;
  blocks.push({
    type: "context",
    block_id: "cascade_summary",
    elements: [
      {
        type: "mrkdwn",
        text: requiredMissing === 0
          ? '_All required cascade variables are present. Synthesis will use structured upstream context._'
          : `_${requiredMissing} required variable(s) missing. Synthesis will use raw file content as fallback._`,
      },
    ],
  });

  return blocks;
}

module.exports = { buildCascadeReadiness, buildCascadeBlocks, TEMPLATE_CONSUMES };

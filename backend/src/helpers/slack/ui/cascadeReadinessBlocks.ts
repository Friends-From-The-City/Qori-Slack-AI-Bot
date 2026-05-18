// cascadeReadinessBlocks.ts — Build Slack Block Kit blocks for cascade readiness display

interface ConsumeSpec {
  key: string;
  required: boolean;
  label: string;
  source_hint: string;
}

interface AvailableVariable {
  key: string;
  label: string;
  count: number;
  source: string;
  sessions: number;
  required: boolean;
}

interface MissingVariable {
  key: string;
  label: string;
  required: boolean;
  hint: string;
}

interface CascadeData {
  available: AvailableVariable[];
  missing: MissingVariable[];
}

interface VariableValue {
  value?: unknown;
  source?: {
    template?: string;
    dates?: string[];
    date?: string;
  };
}

interface StudyVars {
  variables: Record<string, VariableValue>;
}

// Consumes specs per template (from cascade contracts in YAML)
// Must stay in sync with YAML templates' consumes: blocks
const TEMPLATE_CONSUMES: Record<string, ConsumeSpec[]> = {
  // Synthesis modal — method-dependent
  affinity_mapping: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic nuggets (core)', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic nuggets (detail)', source_hint: 'Run session summaries first' },
    { key: 'target_barriers', required: false, label: 'Target barriers', source_hint: 'Run research brief first' },
    { key: 'research_questions', required: false, label: 'Research questions', source_hint: 'Run research brief first' },
    { key: 'participant_metadata', required: false, label: 'Participant metadata', source_hint: 'Run session summaries first' },
  ],
  journey_mapping: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic nuggets (core)', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic nuggets (detail)', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'target_barriers', required: false, label: 'Target barriers', source_hint: 'Run research brief first' },
    { key: 'research_questions', required: false, label: 'Research questions', source_hint: 'Run research brief first' },
  ],
  persona_generation: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic nuggets (core)', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic nuggets (detail)', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
    { key: 'participant_metadata', required: true, label: 'Participant metadata', source_hint: 'Run session summaries first' },
    { key: 'target_barriers', required: false, label: 'Target barriers', source_hint: 'Run research brief first' },
    { key: 'research_questions', required: false, label: 'Research questions', source_hint: 'Run research brief first' },
  ],
  jobs_to_be_done: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic nuggets (core)', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic nuggets (detail)', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
  ],
  usability_issues: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic nuggets (core)', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic nuggets (detail)', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
  ],
  design_opportunities: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic nuggets (core)', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic nuggets (detail)', source_hint: 'Run session summaries first' },
    { key: 'validated_themes', required: false, label: 'Validated themes', source_hint: 'Run affinity mapping first' },
    { key: 'personas', required: false, label: 'Personas', source_hint: 'Run persona generation first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder constraints', source_hint: 'Run stakeholder synthesis first' },
  ],
  service_blueprint: [
    { key: 'atomic_nugget_core', required: true, label: 'Atomic nuggets (core)', source_hint: 'Run session summaries first' },
    { key: 'atomic_nugget_detail', required: true, label: 'Atomic nuggets (detail)', source_hint: 'Run session summaries first' },
    { key: 'backstage_observations', required: false, label: 'Backstage observations', source_hint: 'Run stakeholder synthesis first' },
    { key: 'system_failure_modes', required: false, label: 'System failure modes', source_hint: 'Run stakeholder synthesis first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder constraints', source_hint: 'Run stakeholder synthesis first' },
  ],

  // Planning modals
  research_brief: [
    { key: 'discovered_barriers', required: false, label: 'Discovered barriers', source_hint: 'Run /qori-discover (desk research) first' },
    { key: 'knowledge_gaps', required: false, label: 'Knowledge gaps', source_hint: 'Run /qori-discover (desk research) first' },
    { key: 'stakeholder_constraints', required: false, label: 'Stakeholder constraints', source_hint: 'Run /qori-discover (stakeholder) first' },
    { key: 'stakeholder_priorities', required: false, label: 'Stakeholder priorities', source_hint: 'Run /qori-discover (stakeholder) first' },
  ],
  research_plan: [
    { key: 'research_objectives', required: true, label: 'Research objectives', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: true, label: 'Research questions', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: true, label: 'Methodology', source_hint: 'Create research brief first' },
    { key: 'target_barriers', required: true, label: 'Target barriers', source_hint: 'Create research brief first' },
    { key: 'participant_criteria', required: true, label: 'Participant criteria', source_hint: 'Create research brief first' },
    { key: 'participant_approach', required: false, label: 'Participant approach', source_hint: 'Create research brief first' },
    { key: 'timeline_preference', required: false, label: 'Timeline', source_hint: 'Create research brief first' },
    { key: 'budget', required: false, label: 'Budget', source_hint: 'Create research brief first' },
    { key: 'decision_deadline', required: false, label: 'Decision deadline', source_hint: 'Create research brief first' },
  ],
  discussion_guide: [
    { key: 'research_objectives', required: true, label: 'Research objectives', source_hint: 'Create research brief first' },
    { key: 'research_questions', required: true, label: 'Research questions', source_hint: 'Create research brief first' },
    { key: 'methodology_selection', required: true, label: 'Methodology', source_hint: 'Create research brief first' },
    { key: 'target_barriers', required: true, label: 'Target barriers', source_hint: 'Create research brief first' },
    { key: 'participant_criteria', required: false, label: 'Participant criteria', source_hint: 'Create research brief first' },
  ],
  stakeholder_interview_guide: [
    { key: 'discovered_barriers', required: false, label: 'Discovered barriers', source_hint: 'Run desk research first' },
    { key: 'knowledge_gaps', required: false, label: 'Knowledge gaps', source_hint: 'Run desk research first' },
  ],
};

/**
 * Build cascade readiness from study variables for a given template.
 */
function buildCascadeReadiness(studyVars: StudyVars, templateKey: string): CascadeData | null {
  const consumes = TEMPLATE_CONSUMES[templateKey];
  if (!consumes) return null;

  const available: AvailableVariable[] = [];
  const missing: MissingVariable[] = [];

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
function buildCascadeBlocks(cascadeData: CascadeData | null) {
  if (!cascadeData) return [];

  const blocks: Record<string, unknown>[] = [
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

export { buildCascadeReadiness, buildCascadeBlocks, TEMPLATE_CONSUMES };

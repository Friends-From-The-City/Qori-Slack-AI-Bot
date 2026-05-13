/**
 * Factory for upstream brief variables — the cascade data that
 * research_plan.yaml consumes from a completed research brief.
 *
 * Field names match what readUpstreamVariables() returns after
 * flattening with the upstream_ prefix.
 */
function makeBriefUpstream(overrides = {}) {
  return {
    research_objectives: {
      value: [
        { id: 'OBJ-001', objective: 'Understand veteran navigation patterns' },
        { id: 'OBJ-002', objective: 'Identify accessibility barriers in mobile interface' },
      ],
      source: { template: 'research_brief', version: 'v6.0', date: '2026-05-01' },
    },
    research_questions: {
      value: [
        { id: 'RQ-001', question: 'How do veterans locate the prescription refill feature?', priority: 'Primary' },
        { id: 'RQ-002', question: 'What workarounds do veterans use when navigation fails?', priority: 'Secondary' },
      ],
      source: { template: 'research_brief', version: 'v6.0', date: '2026-05-01' },
    },
    methodology_selection: {
      value: 'Usability Testing',
      source: { template: 'research_brief', version: 'v6.0', date: '2026-05-01' },
    },
    target_barriers: {
      value: [
        { id: 'TB-001', barrier: 'Veterans cannot locate prescription refill interface' },
        { id: 'TB-002', barrier: 'Notification delays prevent timely awareness of refill status' },
      ],
      source: { template: 'research_brief', version: 'v6.0', date: '2026-05-01' },
    },
    participant_criteria: {
      value: 'Veterans aged 55+ who use VA mobile app at least monthly',
      source: { template: 'research_brief', version: 'v6.0', date: '2026-05-01' },
    },
    ...overrides,
  };
}

/**
 * The input values a plan handler would pass to processYamlTemplate.
 * Matches the data assembly in planHandler.js v7.0:
 * - Raw numbers for compensation (not formatted strings)
 * - Arrays for Handlebars iteration (objectives, questions, barriers)
 * - Calculated timeline phases
 * - Counts for cascade summary
 */
function makePlanInputs(overrides = {}) {
  return {
    // Pass-through identifiers
    selected_study: 'test-study',
    project_title: 'Test Study',
    lead_researcher: 'Test Researcher',
    recruitment_sources: 'Existing VA panel',
    operational_risks: 'Participant no-shows during summer months',

    // Compensation (mechanical — raw values, template formats)
    per_participant_compensation: 80,
    parsed_budget_amount: 800,
    target_participants: 10,

    // Timeline (mechanical — calculated by handler)
    start_date: '2026-06-01',
    timeline_preference: 'standard',
    timeline_phases: [
      { phase: 'Planning and stakeholder alignment', dates: 'Jun 1 – Jun 3, 2026', duration: '3 days' },
      { phase: 'Recruitment', dates: 'Jun 4 – Jun 10, 2026', duration: '7 days' },
      { phase: 'Fieldwork (sessions)', dates: 'Jun 11 – Jun 15, 2026', duration: '5 days' },
      { phase: 'Analysis', dates: 'Jun 16 – Jun 16, 2026', duration: '1 day' },
      { phase: 'Reporting', dates: 'Jun 17 – Jun 17, 2026', duration: '1 day' },
    ],

    // Upstream arrays for Handlebars iteration
    objectives: [
      { id: 'OBJ-001', objective: 'Understand veteran navigation patterns' },
      { id: 'OBJ-002', objective: 'Identify accessibility barriers in mobile interface' },
    ],
    research_questions: [
      { id: 'RQ-001', question: 'How do veterans locate the prescription refill feature?', priority: 'Primary' },
      { id: 'RQ-002', question: 'What workarounds do veterans use when navigation fails?', priority: 'Secondary' },
    ],
    target_barriers: [
      { id: 'TB-001', barrier: 'Veterans cannot locate prescription refill interface' },
      { id: 'TB-002', barrier: 'Notification delays prevent timely awareness of refill status' },
    ],
    methodology: 'Usability Testing',

    // Counts (mechanical)
    objectives_count: 2,
    research_questions_count: 2,
    target_barriers_count: 2,

    ...overrides,
  };
}

module.exports = { makeBriefUpstream, makePlanInputs };

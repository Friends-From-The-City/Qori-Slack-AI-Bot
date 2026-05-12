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
 * These are the direct modal inputs plus system-injected fields.
 */
function makePlanInputs(overrides = {}) {
  return {
    selected_study: 'test-study',
    project_title: 'Test Study',
    lead_researcher: 'Test Researcher',
    methodology: 'Usability Testing',
    participant_count: '10',
    start_date: '2026-06-01',
    timeline_preference: 'standard',
    note_taker: '',
    observer: '',
    recruitment_sources: 'Existing VA panel',
    operational_risks: 'Participant no-shows during summer months',
    per_participant_compensation: '$80 per participant (calculated from $800 ÷ 10 target participants)',
    ...overrides,
  };
}

module.exports = { makeBriefUpstream, makePlanInputs };

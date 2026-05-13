/**
 * Mock for helpers/langchain.js
 *
 * Stubs executeAiGenerationTasks to return predetermined text
 * per task_id. Default returns outputs matching the research_plan v7.0
 * multi-task structure.
 *
 * Usage in tests:
 *   const { mockExecuteAiTasks } = require('../__mocks__/langchain.mock');
 *   mockExecuteAiTasks.mockResolvedValueOnce({ summary: 'Custom output' });
 */
const DEFAULT_AI_RESPONSES = {
  // Prose tasks
  summary: 'This usability study will evaluate veteran navigation patterns with 10 participants using moderated testing sessions.',
  background: 'Veterans increasingly rely on mobile apps for healthcare access. Prior discovery research identified navigation barriers.',
  method_approach: 'Moderated usability testing sessions where participants complete realistic task scenarios designed to surface navigation barriers.',
  session_format_detail: 'Remote 60-minute sessions via Zoom with screen sharing. Accommodations available for assistive technology users.',
  data_collection_methods: 'Think-aloud protocol with screen recording, observer notes, and brief post-session interviews.',
  participant_composition_prose: '- Veterans aged 55+ who use VA mobile app at least monthly\n- Mix of urban and rural participants\n- At least 2 participants who use assistive technology',
  deliverables_narrative: '- **Session summaries** — Key observations per participant\n- **Affinity map** — Clustered findings across sessions\n- **Research readout** — Stakeholder-ready findings presentation\n\nAll artifacts will be stored in the study\'s research folder for ongoing reference.',
  // JSON tasks (returned as strings, parsed by yamlProcessor)
  risks: JSON.stringify([
    { risk: 'Participant no-shows during summer recruitment period', likelihood: 'Medium', mitigation: 'Over-recruit by 30% and offer flexible scheduling' },
    { risk: 'Assistive technology compatibility issues with testing platform', likelihood: 'Low', mitigation: 'Pre-test with screen reader before sessions begin' },
    { risk: 'Navigation barriers too subtle to observe in controlled setting', likelihood: 'Medium', mitigation: 'Include open-ended exploration tasks alongside directed scenarios' },
  ]),
  brief_operationalization: JSON.stringify([
    { commitment: 'Objectives', address: 'Plan objectives elaborate the brief\'s approved learning goals' },
    { commitment: 'Research questions', address: 'Session tasks designed to answer each approved question' },
    { commitment: 'Method', address: 'Usability Testing detailed in Method section' },
    { commitment: 'Participants', address: 'Recruitment criteria match brief\'s participant commitment' },
    { commitment: 'Target barriers', address: 'Task scenarios designed to test each barrier' },
    { commitment: 'Timeline', address: 'Phased schedule fits within brief\'s constraints' },
  ]),
};

const mockExecuteAiTasks = jest.fn().mockResolvedValue({ ...DEFAULT_AI_RESPONSES });

module.exports = {
  executeAiGenerationTasks: mockExecuteAiTasks,
  mockExecuteAiTasks,
  DEFAULT_AI_RESPONSES,
};

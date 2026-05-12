/**
 * Mock for helpers/langchain.js
 *
 * Stubs executeAiGenerationTasks to return predetermined text
 * per task_id. Default returns a generic placeholder so tests
 * don't crash if they forget to set a mock value.
 *
 * Usage in tests:
 *   const { mockExecuteAiTasks } = require('../__mocks__/langchain.mock');
 *   mockExecuteAiTasks.mockResolvedValueOnce({ plan_complete: 'Custom AI output' });
 */
const mockExecuteAiTasks = jest.fn().mockResolvedValue({
  plan_complete: '## Summary\n\nMock AI generated research plan content.\n\n## Objectives\n\n- Mock objective 1\n- Mock objective 2',
});

module.exports = {
  executeAiGenerationTasks: mockExecuteAiTasks,
  // Re-export the mock fn for direct test access
  mockExecuteAiTasks,
};

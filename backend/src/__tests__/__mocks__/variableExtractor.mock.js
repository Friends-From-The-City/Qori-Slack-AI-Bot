/**
 * Mock for helpers/variableExtractor.js
 *
 * Stubs extractVariables to resolve immediately with null (no extraction).
 * Tests that need to verify extraction behavior can override per test.
 */
const mockExtractVariables = jest.fn().mockResolvedValue(null);

module.exports = {
  extractVariables: mockExtractVariables,
  mockExtractVariables,
};

/**
 * Mock for helpers/studyVariables.js
 *
 * Stubs all Postgres-backed variable operations.
 * readUpstreamVariables returns empty by default — tests that need
 * upstream cascade data should call mockReadUpstream.mockResolvedValueOnce().
 *
 * Usage in tests:
 *   const { mockReadUpstream } = require('../__mocks__/studyVariables.mock');
 *   const { makeBriefUpstream } = require('../__fixtures__/brief.fixture');
 *   mockReadUpstream.mockResolvedValueOnce(makeBriefUpstream());
 */
const mockReadUpstream = jest.fn().mockResolvedValue({});
const mockReadStudyVars = jest.fn().mockResolvedValue({});
const mockWriteStudyVars = jest.fn().mockResolvedValue(undefined);
const mockMergeVars = jest.fn().mockImplementation(
  (existing, extracted) => ({ ...existing, ...extracted })
);
const mockReadDiscovery = jest.fn().mockResolvedValue({});
const mockWriteDiscovery = jest.fn().mockResolvedValue(undefined);
const mockMergeDiscovery = jest.fn().mockImplementation(
  (existing, extracted) => ({ ...existing, ...extracted })
);
const mockReadUpstreamDiscovery = jest.fn().mockResolvedValue({});

module.exports = {
  // Legacy (path-based) — kept for backward compatibility with existing tests
  readUpstreamVariables: mockReadUpstream,
  readStudyVariables: mockReadStudyVars,
  writeStudyVariables: mockWriteStudyVars,
  mergeVariables: mockMergeVars,
  readDiscoveryVariables: mockReadDiscovery,
  writeDiscoveryVariables: mockWriteDiscovery,
  mergeDiscoveryVariables: mockMergeDiscovery,
  readUpstreamDiscoveryVariables: mockReadUpstreamDiscovery,
  // Phase 2B FK-based APIs — new function names
  readUpstreamVariablesByContext: mockReadUpstream,
  readStudyVariablesByContext: mockReadStudyVars,
  writeStudyVariablesByContext: mockWriteStudyVars,
  mergeVariablesByContext: mockMergeVars,
  readDiscoveryVariablesByProject: mockReadDiscovery,
  writeDiscoveryVariablesByProject: mockWriteDiscovery,
  // Re-export for direct test access
  mockReadUpstream,
  mockReadStudyVars,
};

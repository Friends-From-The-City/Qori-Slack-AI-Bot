/**
 * Mock for helpers/github.js
 *
 * Stubs all GitHub operations so tests never make network calls.
 *
 * Usage in tests:
 *   const { mockCreateOrUpdate } = require('../__mocks__/github.mock');
 *   // Access the captured content:
 *   const writtenContent = mockCreateOrUpdate.mock.calls[0][1];
 */
const mockCreateOrUpdate = jest.fn().mockResolvedValue({
  path: 'studies/test-study/primary-research/01-planning/test-study-research-plan-2026-05-12.md',
  sha: 'abc123fake',
  url: 'https://github.com/test/repo/blob/main/test-plan.md',
});

const mockFetchFile = jest.fn().mockResolvedValue({
  name: 'mock-file.yaml',
  path: 'config/prompts/mock-file.yaml',
  content: '',
});

const mockFetchFileByPath = jest.fn().mockResolvedValue({ content: '' });

const mockReadFolders = jest.fn().mockResolvedValue([]);
const mockReadFolderContents = jest.fn().mockResolvedValue([]);

module.exports = {
  createOrUpdateFileOnGitHub: mockCreateOrUpdate,
  fetchFileFromRepo: mockFetchFile,
  fetchFileFromRepoByPath: mockFetchFileByPath,
  readFolders: mockReadFolders,
  readFolderContents: mockReadFolderContents,
  getConfigRepo: jest.fn().mockReturnValue('test-org/test-config'),
  YAML_TEMPLATE_PATH: 'config/prompts',
  // Re-export for direct test access
  mockCreateOrUpdate,
  mockFetchFile,
};

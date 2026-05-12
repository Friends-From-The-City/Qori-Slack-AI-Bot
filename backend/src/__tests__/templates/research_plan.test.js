/**
 * Reference tests for research_plan.yaml template rendering.
 *
 * These tests verify the processYamlTemplate pipeline produces
 * correct output given mock inputs. The LLM, GitHub, and Postgres
 * are fully mocked — no network calls.
 *
 * Pattern: read the real YAML from disk, call processYamlTemplate
 * with fixture data, assert on the rendered outputTemplate string.
 */
const fs = require('fs');
const path = require('path');

// Mock external dependencies BEFORE requiring the processor.
// Paths are relative to the module being mocked (helpers/).
jest.mock('../../helpers/langchain', () => require('../__mocks__/langchain.mock'));
jest.mock('../../helpers/github', () => require('../__mocks__/github.mock'));
jest.mock('../../helpers/studyVariables', () => require('../__mocks__/studyVariables.mock'));
jest.mock('../../helpers/variableExtractor', () => require('../__mocks__/variableExtractor.mock'));

const { processYamlTemplate } = require('../../helpers/yamlProcessor');
const { makePlanInputs, makeBriefUpstream } = require('../__fixtures__/brief.fixture');
const { mockReadUpstream } = require('../__mocks__/studyVariables.mock');

// Read the real YAML template from config/prompts/
const yamlPath = path.resolve(__dirname, '../../../../config/prompts/research_plan.yaml');
const rawYaml = fs.readFileSync(yamlPath, 'utf8');

describe('research_plan template', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: upstream variables available (plan consumes from brief)
    mockReadUpstream.mockResolvedValue(makeBriefUpstream());
  });

  test('renders without throwing given valid inputs', async () => {
    const inputs = makePlanInputs();

    const result = await processYamlTemplate(
      rawYaml,
      inputs,
      encodeURIComponent('studies/test-study'),  // baseFolderEncoded
      'primary-research',                         // extraFolder
      false,                                      // aiCheck
    );

    expect(result).toBeDefined();
    expect(result.outputTemplate).toBeTruthy();
    expect(typeof result.outputTemplate).toBe('string');
    // Should have written to GitHub
    expect(result.result).toBeDefined();
    expect(result.result.path).toBeTruthy();
  });

  test('renders lead_researcher into the output', async () => {
    const inputs = makePlanInputs({ lead_researcher: 'Dr. Specific Name' });

    const result = await processYamlTemplate(
      rawYaml,
      inputs,
      encodeURIComponent('studies/test-study'),
      'primary-research',
      false,
    );

    // lead_researcher appears in the output_template masthead via Handlebars:
    // **Researcher:** {{lead_researcher}}
    expect(result.outputTemplate).toContain('Dr. Specific Name');
  });

  test('renders project_title in the heading', async () => {
    const inputs = makePlanInputs({ project_title: 'Unique Title XYZ' });

    const result = await processYamlTemplate(
      rawYaml,
      inputs,
      encodeURIComponent('studies/test-study'),
      'primary-research',
      false,
    );

    // output_template line: # Research Plan: {{project_title}}
    expect(result.outputTemplate).toContain('# Research Plan: Unique Title XYZ');
  });

  test('includes AI-generated content in the output', async () => {
    const { mockExecuteAiTasks } = require('../__mocks__/langchain.mock');
    mockExecuteAiTasks.mockResolvedValueOnce({
      plan_complete: '## Summary\n\nThis is AI-generated plan content for test verification.',
    });

    const inputs = makePlanInputs();

    const result = await processYamlTemplate(
      rawYaml,
      inputs,
      encodeURIComponent('studies/test-study'),
      'primary-research',
      false,
    );

    expect(result.outputTemplate).toContain('This is AI-generated plan content for test verification.');
  });
});

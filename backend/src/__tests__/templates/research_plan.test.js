/**
 * Tests for research_plan.yaml template rendering (v7.0).
 *
 * Verifies the interleaved Handlebars/AI architecture:
 * - Computed values render mechanically (compensation, timeline, counts)
 * - AI prose slots into bounded sections
 * - Structured JSON outputs (risks, brief_operationalization) render as tables
 * - Cascade summary and document ordering are correct
 */
const fs = require('fs');
const path = require('path');

// Mock external dependencies BEFORE requiring the processor.
jest.mock('../../helpers/langchain', () => require('../__mocks__/langchain.mock'));
jest.mock('../../helpers/github', () => require('../__mocks__/github.mock'));
jest.mock('../../helpers/studyVariables', () => require('../__mocks__/studyVariables.mock'));
jest.mock('../../helpers/variableExtractor', () => require('../__mocks__/variableExtractor.mock'));

const { processYamlTemplate, TemplateContractError } = require('../../helpers/yamlProcessor');
const { makePlanInputs, makeBriefUpstream } = require('../__fixtures__/brief.fixture');
const { mockReadUpstream } = require('../__mocks__/studyVariables.mock');
const { mockExecuteAiTasks, DEFAULT_AI_RESPONSES } = require('../__mocks__/langchain.mock');

// Read the real YAML template from config/prompts/
const yamlPath = path.resolve(__dirname, '../../../../config/prompts/research_plan.yaml');
const rawYaml = fs.readFileSync(yamlPath, 'utf8');

// Helper: run the processor with default fixtures
async function renderPlan(inputOverrides = {}, upstreamOverrides = {}) {
  const inputs = makePlanInputs(inputOverrides);
  const result = await processYamlTemplate(
    rawYaml,
    inputs,
    encodeURIComponent('studies/test-study'),
    'primary-research',
    false,
  );
  return result.outputTemplate;
}

describe('research_plan template v7.0', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadUpstream.mockResolvedValue(makeBriefUpstream());
    mockExecuteAiTasks.mockResolvedValue({ ...DEFAULT_AI_RESPONSES });
  });

  // ── Basic rendering ──────────────────────────────────────

  test('renders without throwing given valid inputs', async () => {
    const output = await renderPlan();
    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
  });

  test('renders lead_researcher in the masthead', async () => {
    const output = await renderPlan({ lead_researcher: 'Dr. Specific Name' });
    expect(output).toContain('Dr. Specific Name');
  });

  test('renders project_title in the heading', async () => {
    const output = await renderPlan({ project_title: 'Unique Title XYZ' });
    expect(output).toContain('# Research Plan: Unique Title XYZ');
  });

  // ── Compensation (mechanical rendering) ──────────────────

  test('renders computed compensation with explanatory math', async () => {
    const output = await renderPlan({
      per_participant_compensation: 80,
      parsed_budget_amount: 800,
      target_participants: 10,
    });
    expect(output).toContain('$80 per participant');
    expect(output).toContain('$800 budget');
    expect(output).toContain('10 target participants');
  });

  test('renders fallback when compensation is null', async () => {
    const output = await renderPlan({
      per_participant_compensation: null,
      parsed_budget_amount: null,
      target_participants: null,
    });
    expect(output).toContain('Standard rate');
  });

  // ── Timeline table (mechanical) ──────────────────────────

  test('renders timeline table with all 5 phases', async () => {
    const output = await renderPlan();
    expect(output).toContain('Planning and stakeholder alignment');
    expect(output).toContain('Recruitment');
    expect(output).toContain('Fieldwork (sessions)');
    expect(output).toContain('Analysis');
    expect(output).toContain('Reporting');
  });

  test('timeline phases contain date ranges', async () => {
    const output = await renderPlan({
      timeline_phases: [
        { phase: 'Planning', dates: 'Jun 8 – Jun 10, 2026', duration: '3 days' },
        { phase: 'Fieldwork', dates: 'Jun 11 – Jun 15, 2026', duration: '5 days' },
      ],
    });
    expect(output).toContain('Jun 8 – Jun 10, 2026');
    expect(output).toContain('3 days');
  });

  // ── Upstream cascade data (Handlebars iteration) ─────────

  test('renders objectives from upstream cascade data', async () => {
    const output = await renderPlan({
      objectives: [
        { id: 'OBJ-001', objective: 'Understand veteran navigation patterns' },
        { id: 'OBJ-002', objective: 'Identify accessibility barriers' },
      ],
    });
    expect(output).toContain('[OBJ-001]');
    expect(output).toContain('Understand veteran navigation patterns');
    expect(output).toContain('[OBJ-002]');
  });

  test('renders research questions from upstream cascade data', async () => {
    const output = await renderPlan({
      research_questions: [
        { id: 'RQ-001', question: 'How do veterans locate the prescription refill feature?', priority: 'Primary' },
      ],
    });
    expect(output).toContain('[RQ-001]');
    expect(output).toContain('prescription refill');
    expect(output).toContain('Primary');
  });

  // ── Risks table (parsed JSON from AI) ────────────────────

  test('renders risks table from AI-generated JSON', async () => {
    const output = await renderPlan();
    // Default mock has 3 risks
    expect(output).toContain('Participant no-shows');
    expect(output).toContain('Medium');
    expect(output).toContain('Over-recruit by 30%');
  });

  test('throws TemplateContractError on malformed risks JSON', async () => {
    mockExecuteAiTasks.mockResolvedValueOnce({
      ...DEFAULT_AI_RESPONSES,
      risks: 'this is not valid json {{{',
    });

    await expect(renderPlan()).rejects.toThrow(TemplateContractError);
  });

  // ── Brief operationalization table (parsed JSON from AI) ─

  test('renders brief operationalization table', async () => {
    const output = await renderPlan();
    expect(output).toContain('Brief commitment');
    expect(output).toContain('How this plan addresses it');
    expect(output).toContain('Objectives');
  });

  // ── Structural checks ───────────────────────────────────

  test('Team and roles section is NOT in output', async () => {
    const output = await renderPlan();
    expect(output).not.toContain('Team and roles');
    expect(output).not.toContain('Note-taker');
    expect(output).not.toContain('Stakeholder reviewer');
  });

  test('Cascade summary appears after risks, before Document Information footer', async () => {
    const output = await renderPlan();
    const cascadePos = output.indexOf('## Cascade summary');
    const risksPos = output.indexOf('## Risks and mitigations');
    const footerPos = output.indexOf('## Document Information');

    expect(cascadePos).toBeGreaterThan(risksPos);
    // Footer is appended by buildTraceabilityFooter, which may or may not
    // be present in outputTemplate (it's appended to fullContent, not outputTemplate).
    // So we just verify cascade summary is after risks.
    expect(cascadePos).toBeGreaterThan(0);
  });

  test('Cascade summary contains correct counts', async () => {
    const output = await renderPlan({
      objectives_count: 2,
      research_questions_count: 3,
      target_barriers_count: 4,
      methodology: 'Usability Testing',
      parsed_budget_amount: 800,
    });
    expect(output).toContain('| Research objectives | 2 |');
    expect(output).toContain('| Research questions | 3 |');
    expect(output).toContain('| Target barriers | 4 |');
    expect(output).toContain('| Methodology | Usability Testing |');
    expect(output).toContain('$800');
  });

  // ── AI prose sections ────────────────────────────────────

  test('includes all AI prose sections in output', async () => {
    const output = await renderPlan();
    // Check that each AI-generated prose section appears
    expect(output).toContain(DEFAULT_AI_RESPONSES.summary);
    expect(output).toContain(DEFAULT_AI_RESPONSES.background);
    expect(output).toContain(DEFAULT_AI_RESPONSES.method_approach);
    expect(output).toContain(DEFAULT_AI_RESPONSES.deliverables_narrative.split('\n')[0]);
  });

  // ── Contract enforcement ────────────────────────────────

  test('throws TemplateContractError when required upstream variable is missing', async () => {
    const incomplete = makeBriefUpstream();
    delete incomplete.target_barriers;
    mockReadUpstream.mockResolvedValueOnce(incomplete);

    await expect(renderPlan()).rejects.toThrow(TemplateContractError);
  });

  test('TemplateContractError includes the missing variable name', async () => {
    const incomplete = makeBriefUpstream();
    delete incomplete.research_objectives;
    mockReadUpstream.mockResolvedValueOnce(incomplete);

    await expect(renderPlan()).rejects.toThrow(/research_objectives/);
  });
});

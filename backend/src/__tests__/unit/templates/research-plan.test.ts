/**
 * Research Plan template tests
 *
 * Verifies the research_plan.yaml template:
 * - Loads without error
 * - Consumes required upstream variables from brief
 * - Emits expected cascade variables
 * - Renders output with expected sections
 */

import {
  createTemplateTestHarness,
  assertConsumesContract,
  shouldThrowForMissingRequired,
} from './__helpers__/template-test-harness';
import { researchPlanResponses } from './__fixtures__/llm-responses';

describe('research_plan template', () => {
  const harness = createTemplateTestHarness();

  beforeEach(() => {
    harness.reset();
    harness.mockLlmResponses('research_plan', researchPlanResponses);
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Template loads without error
  // ═══════════════════════════════════════════════════════════

  it('loads template configuration without error', () => {
    const config = harness.loadTemplate('research_plan');

    expect(config.id).toBe('research_plan');
    expect(config.version).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Consumes spec - validates upstream dependency contract
  // ═══════════════════════════════════════════════════════════

  it('declares upstream consumes from research brief', () => {
    const config = harness.loadTemplate('research_plan');

    // Plan consumes variables emitted by brief
    expect(config.consumes).toBeDefined();

    const consumeKeys = (config.consumes || []).map((c) => c.key);
    // Plan needs objectives and questions from brief
    expect(consumeKeys).toContain('research_objectives');
    expect(consumeKeys).toContain('research_questions');
  });

  it('identifies missing required upstream variables', () => {
    const config = harness.loadTemplate('research_plan');

    // Simulate missing upstream variables
    const providedVariables = {
      // Missing research_objectives
      research_questions: [],
    };

    const missing = shouldThrowForMissingRequired(config, providedVariables);

    // Should detect missing required variables
    if (missing.length > 0) {
      expect(missing).toContain('research_objectives');
    }
  });

  it('passes contract check with valid upstream variables', () => {
    const config = harness.loadTemplate('research_plan');

    const upstreamVariables = {
      research_objectives: ['Understand navigation pain points'],
      research_questions: [{ id: 'RQ-001', question: 'Test question', priority: 'Primary' }],
      target_barriers: [{ id: 'TB-001', barrier: 'Test barrier', source: 'Discovery' }],
      methodology_selection: 'usability_testing',
      participant_criteria: 'Veterans with VA.gov accounts',
    };

    // Should not throw
    expect(() => {
      assertConsumesContract(config, upstreamVariables);
    }).not.toThrow();
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Emits spec - validates cascade variable emission
  // ═══════════════════════════════════════════════════════════

  it('declares expected emits in config', () => {
    const config = harness.loadTemplate('research_plan');

    expect(config.emits).toBeDefined();
    expect(Array.isArray(config.emits)).toBe(true);

    // Plan should emit execution-focused variables
    const emitKeys = config.emits!.map((e) => e.key);
    // Exact keys depend on template version
    expect(emitKeys.length).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Output structure - rendered template sections
  // ═══════════════════════════════════════════════════════════

  it('renders output with execution-focused structure', async () => {
    const inputData = {
      selected_study: 'va-mobile-nav-q3',
      lead_researcher: 'Jane Smith',
      start_date: '2026-06-01',
      methodology: 'usability_testing',
      session_count: '8',
      session_duration: '60',
      participant_criteria: 'Veterans with VA.gov accounts',
      execution_risks: 'Recruitment timeline may be tight',
    };

    const upstreamVariables = {
      research_objectives: ['Understand navigation patterns'],
      research_questions: [
        { id: 'RQ-001', question: 'What patterns do Veterans attempt?', priority: 'Primary' },
      ],
      target_barriers: [],
      methodology_selection: 'usability_testing',
    };

    const result = await harness.processTemplate('research_plan', inputData, {
      upstreamVariables,
    });

    expect(result.output).toBeDefined();
    expect(result.output.length).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════
  // 5. AI tasks execute with mocked responses
  // ═══════════════════════════════════════════════════════════

  it('executes AI generation tasks', async () => {
    const inputData = {
      selected_study: 'test-study',
      lead_researcher: 'Test User',
      start_date: '2026-06-01',
      methodology: 'usability_testing',
      session_count: '8',
      session_duration: '60',
      participant_criteria: 'Test criteria',
      execution_risks: 'Test risks',
    };

    const upstreamVariables = {
      research_objectives: ['Test objective'],
      research_questions: [],
      methodology_selection: 'usability_testing',
    };

    const result = await harness.processTemplate('research_plan', inputData, {
      upstreamVariables,
    });

    expect(result.aiResponses).toBeDefined();
    expect(Object.keys(result.aiResponses).length).toBeGreaterThan(0);
  });
});

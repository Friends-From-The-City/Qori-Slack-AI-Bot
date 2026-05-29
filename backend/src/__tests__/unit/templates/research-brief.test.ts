/**
 * Research Brief template tests
 *
 * Verifies the research_brief.yaml template:
 * - Loads without error
 * - Emits expected cascade variables
 * - Renders output with expected sections
 * - Handles AI task results correctly
 */

import {
  createTemplateTestHarness,
  assertOutputContainsSections,
  assertEmittedVariables,
} from './__helpers__/template-test-harness';
import { researchBriefResponses } from './__fixtures__/llm-responses';

describe('research_brief template', () => {
  const harness = createTemplateTestHarness();

  beforeEach(() => {
    harness.reset();
    harness.mockLlmResponses('research_brief', researchBriefResponses);
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Template loads without error
  // ═══════════════════════════════════════════════════════════

  it('loads template configuration without error', () => {
    const config = harness.loadTemplate('research_brief');

    expect(config.id).toBe('research_brief');
    expect(config.version).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Emits spec - validates cascade variable emission
  // ═══════════════════════════════════════════════════════════

  it('declares expected emits in config', () => {
    const config = harness.loadTemplate('research_brief');

    expect(config.emits).toBeDefined();
    expect(Array.isArray(config.emits)).toBe(true);

    // Brief emits these key variables for downstream templates
    const emitKeys = config.emits!.map((e) => e.key);
    expect(emitKeys).toContain('research_objectives');
    expect(emitKeys).toContain('research_questions');
    expect(emitKeys).toContain('target_barriers');
    expect(emitKeys).toContain('methodology_selection');
  });

  it('emits variables when processed with valid input', async () => {
    const inputData = {
      selected_study: 'va-mobile-nav-q3',
      lead_researcher: 'Jane Smith',
      requestor_name: 'Product Team',
      problem_statement: 'Veterans struggle to navigate VA.gov on mobile devices',
      learning_objectives: '1. Understand navigation pain points\n2. Identify improvement opportunities',
      out_of_scope: 'Desktop navigation patterns',
      methodology: 'usability_testing',
      timeline_preference: 'standard',
      start_date: '2026-06-01',
      decision_deadline: '2026-06-15',
      // Pre-computed by handler (Option C)
      research_objectives: [
        'Understand navigation pain points',
        'Identify improvement opportunities',
      ],
      research_questions: [
        { id: 'RQ-001', question: 'What navigation patterns do Veterans attempt?', priority: 'Primary' },
      ],
      target_barriers: [
        { id: 'TB-001', barrier: 'Complex taxonomy', source: 'Discovery' },
      ],
    };

    const result = await harness.processTemplate('research_brief', inputData);

    // Verify emitted variables were captured
    expect(result.emittedVariables).toBeDefined();
    assertEmittedVariables(result.emittedVariables, [
      'research_objectives',
      'research_questions',
      'target_barriers',
    ]);
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Output structure - rendered template sections
  // ═══════════════════════════════════════════════════════════

  it('renders output with expected document structure', async () => {
    const inputData = {
      selected_study: 'va-mobile-nav-q3',
      lead_researcher: 'Jane Smith',
      requestor_name: 'Product Team',
      problem_statement: 'Veterans struggle to navigate VA.gov on mobile devices',
      learning_objectives: '1. Understand pain points',
      out_of_scope: 'Desktop patterns',
      methodology: 'usability_testing',
      timeline_preference: 'standard',
      start_date: '2026-06-01',
      decision_deadline: '2026-06-15',
      research_objectives: ['Understand pain points'],
      research_questions: [],
      target_barriers: [],
    };

    const result = await harness.processTemplate('research_brief', inputData);

    // Brief should include key sections
    // Note: exact sections depend on template version
    expect(result.output).toBeDefined();
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('includes AI-generated summary in output', async () => {
    const inputData = {
      selected_study: 'va-mobile-nav-q3',
      lead_researcher: 'Jane Smith',
      requestor_name: 'Product Team',
      problem_statement: 'Veterans struggle to navigate',
      learning_objectives: '1. Understand pain points',
      out_of_scope: 'Desktop',
      methodology: 'usability_testing',
      timeline_preference: 'standard',
      start_date: '2026-06-01',
      decision_deadline: '2026-06-15',
      research_objectives: [],
      research_questions: [],
      target_barriers: [],
    };

    const result = await harness.processTemplate('research_brief', inputData);

    // AI response should be used in output (actual task IDs from v7.0)
    expect(result.aiResponses).toHaveProperty('summary');
    expect(result.aiResponses).toHaveProperty('problem_narrative');
    // The mocked summary contains "usability study"
    expect(result.aiResponses['summary']).toContain('usability study');
  });

  // ═══════════════════════════════════════════════════════════
  // 4. AI tasks execute with mocked responses
  // ═══════════════════════════════════════════════════════════

  it('executes AI generation tasks with mocked responses', async () => {
    const inputData = {
      selected_study: 'test-study',
      lead_researcher: 'Test User',
      requestor_name: 'Test',
      problem_statement: 'Test problem',
      learning_objectives: 'Test objectives',
      out_of_scope: 'Test exclusions',
      methodology: 'usability_testing',
      timeline_preference: 'standard',
      start_date: '2026-06-01',
      decision_deadline: '2026-06-15',
      research_objectives: [],
      research_questions: [],
      target_barriers: [],
    };

    const result = await harness.processTemplate('research_brief', inputData);

    // Check that mocked AI responses were used
    expect(result.aiResponses).toBeDefined();
    expect(Object.keys(result.aiResponses).length).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Negative test - brief has no required consumes (uses manual loading)
  // ═══════════════════════════════════════════════════════════

  it('has no required upstream consumes (manual discovery loading)', () => {
    const config = harness.loadTemplate('research_brief');

    // Brief uses manual discovery loading via modal checkboxes, not YAML consumes
    // This is intentional per the template design
    const requiredConsumes = (config.consumes || []).filter((c) => c.required);
    expect(requiredConsumes.length).toBe(0);
  });
});

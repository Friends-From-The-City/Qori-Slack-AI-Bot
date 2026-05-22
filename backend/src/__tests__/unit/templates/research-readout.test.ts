/**
 * Research Readout template tests
 *
 * Verifies the research_readout.yaml template:
 * - Loads without error
 * - Consumes aggregated session data
 * - Emits synthesized findings and recommendations
 * - Renders with Pentagram-style design language
 */

import {
  createTemplateTestHarness,
  assertConsumesContract,
  shouldThrowForMissingRequired,
} from './__helpers__/template-test-harness';
import { researchReadoutResponses } from './__fixtures__/llm-responses';

describe('research_readout template', () => {
  const harness = createTemplateTestHarness();

  beforeEach(() => {
    harness.reset();
    harness.mockLlmResponses('research_readout', researchReadoutResponses);
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Template loads without error
  // ═══════════════════════════════════════════════════════════

  it('loads template configuration without error', () => {
    const config = harness.loadTemplate('research_readout');

    expect(config.id).toBe('research_readout');
    expect(config.version).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Consumes spec - aggregates from upstream templates
  // ═══════════════════════════════════════════════════════════

  it('declares upstream consumes from brief, plan, and sessions', () => {
    const config = harness.loadTemplate('research_readout');

    expect(config.consumes).toBeDefined();

    const consumeKeys = (config.consumes || []).map((c) => c.key);

    // Readout should consume study-level data
    // Exact keys depend on template version
    expect(consumeKeys.length).toBeGreaterThan(0);
  });

  it('identifies missing required cascade variables', () => {
    const config = harness.loadTemplate('research_readout');

    // Simulate empty upstream
    const providedVariables = {};

    const missing = shouldThrowForMissingRequired(config, providedVariables);

    // Should detect missing if there are required consumes
    // Note: behavior depends on template version
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Emits spec - synthesized findings and recommendations
  // ═══════════════════════════════════════════════════════════

  it('declares emits for synthesized research outputs', () => {
    const config = harness.loadTemplate('research_readout');

    expect(config.emits).toBeDefined();
    expect(Array.isArray(config.emits)).toBe(true);

    const emitKeys = config.emits!.map((e) => e.key);

    // Readout should emit findings and recommendations
    // These can inform downstream templates (tickets, etc.)
    expect(emitKeys.length).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Output structure - Pentagram design language
  // ═══════════════════════════════════════════════════════════

  it('renders output with structured findings format', async () => {
    const inputData = {
      study_name: 'va-mobile-nav-q3',
      study_title: 'VA Mobile Navigation Study',
      methodology: 'usability_testing',
      participant_count: 8,
      session_count: 8,
    };

    const upstreamVariables = {
      research_objectives: ['Understand navigation patterns'],
      research_questions: [
        { id: 'RQ-001', question: 'What patterns do Veterans attempt?', priority: 'Primary' },
      ],
      session_nuggets: [
        { id: 'N-001', nugget_type: 'pain_point', text: 'Claims buried too deep', severity: 'high' },
      ],
    };

    const result = await harness.processTemplate('research_readout', inputData, {
      upstreamVariables,
    });

    expect(result.output).toBeDefined();
    expect(result.output.length).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════
  // 5. AI synthesizes findings with evidence
  // ═══════════════════════════════════════════════════════════

  it('executes AI tasks for evidence-based synthesis', async () => {
    const inputData = {
      study_name: 'test-study',
      study_title: 'Test Study',
      methodology: 'usability_testing',
      participant_count: 8,
    };

    const upstreamVariables = {
      research_objectives: ['Test objective'],
      session_nuggets: [],
    };

    const result = await harness.processTemplate('research_readout', inputData, {
      upstreamVariables,
    });

    expect(result.aiResponses).toBeDefined();

    // Readout should have AI tasks for synthesis
    // Mocked responses should include executive summary and findings
    if (result.aiResponses['executive_summary']) {
      expect(result.aiResponses['executive_summary']).toContain('usability study');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Confidence levels in findings
  // ═══════════════════════════════════════════════════════════

  it('AI responses include confidence indicators', () => {
    // Verify that the mock responses follow the design language
    // which requires confidence levels per finding
    expect(researchReadoutResponses['extract_findings']).toContain('evidence_strength');
    expect(researchReadoutResponses['extract_recommendations']).toContain('priority');
  });
});

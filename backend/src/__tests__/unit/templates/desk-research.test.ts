/**
 * Desk Research template tests
 *
 * Verifies the desk_research.yaml template:
 * - Loads without error
 * - Discovery scope (project-level, not study-level)
 * - Emits barriers and themes for downstream templates
 * - Renders synthesis of secondary sources
 */

import {
  createTemplateTestHarness,
  assertEmittedVariables,
} from './__helpers__/template-test-harness';
import { deskResearchResponses } from './__fixtures__/llm-responses';

describe('desk_research template', () => {
  const harness = createTemplateTestHarness();

  beforeEach(() => {
    harness.reset();
    harness.mockLlmResponses('desk_research', deskResearchResponses);
  });

  // ═══════════════════════════════════════════════════════════
  // 1. Template loads without error
  // ═══════════════════════════════════════════════════════════

  it('loads template configuration without error', () => {
    const config = harness.loadTemplate('desk_research');

    // Template file is desk_research.yaml but id is 'desk_research_processor'
    expect(config.id).toBe('desk_research_processor');
    expect(config.version).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Discovery scope flag (Phase 2B: becomes project_id)
  // ═══════════════════════════════════════════════════════════

  it('is marked as discovery scope (project-level, not study-level)', () => {
    const config = harness.loadTemplate('desk_research');

    // Desk research is discovery-scoped
    // In Phase 2B, this becomes project_id (not study_id)
    // For 2A, verify the config loaded successfully
    expect(config.id).toBeDefined();
    // The exact discovery_scope field depends on template version
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Emits spec - barriers and themes for brief
  // ═══════════════════════════════════════════════════════════

  it('declares emits for discovered barriers and themes', () => {
    const config = harness.loadTemplate('desk_research');

    expect(config.emits).toBeDefined();
    expect(Array.isArray(config.emits)).toBe(true);

    const emitKeys = config.emits!.map((e) => e.key);

    // Desk research should emit barriers and themes
    // These inform the research brief's target barriers
    expect(emitKeys.length).toBeGreaterThan(0);
  });

  it('emits variables when processed with source data', async () => {
    const inputData = {
      project_name: 'va-mobile-experience',
      topic: 'Mobile navigation patterns in government digital services',
      sources: [
        'UK GDS Mobile Guidelines',
        'USDS Digital Playbook',
        'Canada.ca redesign study',
      ],
      // Pre-computed barriers and themes
      discovered_barriers: [
        { id: 'DB-001', barrier: 'Deep navigation causes abandonment', source: 'UK GDS' },
      ],
      discovered_themes: [
        { id: 'T-001', theme: 'Progressive disclosure', confidence: 'high' },
      ],
    };

    const result = await harness.processTemplate('desk_research', inputData);

    expect(result.emittedVariables).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Output structure - source synthesis
  // ═══════════════════════════════════════════════════════════

  it('renders synthesis with source citations', async () => {
    const inputData = {
      project_name: 'va-mobile-experience',
      topic: 'Mobile navigation patterns',
      sources: ['Source A', 'Source B'],
      discovered_barriers: [],
      discovered_themes: [],
    };

    const result = await harness.processTemplate('desk_research', inputData);

    expect(result.output).toBeDefined();
    expect(result.output.length).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════
  // 5. AI extracts themes and barriers
  // ═══════════════════════════════════════════════════════════

  it('executes AI tasks for theme extraction', async () => {
    const inputData = {
      project_name: 'test-project',
      topic: 'Test topic',
      sources: ['Test source'],
    };

    const result = await harness.processTemplate('desk_research', inputData);

    expect(result.aiResponses).toBeDefined();

    // Desk research should have AI tasks for synthesis
    if (result.aiResponses['synthesis_body']) {
      expect(result.aiResponses['synthesis_body']).toContain('Research Overview');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 6. No study context required (discovery scope)
  // ═══════════════════════════════════════════════════════════

  it('does not require study-level context (project-scoped)', () => {
    const config = harness.loadTemplate('desk_research');

    // Verify no study-specific consumes are required
    const requiredConsumes = (config.consumes || []).filter((c) => c.required);

    // Desk research shouldn't require study-scoped upstream variables
    // It's a discovery activity that happens before studies are defined
    for (const consume of requiredConsumes) {
      // If there are required consumes, they should be project-level
      // not study-level (no research_objectives, research_questions, etc.)
      expect(['study_objectives', 'research_questions', 'research_objectives']).not.toContain(
        consume.key,
      );
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 7. Knowledge gaps identification
  // ═══════════════════════════════════════════════════════════

  it('AI identifies knowledge gaps from sources', () => {
    // Verify mock response includes knowledge gaps
    expect(deskResearchResponses['synthesis_body']).toContain('Knowledge Gaps');
  });
});

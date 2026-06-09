/**
 * barrierCoverageDerivation.ts — Layer 3 derivation logic
 *
 * Computes barrier coverage state (full/partial/none) based on the chosen
 * research method and each barrier's categories. Generates traceable
 * out-of-scope suggestions and vague participant composition hints.
 *
 * SINGLE SOURCE OF TRUTH: Loads method-coverage-map.yaml at runtime.
 * No hardcoded coverage data in this file.
 *
 * DESIGN RULES (Lapedra, 2026-06-09):
 * - Full: all barrier categories covered by method → in scope
 * - Partial: some covered → in scope, but flag uncovered dimensions
 * - None: no overlap → out-of-scope suggestion with traceable reason
 * - 'other' category → always manual review
 * - 'custom' method → always manual review
 * - 'mixed_methods' without components → manual review
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { load as yamlLoad } from 'js-yaml';

// ─── Types ───────────────────────────────────────────────────────

export type BarrierCategory =
  | 'ia'
  | 'accessibility'
  | 'performance'
  | 'content'
  | 'task-flow'
  | 'cognitive'
  | 'other';

export type CoverageState = 'full' | 'partial' | 'none' | 'manual_review';

export interface DiscoveredBarrier {
  id: string;
  title: string;
  summary?: string;
  barrier_categories: BarrierCategory[];
  source_document?: string;
  [key: string]: unknown;
}

export interface BarrierCoverageResult {
  barrierId: string;
  barrierTitle: string;
  barrierCategories: BarrierCategory[];
  coverageState: CoverageState;
  coveredCategories: BarrierCategory[];
  uncoveredCategories: BarrierCategory[];
  reason: string;
  displayText: string;
}

export interface CoverageDerivationResult {
  method: string;
  methodLabel: string;
  barriers: BarrierCoverageResult[];
  inScope: BarrierCoverageResult[];
  outOfScope: BarrierCoverageResult[];
  manualReview: BarrierCoverageResult[];
  participantHints: string[];
}

interface MethodConfig {
  label: string;
  covers: BarrierCategory[];
  does_not_cover?: BarrierCategory[];
  manual_review_required?: boolean;
  requires_component_specification?: boolean;
  manual_review_until_specified?: boolean;
}

interface CoverageMapConfig {
  schema_version: string;
  methods: Record<string, MethodConfig>;
  barrier_categories: Record<string, { manual_review_required?: boolean }>;
}

// ─── Config loading ──────────────────────────────────────────────

let cachedConfig: CoverageMapConfig | null = null;

/**
 * Load method-coverage-map.yaml at runtime.
 * Single source of truth — no hardcoded coverage data.
 */
function loadCoverageConfig(): CoverageMapConfig {
  if (cachedConfig) return cachedConfig;

  // Path from dist/helpers/ to config/ (which is at /app/config/ in Docker)
  const configPath = join(__dirname, '../../../config/method-coverage-map.yaml');

  try {
    console.log(`📊 Layer 3: Loading coverage config from ${configPath}`);
    const raw = readFileSync(configPath, 'utf8');
    cachedConfig = yamlLoad(raw) as CoverageMapConfig;
    console.log(`📊 Layer 3: Loaded ${Object.keys(cachedConfig.methods || {}).length} methods from coverage config`);
    return cachedConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Layer 3: Failed to load coverage config from ${configPath}: ${message}`);
    // Return a minimal fallback config to prevent crashes
    return {
      schema_version: '1.0',
      methods: {},
      barrier_categories: {},
    };
  }
}

/**
 * Clear cached config (for testing).
 */
export function clearCoverageConfigCache(): void {
  cachedConfig = null;
}

// ─── Coverage computation ────────────────────────────────────────

/**
 * Compute coverage state for a single barrier against a method.
 */
function computeBarrierCoverage(
  barrier: DiscoveredBarrier,
  methodKey: string,
  config: CoverageMapConfig
): BarrierCoverageResult {
  const barrierCategories = barrier.barrier_categories || [];
  const method = config.methods[methodKey];

  // Manual review triggers
  if (!method) {
    return {
      barrierId: barrier.id,
      barrierTitle: barrier.title,
      barrierCategories,
      coverageState: 'manual_review',
      coveredCategories: [],
      uncoveredCategories: barrierCategories,
      reason: `Unknown method '${methodKey}' — cannot compute coverage`,
      displayText: `⚠ Manual review required — unknown method`,
    };
  }

  if (method.manual_review_required) {
    return {
      barrierId: barrier.id,
      barrierTitle: barrier.title,
      barrierCategories,
      coverageState: 'manual_review',
      coveredCategories: [],
      uncoveredCategories: barrierCategories,
      reason: `Custom method cannot be pre-mapped — researcher determines scope`,
      displayText: `⚠ Manual review required — custom method specified`,
    };
  }

  if (method.requires_component_specification && method.manual_review_until_specified) {
    return {
      barrierId: barrier.id,
      barrierTitle: barrier.title,
      barrierCategories,
      coverageState: 'manual_review',
      coveredCategories: [],
      uncoveredCategories: barrierCategories,
      reason: `Mixed methods coverage depends on component methods — specify to calculate`,
      displayText: `⚠ Manual review required — specify component methods`,
    };
  }

  // Check for 'other' category
  if (barrierCategories.includes('other')) {
    return {
      barrierId: barrier.id,
      barrierTitle: barrier.title,
      barrierCategories,
      coverageState: 'manual_review',
      coveredCategories: [],
      uncoveredCategories: barrierCategories,
      reason: `Barrier tagged 'other' — no research method covers this category`,
      displayText: `⚠ Manual review required — barrier tagged 'other'`,
    };
  }

  // Compute coverage
  const methodCovers = new Set(method.covers || []);
  const covered: BarrierCategory[] = [];
  const uncovered: BarrierCategory[] = [];

  for (const cat of barrierCategories) {
    if (methodCovers.has(cat)) {
      covered.push(cat);
    } else {
      uncovered.push(cat);
    }
  }

  // Determine state
  let coverageState: CoverageState;
  let reason: string;
  let displayText: string;

  if (uncovered.length === 0 && covered.length > 0) {
    // Full coverage
    coverageState = 'full';
    reason = `All barrier categories [${covered.join(', ')}] are covered by ${method.label}`;
    displayText = `✓ Covered by ${method.label}`;
  } else if (covered.length > 0 && uncovered.length > 0) {
    // Partial coverage
    coverageState = 'partial';
    reason = `${method.label} addresses [${covered.join(', ')}] but not [${uncovered.join(', ')}]`;
    displayText = `◐ Partially covered — ${method.label} addresses ${covered.join(', ')} but not ${uncovered.join(', ')}`;
  } else {
    // No coverage
    coverageState = 'none';
    reason = `${method.label} does not validate any of [${barrierCategories.join(', ')}]`;
    displayText = `○ Not covered by ${method.label} — suggest out-of-scope`;
  }

  return {
    barrierId: barrier.id,
    barrierTitle: barrier.title,
    barrierCategories,
    coverageState,
    coveredCategories: covered,
    uncoveredCategories: uncovered,
    reason,
    displayText,
  };
}

// ─── Main derivation ─────────────────────────────────────────────

/**
 * Derive barrier coverage for all discovered barriers against the chosen method.
 *
 * @param barriers - Array of discovered barriers with barrier_categories
 * @param methodKey - The method value (e.g., 'usability_testing', 'custom')
 * @returns Coverage results with in-scope, out-of-scope, and manual-review lists
 */
export function deriveBarrierCoverage(
  barriers: DiscoveredBarrier[],
  methodKey: string
): CoverageDerivationResult {
  const config = loadCoverageConfig();
  const method = config.methods[methodKey];
  const methodLabel = method?.label || methodKey;

  const results: BarrierCoverageResult[] = barriers.map((b) =>
    computeBarrierCoverage(b, methodKey, config)
  );

  // Categorize results
  const inScope = results.filter(
    (r) => r.coverageState === 'full' || r.coverageState === 'partial'
  );
  const outOfScope = results.filter((r) => r.coverageState === 'none');
  const manualReview = results.filter((r) => r.coverageState === 'manual_review');

  // Generate participant hints (OUTPUT B: vague category-level only)
  const participantHints = deriveParticipantHints(barriers, config);

  return {
    method: methodKey,
    methodLabel,
    barriers: results,
    inScope,
    outOfScope,
    manualReview,
    participantHints,
  };
}

// ─── Participant hints (OUTPUT B) ────────────────────────────────

/**
 * Derive VAGUE category-level participant composition hints from barriers.
 *
 * CRITICAL: Never invent numbers, org names, or specifics.
 * Output is a SUGGESTION the researcher confirms/edits.
 */
function deriveParticipantHints(
  barriers: DiscoveredBarrier[],
  _config: CoverageMapConfig
): string[] {
  const hints: string[] = [];
  const categorySet = new Set<BarrierCategory>();

  // Collect all categories across barriers
  for (const barrier of barriers) {
    for (const cat of barrier.barrier_categories || []) {
      categorySet.add(cat);
    }
  }

  // Generate category-level hints (NO specifics, NO numbers, NO org names)
  if (categorySet.has('accessibility')) {
    hints.push(
      'Discovery surfaced accessibility barriers; consider including participants who use assistive technology.'
    );
  }

  if (categorySet.has('cognitive')) {
    hints.push(
      'Discovery surfaced cognitive load barriers; consider including participants with varying tech proficiency levels.'
    );
  }

  if (categorySet.has('content')) {
    hints.push(
      'Discovery surfaced content comprehension barriers; consider including participants with varying reading levels.'
    );
  }

  if (categorySet.has('performance')) {
    hints.push(
      'Discovery surfaced performance barriers; note that participant testing may not reproduce real-world latency conditions.'
    );
  }

  // If no specific hints generated, return empty (honest-empty)
  return hints;
}

// ─── Out-of-scope reason formatting ──────────────────────────────

/**
 * Generate a traceable out-of-scope reason for a barrier.
 * Uses the template from method-coverage-map.yaml.
 */
export function formatOutOfScopeReason(result: BarrierCoverageResult, methodLabel: string): string {
  const config = loadCoverageConfig();
  const methodConfig = Object.values(config.methods).find((m) => m.label === methodLabel);
  const methodCovers = methodConfig?.covers?.join(', ') || 'none';

  return `"${result.barrierTitle}" is suggested out-of-scope because:
- Barrier categories: [${result.barrierCategories.join(', ')}]
- Method chosen: ${methodLabel}
- Method covers: [${methodCovers}]
- Gap: ${methodLabel} does not validate [${result.uncoveredCategories.join(', ')}]

To include this barrier, consider:
- Adding a complementary method that covers [${result.uncoveredCategories.join(', ')}]
- Using a custom method with manual scope determination`;
}

// ─── Integration helpers ─────────────────────────────────────────

/**
 * Format out-of-scope suggestions for brief pre-population.
 * Returns a bullet list suitable for the out_of_scope field.
 */
export function formatOutOfScopeSuggestions(
  outOfScope: BarrierCoverageResult[],
  methodLabel: string
): string {
  if (outOfScope.length === 0) return '';

  const lines = outOfScope.map((r) => {
    const uncovered = r.uncoveredCategories.join(', ');
    return `- ${r.barrierTitle} (${methodLabel} does not cover: ${uncovered})`;
  });

  return lines.join('\n');
}

/**
 * Format participant hints for brief pre-population.
 * Returns a bullet list suitable for the participant_approach field.
 */
export function formatParticipantHints(hints: string[]): string {
  if (hints.length === 0) return '';
  return hints.map((h) => `- ${h}`).join('\n');
}

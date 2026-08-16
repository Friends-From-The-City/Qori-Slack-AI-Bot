/**
 * Load Persisted Facts — reconstruct SurveyComputedFacts from canonical
 * evidence constructs stored during persistSurveyFoundation().
 *
 * After Redis deletion, the raw CSV is gone. Structured facts live in
 * evidence_constructs: survey_dataset_summary, field_distribution, cross_tab.
 *
 * This function loads those constructs and rebuilds a SurveyComputedFacts
 * object identical to what was originally computed (deterministic invariant).
 *
 * FAIL-CLOSED: If invariants are violated (duplicate semantic keys,
 * n_present > respondent_count, etc.), returns null with logged details.
 * The caller must NOT generate a synthesis artifact without valid facts.
 */

import type { SurveyComputedFacts, FieldStat, FieldStatSummary, CrossTab } from '../../types/survey';

interface EvidenceConstructRecord {
  construct_type: string;
  payload: Record<string, unknown> | null;
}

/**
 * Invariant violation — logged internally, researcher gets safe message.
 */
export class FactInvariantError extends Error {
  constructor(
    message: string,
    public readonly violations: string[],
  ) {
    super(message);
    this.name = 'FactInvariantError';
  }
}

/**
 * Reconstruct SurveyComputedFacts from persisted evidence constructs.
 *
 * @param constructs — evidence constructs for the survey source (source-scoped)
 * @returns SurveyComputedFacts or null if summary construct not found
 * @throws FactInvariantError if invariants are violated
 */
export function loadPersistedFacts(
  constructs: EvidenceConstructRecord[],
): SurveyComputedFacts | null {
  // Find the dataset summary — must be exactly one
  const summaries = constructs.filter(c => c.construct_type === 'survey_dataset_summary');
  if (summaries.length === 0) return null;

  const violations: string[] = [];

  if (summaries.length > 1) {
    violations.push(`Multiple dataset summaries found: ${summaries.length} (expected 1)`);
  }

  const summary = summaries[0];
  if (!summary.payload) {
    violations.push('Dataset summary has null payload');
    throw new FactInvariantError('Inconsistent survey evidence', violations);
  }

  const totalRespondents = summary.payload.total_respondents as number;
  const schemaSummary = (summary.payload.schema_summary as FieldStatSummary[]) ?? [];
  const nonresponseLimitation = (summary.payload.nonresponse_limitation as string) ?? '';
  const sourceContentHash = (summary.payload.source_content_hash as string) ?? '';

  if (!totalRespondents || totalRespondents <= 0) {
    violations.push(`Invalid respondent count: ${totalRespondents}`);
  }

  // Load field distributions — check for duplicates by fieldName
  const fieldRecords = constructs.filter(c => c.construct_type === 'field_distribution' && c.payload);
  const fieldStats: FieldStat[] = [];
  const seenFieldNames = new Set<string>();

  for (const rec of fieldRecords) {
    const stat = rec.payload as unknown as FieldStat;
    if (seenFieldNames.has(stat.fieldName)) {
      violations.push(`Duplicate field_distribution for: ${stat.fieldName}`);
      continue; // Don't include the duplicate
    }
    seenFieldNames.add(stat.fieldName);

    // Validate n_present and n_missing against respondent count
    if (totalRespondents > 0) {
      if (stat.nPresent > totalRespondents) {
        violations.push(`${stat.fieldName}: nPresent (${stat.nPresent}) > respondent_count (${totalRespondents})`);
      }
      if (stat.nMissing > totalRespondents) {
        violations.push(`${stat.fieldName}: nMissing (${stat.nMissing}) > respondent_count (${totalRespondents})`);
      }
      // Missingness reconciliation: nPresent + nMissing must equal respondent_count
      if (stat.nPresent + stat.nMissing !== totalRespondents) {
        violations.push(
          `${stat.fieldName}: nPresent (${stat.nPresent}) + nMissing (${stat.nMissing}) = ${stat.nPresent + stat.nMissing}, expected ${totalRespondents}`,
        );
      }
    }

    // Distribution count reconciliation: SUM(values) must equal nPresent
    if (stat.distribution) {
      const distSum = Object.values(stat.distribution).reduce((a, b) => a + b, 0);
      if (distSum !== stat.nPresent) {
        violations.push(
          `${stat.fieldName}: distribution sum (${distSum}) ≠ nPresent (${stat.nPresent})`,
        );
      }
    }

    fieldStats.push(stat);
  }

  // Load cross-tabs — check for duplicates by row+col identity
  const crossTabRecords = constructs.filter(c => c.construct_type === 'cross_tab' && c.payload);
  const crossTabs: CrossTab[] = [];
  const seenCrossTabs = new Set<string>();

  for (const rec of crossTabRecords) {
    const ct = rec.payload as unknown as CrossTab;
    const ctKey = `${ct.rowField}:${ct.colField}`;
    if (seenCrossTabs.has(ctKey)) {
      violations.push(`Duplicate cross_tab for: ${ctKey}`);
      continue;
    }
    seenCrossTabs.add(ctKey);

    // Validate cross-tab n <= respondent_count
    if (totalRespondents > 0 && ct.totalN > totalRespondents) {
      violations.push(`Cross-tab ${ctKey}: totalN (${ct.totalN}) > respondent_count (${totalRespondents})`);
    }

    // Cross-tab cell sum reconciliation: SUM(all cells) must equal totalN
    if (ct.cells) {
      let cellSum = 0;
      for (const rowValues of Object.values(ct.cells)) {
        for (const count of Object.values(rowValues)) {
          cellSum += count;
        }
      }
      if (cellSum !== ct.totalN) {
        violations.push(
          `Cross-tab ${ctKey}: cell sum (${cellSum}) ≠ totalN (${ct.totalN})`,
        );
      }
    }

    crossTabs.push(ct);
  }

  // Fail closed if any violations detected
  if (violations.length > 0) {
    console.error('❌ Fact invariant violations detected:', violations);
    throw new FactInvariantError(
      'Qori found inconsistent survey evidence and couldn\'t create the summary.',
      violations,
    );
  }

  return {
    sourceContentHash,
    totalRespondents,
    schemaSummary,
    fieldStats,
    crossTabs,
    nonresponseLimitation,
  };
}

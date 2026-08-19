/**
 * Survey Qualitative Aggregation Service
 *
 * Deterministic aggregation from accepted coding assignments.
 * All counting is code-computed — the model NEVER counts.
 *
 * Reporting unit: unique respondent (not text entries).
 * Denominator: eligible respondents with ≥1 privacy-approved entry in the coding run.
 * A respondent with multiple entries assigned to the same grouping counts ONCE.
 * A respondent belonging to multiple groupings counts once in EACH.
 * Totals across groupings may exceed the denominator.
 *
 * Recurring pattern: ≥2 unique respondents.
 * Individual observation: 1 unique respondent.
 */

export interface QualitativeAggregation {
  /** Total eligible respondents in the coding run. */
  eligibleRespondentCount: number;
  /** Recurring patterns (≥2 respondents). */
  recurringPatterns: PatternStat[];
  /** Individual observations (1 respondent). */
  individualObservations: PatternStat[];
}

export interface PatternStat {
  codePublicId: string;
  codeLabel: string;
  codeDefinition: string;
  /** Count of unique respondents with accepted assignments for this code. */
  uniqueRespondentCount: number;
  /** Total accepted entry-level assignments (may exceed respondent count). */
  acceptedEntryCount: number;
  /** Denominator for percentage. */
  denominator: number;
  denominatorBasis: 'eligible_respondents';
  /** Formatted percentage string. */
  percentage: string;
  /** Display format: "3 of 10 (30%)" or "30% (6 of 20)" */
  displayFrequency: string;
}

interface AssignmentRow {
  respondent_key: string;
  code_public_id: string;
  code_label: string;
  code_definition: string;
}

/**
 * Compute deterministic qualitative aggregation from accepted assignments.
 *
 * @param acceptedAssignments — rows with respondent_key, code info
 * @param eligibleRespondentKeys — all respondents eligible for this coding run
 * @returns QualitativeAggregation with recurring patterns + individual observations
 */
export function computeQualitativeAggregation(
  acceptedAssignments: AssignmentRow[],
  eligibleRespondentKeys: Set<string>,
): QualitativeAggregation {
  const eligibleRespondentCount = eligibleRespondentKeys.size;

  // Group by code, count unique respondents
  const codeMap = new Map<string, {
    publicId: string;
    label: string;
    definition: string;
    respondents: Set<string>;
    entryCount: number;
  }>();

  for (const row of acceptedAssignments) {
    let entry = codeMap.get(row.code_public_id);
    if (!entry) {
      entry = {
        publicId: row.code_public_id,
        label: row.code_label,
        definition: row.code_definition,
        respondents: new Set(),
        entryCount: 0,
      };
      codeMap.set(row.code_public_id, entry);
    }
    entry.respondents.add(row.respondent_key);
    entry.entryCount++;
  }

  // Build pattern stats
  const allPatterns: PatternStat[] = [];
  for (const [, entry] of codeMap) {
    const n = entry.respondents.size;
    const pct = eligibleRespondentCount > 0
      ? Math.round((n / eligibleRespondentCount) * 100)
      : 0;

    allPatterns.push({
      codePublicId: entry.publicId,
      codeLabel: entry.label,
      codeDefinition: entry.definition,
      uniqueRespondentCount: n,
      acceptedEntryCount: entry.entryCount,
      denominator: eligibleRespondentCount,
      denominatorBasis: 'eligible_respondents',
      percentage: `${pct}%`,
      displayFrequency: formatFrequency(n, eligibleRespondentCount, pct),
    });
  }

  // Sort by respondent count desc, then alphabetical
  allPatterns.sort((a, b) => {
    if (b.uniqueRespondentCount !== a.uniqueRespondentCount) {
      return b.uniqueRespondentCount - a.uniqueRespondentCount;
    }
    return a.codeLabel.localeCompare(b.codeLabel);
  });

  // Split: ≥2 = recurring, 1 = individual
  const recurringPatterns = allPatterns.filter(p => p.uniqueRespondentCount >= 2);
  const individualObservations = allPatterns.filter(p => p.uniqueRespondentCount === 1);

  return {
    eligibleRespondentCount,
    recurringPatterns,
    individualObservations,
  };
}

/**
 * Format frequency display using the small-n convention:
 * n < 20: count first — "3 of 10 (30%)"
 * n >= 20: percentage first — "30% (6 of 20)"
 */
function formatFrequency(count: number, total: number, pct: number): string {
  if (total < 20) {
    return `${count} of ${total} (${pct}%)`;
  }
  return `${pct}% (${count} of ${total})`;
}

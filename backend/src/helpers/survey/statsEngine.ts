/**
 * Deterministic Statistics Engine — survey computed facts.
 *
 * All operations are pure functions on arrays. No randomness, no LLM.
 * Same input always produces identical output (ADR 0028).
 *
 * Ordinal median requires confirmed_role='ordinal' AND order_metadata.
 * Without confirmed order, ordinal fields are treated as nominal.
 */

import type {
  ParsedSurvey,
  ConfirmedField,
  SurveyComputedFacts,
  FieldStatSummary,
  FieldStat,
  CrossTab,
} from '../../types/survey';

/**
 * Compute deterministic survey statistics from parsed data + confirmed schema.
 *
 * @param survey — parsed CSV data
 * @param confirmedFields — researcher-confirmed field schema
 * @param sourceContentHash — for provenance
 * @returns SurveyComputedFacts — deterministic, reproducible
 */
export function computeSurveyFacts(
  survey: ParsedSurvey,
  confirmedFields: ConfirmedField[],
  sourceContentHash: string,
): SurveyComputedFacts {
  const totalRespondents = survey.rowCount;
  const fieldMap = new Map(confirmedFields.map(f => [f.fieldName, f]));

  const schemaSummary: FieldStatSummary[] = [];
  const fieldStats: FieldStat[] = [];

  for (const field of confirmedFields) {
    if (field.confirmedRole === 'id' || field.confirmedRole === 'timestamp') {
      continue; // No statistics for ID or timestamp fields
    }

    const values = survey.rows.map(r => r.values[field.fieldName] ?? '');
    const nonEmpty = values.filter(v => v.trim() !== '');
    const nPresent = nonEmpty.length;
    const nMissing = totalRespondents - nPresent;

    schemaSummary.push({
      fieldName: field.fieldName,
      role: field.confirmedRole,
      nPresent,
      nMissing,
    });

    const stat = computeFieldStat(field, values, totalRespondents);
    fieldStats.push(stat);
  }

  const crossTabs = computeCrossTabs(survey, confirmedFields);

  return {
    sourceContentHash,
    totalRespondents,
    schemaSummary,
    fieldStats,
    crossTabs,
    nonresponseLimitation:
      'Bare CSV cannot distinguish semantic missingness. Empty cells are reported as empty_or_missing without distinction between not_asked, no_response, or intentional blank.',
  };
}

function computeFieldStat(
  field: ConfirmedField,
  values: string[],
  totalRespondents: number,
): FieldStat {
  const nonEmpty = values.filter(v => v.trim() !== '');
  const nPresent = nonEmpty.length;
  const nMissing = totalRespondents - nPresent;

  const base: FieldStat = {
    fieldName: field.fieldName,
    role: field.confirmedRole,
    totalRespondents,
    nPresent,
    nMissing,
    distribution: null,
    median: null,
    nValidNumeric: null,
    nInvalidNumeric: null,
  };

  switch (field.confirmedRole) {
    case 'ordinal':
      return computeOrdinalStat(base, field, nonEmpty);
    case 'nominal':
      return computeNominalStat(base, nonEmpty);
    case 'continuous':
      return computeContinuousStat(base, nonEmpty);
    case 'multi_select':
      return computeNominalStat(base, nonEmpty); // Treat as nominal for now
    case 'open_text':
      return base; // No statistics for open text in Slice 1
    default:
      return base;
  }
}

function computeOrdinalStat(
  base: FieldStat,
  field: ConfirmedField,
  nonEmpty: string[],
): FieldStat {
  const distribution = computeDistribution(nonEmpty);
  base.distribution = distribution;

  // Median requires confirmed category order
  if (field.orderMetadata && field.orderMetadata.length > 0) {
    base.median = computeOrdinalMedian(nonEmpty, field.orderMetadata);
  }
  // Without orderMetadata, no median — field treated as nominal for statistics

  return base;
}

function computeNominalStat(base: FieldStat, nonEmpty: string[]): FieldStat {
  base.distribution = computeDistribution(nonEmpty);
  return base;
}

function computeContinuousStat(base: FieldStat, nonEmpty: string[]): FieldStat {
  const parsed = nonEmpty.map(v => ({ raw: v, num: parseFloat(v.trim()) }));
  const valid = parsed.filter(p => !isNaN(p.num));
  const invalid = parsed.filter(p => isNaN(p.num));

  base.nValidNumeric = valid.length;
  base.nInvalidNumeric = invalid.length;

  if (valid.length > 0) {
    const sorted = valid.map(v => v.num).sort((a, b) => a - b);
    base.median = computeNumericMedian(sorted);
  }

  // Distribution for continuous: not computed (would require binning)
  return base;
}

function computeDistribution(values: string[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const v of values) {
    const key = v.trim();
    if (key === '') continue;
    dist[key] = (dist[key] ?? 0) + 1;
  }
  return dist;
}

/**
 * Compute median for ordinal field using researcher-confirmed category order.
 * Returns the category value at the median position.
 */
function computeOrdinalMedian(values: string[], categoryOrder: string[]): string | null {
  // Map values to their ordinal position
  const orderMap = new Map(categoryOrder.map((cat, i) => [cat.toLowerCase().trim(), i]));

  const indexed = values
    .map(v => orderMap.get(v.toLowerCase().trim()))
    .filter((i): i is number => i !== undefined);

  if (indexed.length === 0) return null;

  indexed.sort((a, b) => a - b);
  const midIdx = Math.floor(indexed.length / 2);

  if (indexed.length % 2 === 0) {
    // For ordinal, use lower of the two middle values
    const medianPosition = indexed[midIdx - 1];
    return categoryOrder[medianPosition] ?? null;
  }

  return categoryOrder[indexed[midIdx]] ?? null;
}

/**
 * Compute numeric median for continuous fields.
 * Expects a pre-sorted array of numbers.
 */
function computeNumericMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Compute structured cross-tabs for applicable field pairs.
 *
 * Only computes cross-tabs between fields where both have confirmed
 * roles that produce distributions (ordinal or nominal).
 *
 * Identifies completion/status and difficulty/satisfaction fields
 * by name pattern matching against confirmed fields.
 */
function computeCrossTabs(
  survey: ParsedSurvey,
  confirmedFields: ConfirmedField[],
): CrossTab[] {
  const crossTabs: CrossTab[] = [];

  const distributable = confirmedFields.filter(f =>
    f.confirmedRole === 'ordinal' || f.confirmedRole === 'nominal'
  );

  // Find completion/status fields and rating fields by name pattern
  const completionFields = distributable.filter(f =>
    /complet|status|finish/i.test(f.fieldName)
  );
  const ratingFields = distributable.filter(f =>
    /difficult|satisf|rating|experience/i.test(f.fieldName)
  );

  for (const rowField of completionFields) {
    for (const colField of ratingFields) {
      if (rowField.fieldName === colField.fieldName) continue;
      const ct = computeSingleCrossTab(survey, rowField.fieldName, colField.fieldName);
      crossTabs.push(ct);
    }
  }

  return crossTabs;
}

function computeSingleCrossTab(
  survey: ParsedSurvey,
  rowFieldName: string,
  colFieldName: string,
): CrossTab {
  const cells: Record<string, Record<string, number>> = {};
  let totalN = 0;

  for (const row of survey.rows) {
    const rowVal = row.values[rowFieldName]?.trim() ?? '';
    const colVal = row.values[colFieldName]?.trim() ?? '';

    if (rowVal === '' || colVal === '') continue;

    if (!cells[rowVal]) cells[rowVal] = {};
    cells[rowVal][colVal] = (cells[rowVal][colVal] ?? 0) + 1;
    totalN++;
  }

  return { rowField: rowFieldName, colField: colFieldName, cells, totalN };
}

/**
 * Extract open-text content from parsed survey for LLM interpretation.
 *
 * Formats open-text fields with respondent display labels for the
 * template's qualitative analysis section.
 */
export function extractOpenTextContent(
  survey: ParsedSurvey,
  confirmedFields: ConfirmedField[],
  displayLabels: string[],
): string {
  const openTextFields = confirmedFields.filter(f => f.confirmedRole === 'open_text');

  if (openTextFields.length === 0) {
    return '(No open-text fields identified in survey schema.)';
  }

  const sections: string[] = [];

  for (const field of openTextFields) {
    const entries: string[] = [];
    for (let i = 0; i < survey.rows.length; i++) {
      const value = survey.rows[i].values[field.fieldName]?.trim() ?? '';
      if (value) {
        entries.push(`${displayLabels[i]}: "${value}"`);
      }
    }

    if (entries.length > 0) {
      sections.push(
        `### ${field.fieldName}\n\n${entries.join('\n')}`
      );
    }
  }

  return sections.length > 0
    ? sections.join('\n\n---\n\n')
    : '(All open-text fields are empty.)';
}

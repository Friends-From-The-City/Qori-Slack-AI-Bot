/**
 * Facts Formatter — format SurveyComputedFacts for Handlebars template rendering.
 *
 * Converts distribution objects and cross-tab cells into Markdown table strings
 * so Handlebars `{{this.distribution}}` renders correctly (not [object Object]).
 *
 * Ordinal fields render categories in confirmed measurement order,
 * NOT sorted by frequency or alphabetically.
 *
 * All formatting is deterministic. Same input = same output.
 */

import type { SurveyComputedFacts, FieldStat, CrossTab, FieldStatSummary, ConfirmedField } from '../../types/survey';

export interface FormattedComputedFacts {
  sourceContentHash: string;
  totalRespondents: number;
  schemaSummary: string;
  fieldStats: FormattedFieldStat[];
  crossTabs: FormattedCrossTab[];
  nonresponseLimitation: string;
}

export interface FormattedFieldStat {
  fieldName: string;
  role: string;
  totalRespondents: number;
  nPresent: number;
  nMissing: number;
  distribution: string | null;
  median: string | number | null;
  nValidNumeric: number | null;
  nInvalidNumeric: number | null;
}

export interface FormattedCrossTab {
  rowField: string;
  colField: string;
  cells: string;
  totalN: number;
}

/**
 * Format computed facts for template rendering.
 * Converts objects to Markdown table strings.
 *
 * @param facts — raw computed facts
 * @param confirmedFields — researcher-confirmed schema (for ordinal order)
 */
export function formatComputedFacts(
  facts: SurveyComputedFacts,
  confirmedFields: ConfirmedField[],
): FormattedComputedFacts {
  const fieldMap = new Map(confirmedFields.map(f => [f.fieldName, f]));

  return {
    sourceContentHash: facts.sourceContentHash,
    totalRespondents: facts.totalRespondents,
    schemaSummary: formatSchemaSummary(facts.schemaSummary),
    fieldStats: facts.fieldStats.map(s => formatFieldStat(s, fieldMap.get(s.fieldName))),
    crossTabs: facts.crossTabs.map(ct => formatCrossTab(ct, fieldMap)),
    nonresponseLimitation: facts.nonresponseLimitation,
  };
}

function formatSchemaSummary(summary: FieldStatSummary[]): string {
  if (summary.length === 0) return 'No fields';
  const roleCounts = new Map<string, number>();
  for (const s of summary) {
    roleCounts.set(s.role, (roleCounts.get(s.role) ?? 0) + 1);
  }
  return [...roleCounts.entries()]
    .map(([role, count]) => `${count} ${role}`)
    .join(', ');
}

function formatFieldStat(
  stat: FieldStat,
  confirmedField?: ConfirmedField,
): FormattedFieldStat {
  return {
    fieldName: stat.fieldName,
    role: stat.role,
    totalRespondents: stat.totalRespondents,
    nPresent: stat.nPresent,
    nMissing: stat.nMissing,
    distribution: stat.distribution
      ? formatDistribution(stat.distribution, confirmedField)
      : null,
    median: stat.median,
    nValidNumeric: stat.nValidNumeric,
    nInvalidNumeric: stat.nInvalidNumeric,
  };
}

/**
 * Format a distribution as a Markdown table.
 *
 * Ordinal fields: categories rendered in confirmed measurement order.
 * Nominal fields: sorted by count descending (deterministic tiebreak: alphabetical).
 */
function formatDistribution(
  dist: Record<string, number>,
  confirmedField?: ConfirmedField,
): string {
  let entries: [string, number][];

  if (confirmedField?.confirmedRole === 'ordinal' && confirmedField.orderMetadata) {
    // Render in confirmed measurement order
    entries = confirmedField.orderMetadata.map(cat => {
      // Case-insensitive match against distribution keys
      const matchKey = Object.keys(dist).find(k => k.toLowerCase() === cat.toLowerCase()) ?? cat;
      return [matchKey, dist[matchKey] ?? 0] as [string, number];
    });
    // Append any values not in order metadata (shouldn't happen with validation)
    const orderedLower = new Set(confirmedField.orderMetadata.map(c => c.toLowerCase()));
    for (const [key, count] of Object.entries(dist)) {
      if (!orderedLower.has(key.toLowerCase())) {
        entries.push([key, count]);
      }
    }
  } else {
    // Nominal: sort by count desc, then alphabetical for ties
    entries = Object.entries(dist).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }

  const lines = ['| Value | Count |', '|-------|------:|'];
  for (const [value, count] of entries) {
    lines.push(`| ${value} | ${count} |`);
  }
  return lines.join('\n');
}

/**
 * Format a cross-tab as a Markdown table.
 *
 * Row and column axes use confirmed ordinal order when available.
 * Falls back to alphabetical for nominal fields.
 */
function formatCrossTab(
  ct: CrossTab,
  fieldMap: Map<string, ConfirmedField>,
): FormattedCrossTab {
  const rowField = fieldMap.get(ct.rowField);
  const colField = fieldMap.get(ct.colField);

  // Determine row order
  const allRowValues = Object.keys(ct.cells);
  const rowValues = orderValues(allRowValues, rowField);

  // Determine column order
  const allColValues = new Set<string>();
  for (const row of allRowValues) {
    for (const col of Object.keys(ct.cells[row])) {
      allColValues.add(col);
    }
  }
  const cols = orderValues([...allColValues], colField);

  const header = `| | ${cols.join(' | ')} |`;
  const separator = `|---|${cols.map(() => '---:').join('|')}|`;
  const rows = rowValues.map(row => {
    const cells = cols.map(col => String(ct.cells[row]?.[col] ?? 0));
    return `| ${row} | ${cells.join(' | ')} |`;
  });

  return {
    rowField: ct.rowField,
    colField: ct.colField,
    cells: [header, separator, ...rows].join('\n'),
    totalN: ct.totalN,
  };
}

/**
 * Order values using confirmed ordinal order if available,
 * otherwise alphabetical.
 */
function orderValues(values: string[], field?: ConfirmedField): string[] {
  if (field?.confirmedRole === 'ordinal' && field.orderMetadata) {
    const orderMap = new Map(field.orderMetadata.map((c, i) => [c.toLowerCase(), i]));
    return [...values].sort((a, b) => {
      const ai = orderMap.get(a.toLowerCase()) ?? 999;
      const bi = orderMap.get(b.toLowerCase()) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
  }
  return [...values].sort();
}

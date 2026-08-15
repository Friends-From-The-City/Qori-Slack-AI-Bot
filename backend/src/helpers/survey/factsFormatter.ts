/**
 * Facts Formatter — format SurveyComputedFacts for Handlebars template rendering.
 *
 * Converts distribution objects and cross-tab cells into Markdown table strings
 * so Handlebars `{{this.distribution}}` renders correctly (not [object Object]).
 *
 * All formatting is deterministic. Same input = same output.
 */

import type { SurveyComputedFacts, FieldStat, CrossTab, FieldStatSummary } from '../../types/survey';

export interface FormattedComputedFacts {
  sourceContentHash: string;
  totalRespondents: number;
  schemaSummary: string;
  fieldStats: FormattedFieldStat[];
  crossTabs: FormattedCrossTab[];
  nonresponseLimitation: string;
}

interface FormattedFieldStat {
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

interface FormattedCrossTab {
  rowField: string;
  colField: string;
  cells: string;
  totalN: number;
}

/**
 * Format computed facts for template rendering.
 * Converts objects to Markdown table strings.
 */
export function formatComputedFacts(facts: SurveyComputedFacts): FormattedComputedFacts {
  return {
    sourceContentHash: facts.sourceContentHash,
    totalRespondents: facts.totalRespondents,
    schemaSummary: formatSchemaSummary(facts.schemaSummary),
    fieldStats: facts.fieldStats.map(formatFieldStat),
    crossTabs: facts.crossTabs.map(formatCrossTab),
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

function formatFieldStat(stat: FieldStat): FormattedFieldStat {
  return {
    fieldName: stat.fieldName,
    role: stat.role,
    totalRespondents: stat.totalRespondents,
    nPresent: stat.nPresent,
    nMissing: stat.nMissing,
    distribution: stat.distribution ? formatDistribution(stat.distribution) : null,
    median: stat.median,
    nValidNumeric: stat.nValidNumeric,
    nInvalidNumeric: stat.nInvalidNumeric,
  };
}

function formatDistribution(dist: Record<string, number>): string {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const lines = ['| Value | Count |', '|-------|------:|'];
  for (const [value, count] of entries) {
    lines.push(`| ${value} | ${count} |`);
  }
  return lines.join('\n');
}

function formatCrossTab(ct: CrossTab): FormattedCrossTab {
  const rowValues = Object.keys(ct.cells).sort();
  const colValues = new Set<string>();
  for (const row of rowValues) {
    for (const col of Object.keys(ct.cells[row])) {
      colValues.add(col);
    }
  }
  const cols = [...colValues].sort();

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

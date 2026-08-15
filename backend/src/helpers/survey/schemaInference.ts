/**
 * Schema Inference — heuristic field role detection for survey columns.
 *
 * No LLM. All inference is deterministic.
 *
 * Inference proposes candidate roles. Researchers must confirm via
 * the schema review modal before computation proceeds.
 *
 * Ordinal inference requires researcher confirmation + explicit
 * category order metadata before median computation is permitted.
 */

import type { ParsedSurvey, SurveyField, SurveyFieldRole } from '../../types/survey';

const LIKERT_LABELS = new Set([
  'strongly agree', 'agree', 'neutral', 'disagree', 'strongly disagree',
  'very satisfied', 'satisfied', 'dissatisfied', 'very dissatisfied',
  'very easy', 'easy', 'moderate', 'difficult', 'very difficult',
  'excellent', 'good', 'fair', 'poor', 'very poor',
  'always', 'often', 'sometimes', 'rarely', 'never',
  'very likely', 'likely', 'unlikely', 'very unlikely',
]);

const TIMESTAMP_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}/,                      // 2026-01-15
  /^\d{1,2}\/\d{1,2}\/\d{2,4}/,              // 1/15/2026
  /^\d{1,2}-\w{3}-\d{2,4}/,                  // 15-Jan-2026
  /^\w{3}\s+\d{1,2},?\s+\d{4}/,              // Jan 15, 2026
];

const ID_FIELD_NAMES = new Set([
  'response_id', 'respondent_id', 'id', 'response id', 'respondent id',
  'submission_id', 'entry_id', 'record_id', 'participant_id',
]);

const MAX_SAMPLE_VALUES = 5;

/**
 * Infer field roles for all columns in a parsed survey.
 * Returns one SurveyField per header, in header order.
 */
export function inferFieldSchema(survey: ParsedSurvey): SurveyField[] {
  return survey.headers.map(header => inferSingleField(header, survey));
}

function inferSingleField(fieldName: string, survey: ParsedSurvey): SurveyField {
  const values = survey.rows.map(r => r.values[fieldName] ?? '');
  const nonEmpty = values.filter(v => v.trim() !== '');
  const presentCount = nonEmpty.length;
  const missingCount = values.length - presentCount;
  const distinctValues = new Set(nonEmpty.map(v => v.toLowerCase().trim()));
  const distinctCount = distinctValues.size;

  const sampleValues = [...new Set(nonEmpty)]
    .slice(0, MAX_SAMPLE_VALUES);

  const role = classifyField(fieldName, nonEmpty, distinctCount, survey.rowCount);

  return {
    fieldName,
    inferredRole: role,
    sampleValues,
    distinctCount,
    presentCount,
    missingCount,
  };
}

function classifyField(
  fieldName: string,
  nonEmptyValues: string[],
  distinctCount: number,
  totalRows: number,
): SurveyFieldRole {
  if (nonEmptyValues.length === 0) return 'nominal'; // all empty — default

  const normalizedName = fieldName.toLowerCase().trim();

  // 1. ID field — by name pattern
  if (ID_FIELD_NAMES.has(normalizedName)) {
    return 'id';
  }

  // 2. Timestamp — by value pattern
  if (isTimestamp(nonEmptyValues)) {
    return 'timestamp';
  }

  // 3. Ordinal — Likert labels
  if (isLikertScale(nonEmptyValues)) {
    return 'ordinal';
  }

  // 4. Ordinal — small integer range (1-5, 1-7, 1-10)
  if (isSmallIntegerRange(nonEmptyValues)) {
    return 'ordinal';
  }

  // 5. Continuous — mostly numeric, not a small range
  if (isContinuous(nonEmptyValues)) {
    return 'continuous';
  }

  // 6. Multi-select — contains delimiters (semicolons or pipes)
  if (isMultiSelect(nonEmptyValues)) {
    return 'multi_select';
  }

  // 7. Open text — high cardinality or long responses
  if (isOpenText(nonEmptyValues, distinctCount, totalRows)) {
    return 'open_text';
  }

  // 8. Default — nominal (low-cardinality categorical)
  return 'nominal';
}

function isTimestamp(values: string[]): boolean {
  const sampleSize = Math.min(values.length, 20);
  const sample = values.slice(0, sampleSize);
  const matches = sample.filter(v =>
    TIMESTAMP_PATTERNS.some(p => p.test(v.trim()))
  );
  return matches.length >= sampleSize * 0.8;
}

function isLikertScale(values: string[]): boolean {
  const normalized = values.map(v => v.toLowerCase().trim());
  const matches = normalized.filter(v => LIKERT_LABELS.has(v));
  return matches.length >= values.length * 0.8;
}

function isSmallIntegerRange(values: string[]): boolean {
  const parsed = values.map(v => parseInt(v.trim(), 10));
  const valid = parsed.filter(n => !isNaN(n));
  if (valid.length < values.length * 0.8) return false;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min;

  // 1-5, 1-7, 1-10, 0-10 are typical Likert/ordinal ranges
  return min >= 0 && max <= 10 && range >= 2 && range <= 10;
}

function isContinuous(values: string[]): boolean {
  const parsed = values.map(v => parseFloat(v.trim()));
  const valid = parsed.filter(n => !isNaN(n));
  return valid.length >= values.length * 0.8;
}

function isMultiSelect(values: string[]): boolean {
  const withDelimiters = values.filter(v =>
    v.includes(';') || v.includes('|')
  );
  return withDelimiters.length >= values.length * 0.3;
}

function isOpenText(
  values: string[],
  distinctCount: number,
  totalRows: number,
): boolean {
  // High cardinality: most values are unique
  if (distinctCount > totalRows * 0.5) return true;

  // Long responses: average word count > 5
  const wordCounts = values.map(v => v.split(/\s+/).length);
  const avgWordCount = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  return avgWordCount > 5;
}

/**
 * Extract sorted unique values from a field, useful for ordinal
 * category order detection.
 */
export function getUniqueValues(
  survey: ParsedSurvey,
  fieldName: string,
): string[] {
  const values = survey.rows.map(r => r.values[fieldName]?.trim() ?? '');
  const nonEmpty = values.filter(v => v !== '');
  return [...new Set(nonEmpty)];
}

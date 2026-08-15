/**
 * CSV Parser — structured survey ingestion.
 *
 * Uses csv-parse/sync for deterministic parsing. Same input buffer
 * always produces identical output (ADR 0028).
 *
 * Handles: RFC-style quoted fields, commas inside quotes, embedded
 * newlines, escaped quotes, UTF-8 BOM, empty cells, malformed rows.
 */

import { parse } from 'csv-parse/sync';
import type { ParsedSurvey, SurveyRow } from '../../types/survey';

/** Errors specific to CSV parsing. */
export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Parse a CSV buffer into a ParsedSurvey.
 *
 * @param buffer — raw CSV file content (Buffer or string)
 * @param filename — source filename for metadata
 * @returns ParsedSurvey with headers, rows, and parse warnings
 * @throws CsvParseError on empty file, no headers, or fatal parse failure
 */
export function parseCsvBuffer(
  buffer: Buffer | string,
  filename: string,
): ParsedSurvey {
  let content = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');

  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new CsvParseError('CSV file is empty', filename);
  }

  const warnings: string[] = [];

  let records: string[][];
  try {
    records = parse(content, {
      bom: true,
      skip_empty_lines: false,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      columns: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CsvParseError(`Failed to parse CSV: ${message}`, filename);
  }

  if (records.length === 0) {
    throw new CsvParseError('CSV file contains no data', filename);
  }

  const rawHeaders = records[0];
  if (!rawHeaders || rawHeaders.length === 0) {
    throw new CsvParseError('CSV file has no header row', filename);
  }

  // Detect duplicate headers
  const headers: string[] = [];
  const headerCounts = new Map<string, number>();
  for (const h of rawHeaders) {
    const name = h.trim() || 'unnamed';
    const count = (headerCounts.get(name) ?? 0) + 1;
    headerCounts.set(name, count);
    if (count > 1) {
      const deduped = `${name}_${count}`;
      headers.push(deduped);
      warnings.push(`Duplicate header "${name}" renamed to "${deduped}"`);
    } else {
      headers.push(name);
    }
  }

  // Parse data rows
  const dataRecords = records.slice(1);

  if (dataRecords.length === 0) {
    throw new CsvParseError('CSV file contains headers but no data rows', filename);
  }

  const rows: SurveyRow[] = [];
  for (let i = 0; i < dataRecords.length; i++) {
    const record = dataRecords[i];

    // Skip completely empty rows
    if (record.every(cell => cell.trim() === '')) {
      continue;
    }

    // Warn on column count mismatch
    if (record.length !== headers.length) {
      warnings.push(
        `Row ${i + 2} has ${record.length} columns (expected ${headers.length})`,
      );
    }

    const values: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      values[headers[j]] = (record[j] ?? '').trim();
    }

    rows.push({ values, rowIndex: rows.length });
  }

  return {
    sourceFilename: filename,
    headers,
    rows,
    rowCount: rows.length,
    parseWarnings: warnings,
  };
}

/**
 * CSV Parser unit tests.
 *
 * Covers: normal CSV, quoted commas, quoted newlines, escaped quotes,
 * BOM, blank cells, duplicate headers, malformed rows, empty file,
 * header-only file.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsvBuffer, CsvParseError } from '../../../helpers/survey/csvParser';

const FIXTURES = join(__dirname, '../../__fixtures__/survey');

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe('csvParser', () => {
  it('parses a standard CSV with headers and data rows', () => {
    const result = parseCsvBuffer(fixture('standard.csv'), 'standard.csv');

    expect(result.headers).toEqual([
      'response_id', 'timestamp', 'overall_satisfaction',
      'difficulty_rating', 'completion_status', 'biggest_challenge',
      'additional_feedback',
    ]);
    expect(result.rowCount).toBe(10);
    expect(result.rows[0].values.response_id).toBe('R-101');
    expect(result.rows[0].values.overall_satisfaction).toBe('Satisfied');
    expect(result.rows[0].rowIndex).toBe(0);
    expect(result.parseWarnings).toHaveLength(0);
  });

  it('handles quoted commas inside values', () => {
    const csv = 'name,comment\nAlice,"Hello, world"\nBob,"One, two, three"';
    const result = parseCsvBuffer(csv, 'quoted-commas.csv');

    expect(result.rowCount).toBe(2);
    expect(result.rows[0].values.comment).toBe('Hello, world');
    expect(result.rows[1].values.comment).toBe('One, two, three');
  });

  it('handles quoted newlines inside values', () => {
    const result = parseCsvBuffer(fixture('quoted-multiline.csv'), 'quoted-multiline.csv');

    expect(result.rowCount).toBe(3);
    expect(result.rows[0].values.open_feedback).toContain('great experience');
    expect(result.rows[0].values.open_feedback).toContain('definitely use it again');
    expect(result.rows[1].values.open_feedback).toContain('Multiple issues');
  });

  it('handles escaped quotes', () => {
    const csv = 'id,text\n1,"She said ""hello"""\n2,"He said ""goodbye"""';
    const result = parseCsvBuffer(csv, 'escaped-quotes.csv');

    expect(result.rowCount).toBe(2);
    expect(result.rows[0].values.text).toBe('She said "hello"');
    expect(result.rows[1].values.text).toBe('He said "goodbye"');
  });

  it('handles UTF-8 BOM', () => {
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const csv = Buffer.concat([bom, Buffer.from('id,name\n1,Alice\n2,Bob')]);
    const result = parseCsvBuffer(csv, 'bom.csv');

    expect(result.headers[0]).toBe('id');
    expect(result.rowCount).toBe(2);
  });

  it('handles blank cells as empty strings', () => {
    const result = parseCsvBuffer(fixture('missing-values.csv'), 'missing-values.csv');

    expect(result.rowCount).toBe(5);
    // Row R-202 has empty satisfaction and completion_status
    expect(result.rows[1].values.overall_satisfaction).toBe('');
    expect(result.rows[1].values.completion_status).toBe('');
  });

  it('deduplicates duplicate headers with warning', () => {
    const csv = 'name,name,value\nAlice,Smith,100\nBob,Jones,200';
    const result = parseCsvBuffer(csv, 'dup-headers.csv');

    expect(result.headers).toEqual(['name', 'name_2', 'value']);
    expect(result.parseWarnings.length).toBeGreaterThan(0);
    expect(result.parseWarnings[0]).toContain('Duplicate header');
  });

  it('warns on malformed rows with column count mismatch', () => {
    const result = parseCsvBuffer(fixture('malformed.csv'), 'malformed.csv');

    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.parseWarnings.some(w => w.includes('columns'))).toBe(true);
  });

  it('throws CsvParseError on empty file', () => {
    expect(() => parseCsvBuffer('', 'empty.csv')).toThrow(CsvParseError);
    expect(() => parseCsvBuffer('   ', 'whitespace.csv')).toThrow(CsvParseError);
  });

  it('throws CsvParseError on header-only file', () => {
    expect(() => parseCsvBuffer('id,name,value', 'headers-only.csv')).toThrow(CsvParseError);
  });

  it('assigns sequential rowIndex starting from 0', () => {
    const result = parseCsvBuffer(fixture('standard.csv'), 'standard.csv');

    for (let i = 0; i < result.rows.length; i++) {
      expect(result.rows[i].rowIndex).toBe(i);
    }
  });

  it('skips completely empty rows', () => {
    const csv = 'id,val\n1,a\n,,\n2,b';
    const result = parseCsvBuffer(csv, 'with-empty-row.csv');
    expect(result.rowCount).toBe(2);
  });

  it('accepts string input in addition to Buffer', () => {
    const csv = 'id,name\n1,Test';
    const result = parseCsvBuffer(csv, 'string-input.csv');
    expect(result.rowCount).toBe(1);
  });
});

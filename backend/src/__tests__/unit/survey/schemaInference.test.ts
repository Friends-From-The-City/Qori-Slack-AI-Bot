/**
 * Schema Inference unit tests.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { inferFieldSchema } from '../../../helpers/survey/schemaInference';
import { parseCsvBuffer } from '../../../helpers/survey/csvParser';

const FIXTURES = join(__dirname, '../../__fixtures__/survey');

describe('schemaInference', () => {
  it('infers response_id as id field', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const fields = inferFieldSchema(survey);

    const idField = fields.find(f => f.fieldName === 'response_id');
    expect(idField).toBeDefined();
    expect(idField!.inferredRole).toBe('id');
  });

  it('infers timestamp field', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const fields = inferFieldSchema(survey);

    const tsField = fields.find(f => f.fieldName === 'timestamp');
    expect(tsField).toBeDefined();
    expect(tsField!.inferredRole).toBe('timestamp');
  });

  it('infers Likert-label fields as ordinal', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const fields = inferFieldSchema(survey);

    const satField = fields.find(f => f.fieldName === 'overall_satisfaction');
    expect(satField).toBeDefined();
    expect(satField!.inferredRole).toBe('ordinal');

    const diffField = fields.find(f => f.fieldName === 'difficulty_rating');
    expect(diffField).toBeDefined();
    expect(diffField!.inferredRole).toBe('ordinal');
  });

  it('infers small integer range as ordinal', () => {
    const csv = readFileSync(join(FIXTURES, 'ordinal-categories.csv'));
    const survey = parseCsvBuffer(csv, 'ordinal-categories.csv');
    const fields = inferFieldSchema(survey);

    const sat = fields.find(f => f.fieldName === 'satisfaction_1to5');
    expect(sat).toBeDefined();
    expect(sat!.inferredRole).toBe('ordinal');
  });

  it('infers open-text fields', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const fields = inferFieldSchema(survey);

    const challenge = fields.find(f => f.fieldName === 'biggest_challenge');
    expect(challenge).toBeDefined();
    expect(challenge!.inferredRole).toBe('open_text');
  });

  it('infers low-cardinality text as nominal', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const fields = inferFieldSchema(survey);

    const status = fields.find(f => f.fieldName === 'completion_status');
    expect(status).toBeDefined();
    expect(status!.inferredRole).toBe('nominal');
  });

  it('provides sample values for each field', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const fields = inferFieldSchema(survey);

    for (const field of fields) {
      expect(field.sampleValues).toBeDefined();
      expect(Array.isArray(field.sampleValues)).toBe(true);
      expect(field.sampleValues.length).toBeLessThanOrEqual(5);
    }
  });

  it('reports present and missing counts', () => {
    const csv = readFileSync(join(FIXTURES, 'missing-values.csv'));
    const survey = parseCsvBuffer(csv, 'missing-values.csv');
    const fields = inferFieldSchema(survey);

    const satField = fields.find(f => f.fieldName === 'overall_satisfaction');
    expect(satField).toBeDefined();
    expect(satField!.presentCount).toBe(3); // R-201, R-203, R-205 have values
    expect(satField!.missingCount).toBe(2); // R-202, R-204 are empty
  });

  it('returns one field per header in header order', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const fields = inferFieldSchema(survey);

    expect(fields.length).toBe(survey.headers.length);
    for (let i = 0; i < fields.length; i++) {
      expect(fields[i].fieldName).toBe(survey.headers[i]);
    }
  });

  it('infers department as nominal (low cardinality categorical)', () => {
    const csv = readFileSync(join(FIXTURES, 'ordinal-categories.csv'));
    const survey = parseCsvBuffer(csv, 'ordinal-categories.csv');
    const fields = inferFieldSchema(survey);

    const dept = fields.find(f => f.fieldName === 'department');
    expect(dept).toBeDefined();
    expect(dept!.inferredRole).toBe('nominal');
  });
});

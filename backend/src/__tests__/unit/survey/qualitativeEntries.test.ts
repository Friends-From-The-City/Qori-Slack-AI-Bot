/**
 * Qualitative Entry Writer unit tests.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsvBuffer } from '../../../helpers/survey/csvParser';
import { computeContentHash } from '../../../helpers/survey/sourceHash';
import { assignRespondentIdentities } from '../../../helpers/survey/respondentIdentity';
import { buildQualitativeEntries } from '../../../helpers/survey/qualitativeEntryWriter';
import type { ConfirmedField } from '../../../types/survey';

const FIXTURES = join(__dirname, '../../__fixtures__/survey');

const fields: ConfirmedField[] = [
  { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
  { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal', orderMetadata: null, isDemographic: false },
  { fieldName: 'biggest_challenge', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
  { fieldName: 'additional_feedback', confirmedRole: 'open_text', orderMetadata: null, isDemographic: false },
];

function buildEntries() {
  const csv = readFileSync(join(FIXTURES, 'standard.csv'));
  const survey = parseCsvBuffer(csv, 'standard.csv');
  const hash = computeContentHash(csv);
  const identities = assignRespondentIdentities(survey, fields, hash);
  return buildQualitativeEntries(survey, fields, identities, {
    evidenceSourceId: 1, projectId: 1, studyId: null,
  });
}

describe('buildQualitativeEntries', () => {
  it('creates one entry per respondent × open-text field', () => {
    const entries = buildEntries();
    // standard.csv has 10 rows, 2 open-text fields, some may be empty
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(20); // max 10 × 2
  });

  it('preserves declared respondent display ID', () => {
    const entries = buildEntries();
    // standard.csv has response_id field with R-101, R-102, etc.
    const firstEntry = entries.find(e => e.respondent_key === 'R-101');
    expect(firstEntry).toBeDefined();
    expect(firstEntry!.display_respondent_id).toBe('R-101');
  });

  it('assigns field display name in Title Case', () => {
    const entries = buildEntries();
    const challengeEntry = entries.find(e => e.field_name === 'biggest_challenge');
    expect(challengeEntry).toBeDefined();
    expect(challengeEntry!.field_display_name).toBe('Biggest Challenge');
  });

  it('all entries start as pii_status=pending', () => {
    const entries = buildEntries();
    for (const entry of entries) {
      expect(entry.pii_status).toBe('pending');
    }
  });

  it('entry_hash is deterministic for same text', () => {
    const entries1 = buildEntries();
    const entries2 = buildEntries();
    for (let i = 0; i < entries1.length; i++) {
      expect(entries1[i].entry_hash).toBe(entries2[i].entry_hash);
    }
  });

  it('skips empty open-text values', () => {
    const entries = buildEntries();
    for (const entry of entries) {
      expect(entry.entry_text).not.toBe('');
      expect(entry.entry_text).toBeDefined();
    }
  });

  it('sets project and evidence source FKs', () => {
    const entries = buildEntries();
    for (const entry of entries) {
      expect(entry.evidence_source_id).toBe(1);
      expect(entry.project_id).toBe(1);
      expect(entry.study_id).toBeNull();
    }
  });

  it('preserves source row index', () => {
    const entries = buildEntries();
    const indices = entries.map(e => e.source_row_index);
    expect(indices.every(i => i !== undefined && i !== null)).toBe(true);
  });
});

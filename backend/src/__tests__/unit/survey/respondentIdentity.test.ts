/**
 * Respondent Identity unit tests.
 *
 * Covers: declared ID used, duplicate IDs fail, stable generated keys,
 * different rows get different IDs, labels are not canonical.
 */

import {
  assignRespondentIdentities,
  DuplicateRespondentIdError,
} from '../../../helpers/survey/respondentIdentity';
import { parseCsvBuffer } from '../../../helpers/survey/csvParser';
import { computeContentHash } from '../../../helpers/survey/sourceHash';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ConfirmedField } from '../../../types/survey';

const FIXTURES = join(__dirname, '../../__fixtures__/survey');

describe('respondentIdentity', () => {
  it('uses declared ID field when confirmed', () => {
    const csv = readFileSync(join(FIXTURES, 'standard.csv'));
    const survey = parseCsvBuffer(csv, 'standard.csv');
    const hash = computeContentHash(csv);

    const confirmedFields: ConfirmedField[] = [
      { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
      { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal', orderMetadata: null, isDemographic: false },
    ];

    const identities = assignRespondentIdentities(survey, confirmedFields, hash);

    expect(identities[0].canonicalKey).toBe('R-101');
    expect(identities[0].source).toBe('declared');
    expect(identities[1].canonicalKey).toBe('R-102');
  });

  it('throws DuplicateRespondentIdError on duplicate declared IDs', () => {
    const csv = readFileSync(join(FIXTURES, 'duplicate-ids.csv'));
    const survey = parseCsvBuffer(csv, 'duplicate-ids.csv');
    const hash = computeContentHash(csv);

    const confirmedFields: ConfirmedField[] = [
      { fieldName: 'response_id', confirmedRole: 'id', orderMetadata: null, isDemographic: false },
    ];

    expect(() => assignRespondentIdentities(survey, confirmedFields, hash))
      .toThrow(DuplicateRespondentIdError);
  });

  it('generates stable keys for same dataset', () => {
    const csv = readFileSync(join(FIXTURES, 'no-respondent-id.csv'));
    const survey = parseCsvBuffer(csv, 'no-respondent-id.csv');
    const hash = computeContentHash(csv);

    const confirmedFields: ConfirmedField[] = [
      { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal', orderMetadata: null, isDemographic: false },
    ];

    const run1 = assignRespondentIdentities(survey, confirmedFields, hash);
    const run2 = assignRespondentIdentities(survey, confirmedFields, hash);

    for (let i = 0; i < run1.length; i++) {
      expect(run1[i].canonicalKey).toBe(run2[i].canonicalKey);
    }
  });

  it('different rows get different generated IDs', () => {
    const csv = readFileSync(join(FIXTURES, 'no-respondent-id.csv'));
    const survey = parseCsvBuffer(csv, 'no-respondent-id.csv');
    const hash = computeContentHash(csv);

    const confirmedFields: ConfirmedField[] = [
      { fieldName: 'overall_satisfaction', confirmedRole: 'ordinal', orderMetadata: null, isDemographic: false },
    ];

    const identities = assignRespondentIdentities(survey, confirmedFields, hash);
    const keys = identities.map(i => i.canonicalKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('display labels are R001-format, not canonical identity', () => {
    const csv = readFileSync(join(FIXTURES, 'no-respondent-id.csv'));
    const survey = parseCsvBuffer(csv, 'no-respondent-id.csv');
    const hash = computeContentHash(csv);

    const confirmedFields: ConfirmedField[] = [];

    const identities = assignRespondentIdentities(survey, confirmedFields, hash);

    expect(identities[0].displayLabel).toBe('R001');
    expect(identities[1].displayLabel).toBe('R002');
    // Labels are NOT the canonical key
    expect(identities[0].canonicalKey).not.toBe('R001');
    expect(identities[0].source).toBe('generated');
  });

  it('generated keys depend on content hash, not external source ID', () => {
    const csv1 = 'col1\nA\nB';
    const csv2 = 'col1\nA\nB\nC';
    const survey1 = parseCsvBuffer(csv1, 'test1.csv');
    const survey2 = parseCsvBuffer(csv2, 'test2.csv');
    const hash1 = computeContentHash(csv1);
    const hash2 = computeContentHash(csv2);

    const ids1 = assignRespondentIdentities(survey1, [], hash1);
    const ids2 = assignRespondentIdentities(survey2, [], hash2);

    // Same row index but different content hash → different keys
    expect(ids1[0].canonicalKey).not.toBe(ids2[0].canonicalKey);
  });
});

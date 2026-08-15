/**
 * Persisted Facts Loading tests.
 *
 * Verifies that SurveyComputedFacts can be reconstructed from
 * evidence constructs without any CSV/Redis dependency.
 */

import { loadPersistedFacts } from '../../../helpers/survey/loadPersistedFacts';
import type { SurveyComputedFacts } from '../../../types/survey';

describe('loadPersistedFacts', () => {
  it('reconstructs facts from evidence constructs', () => {
    const constructs = [
      {
        construct_type: 'survey_dataset_summary',
        payload: {
          total_respondents: 11,
          schema_summary: [
            { fieldName: 'satisfaction', role: 'ordinal', nPresent: 11, nMissing: 0 },
          ],
          nonresponse_limitation: 'Bare CSV limitation',
          source_content_hash: 'abc123',
        },
      },
      {
        construct_type: 'field_distribution',
        payload: {
          fieldName: 'satisfaction',
          role: 'ordinal',
          totalRespondents: 11,
          nPresent: 11,
          nMissing: 0,
          distribution: { Satisfied: 6, Neutral: 3, Dissatisfied: 2 },
          median: 'Satisfied',
          nValidNumeric: null,
          nInvalidNumeric: null,
        },
      },
      {
        construct_type: 'cross_tab',
        payload: {
          rowField: 'completion',
          colField: 'satisfaction',
          cells: { Complete: { Satisfied: 5, Neutral: 1 } },
          totalN: 6,
        },
      },
    ];

    const facts = loadPersistedFacts(constructs);

    expect(facts).not.toBeNull();
    expect(facts!.totalRespondents).toBe(11);
    expect(facts!.sourceContentHash).toBe('abc123');
    expect(facts!.fieldStats).toHaveLength(1);
    expect(facts!.fieldStats[0].fieldName).toBe('satisfaction');
    expect(facts!.fieldStats[0].distribution).toEqual({ Satisfied: 6, Neutral: 3, Dissatisfied: 2 });
    expect(facts!.fieldStats[0].median).toBe('Satisfied');
    expect(facts!.crossTabs).toHaveLength(1);
    expect(facts!.crossTabs[0].totalN).toBe(6);
    expect(facts!.nonresponseLimitation).toContain('CSV');
  });

  it('returns null when no summary construct exists', () => {
    const facts = loadPersistedFacts([
      { construct_type: 'field_distribution', payload: {} },
    ]);
    expect(facts).toBeNull();
  });

  it('handles empty field stats and cross-tabs', () => {
    const facts = loadPersistedFacts([
      {
        construct_type: 'survey_dataset_summary',
        payload: {
          total_respondents: 5,
          schema_summary: [],
          nonresponse_limitation: 'Test',
          source_content_hash: 'xyz',
        },
      },
    ]);

    expect(facts).not.toBeNull();
    expect(facts!.totalRespondents).toBe(5);
    expect(facts!.fieldStats).toHaveLength(0);
    expect(facts!.crossTabs).toHaveLength(0);
  });

  it('loaded facts match original computed facts structure', () => {
    // This verifies the canonical invariant: persisted facts can reconstruct
    // the same SurveyComputedFacts shape without CSV
    const facts = loadPersistedFacts([
      {
        construct_type: 'survey_dataset_summary',
        payload: {
          total_respondents: 10,
          schema_summary: [
            { fieldName: 'rating', role: 'ordinal', nPresent: 10, nMissing: 0 },
          ],
          nonresponse_limitation: 'Limitation note',
          source_content_hash: 'hash123',
        },
      },
      {
        construct_type: 'field_distribution',
        payload: {
          fieldName: 'rating',
          role: 'ordinal',
          totalRespondents: 10,
          nPresent: 10,
          nMissing: 0,
          distribution: { Good: 7, Fair: 3 },
          median: 'Good',
          nValidNumeric: null,
          nInvalidNumeric: null,
        },
      },
    ]);

    // Verify shape matches SurveyComputedFacts interface
    expect(facts).toHaveProperty('sourceContentHash');
    expect(facts).toHaveProperty('totalRespondents');
    expect(facts).toHaveProperty('schemaSummary');
    expect(facts).toHaveProperty('fieldStats');
    expect(facts).toHaveProperty('crossTabs');
    expect(facts).toHaveProperty('nonresponseLimitation');

    // No raw CSV dependency needed
    expect(facts!.totalRespondents).toBe(10);
    expect(facts!.fieldStats[0].median).toBe('Good');
  });
});

describe('codebook pagination', () => {
  const CODES_PER_PAGE = 5;

  function totalPages(codeCount: number): number {
    return Math.ceil(codeCount / CODES_PER_PAGE);
  }

  it('1 code = 1 page', () => expect(totalPages(1)).toBe(1));
  it('5 codes = 1 page', () => expect(totalPages(5)).toBe(1));
  it('6 codes = 2 pages', () => expect(totalPages(6)).toBe(2));
  it('12 codes = 3 pages', () => expect(totalPages(12)).toBe(3));
});

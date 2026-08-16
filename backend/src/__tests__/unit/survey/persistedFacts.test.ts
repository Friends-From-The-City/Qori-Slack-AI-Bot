/**
 * Persisted Facts Loading tests.
 *
 * Verifies that SurveyComputedFacts can be reconstructed from
 * evidence constructs without any CSV/Redis dependency.
 */

import { loadPersistedFacts, FactInvariantError } from '../../../helpers/survey/loadPersistedFacts';
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

describe('fail-closed invariants', () => {
  const makeSummary = (totalRespondents: number) => ({
    construct_type: 'survey_dataset_summary',
    payload: {
      total_respondents: totalRespondents,
      schema_summary: [],
      nonresponse_limitation: 'Test',
      source_content_hash: 'hash',
    },
  });

  const makeField = (fieldName: string, nPresent: number, nMissing: number) => ({
    construct_type: 'field_distribution',
    payload: {
      fieldName,
      role: 'ordinal',
      totalRespondents: 10,
      nPresent,
      nMissing,
      distribution: { A: nPresent },
      median: 'A',
      nValidNumeric: null,
      nInvalidNumeric: null,
    },
  });

  const makeCrossTab = (rowField: string, colField: string, totalN: number) => ({
    construct_type: 'cross_tab',
    payload: { rowField, colField, cells: { row1: { col1: totalN } }, totalN },
  });

  it('rejects when nPresent > respondent_count', () => {
    expect(() => loadPersistedFacts([
      makeSummary(10),
      makeField('satisfaction', 11, 0),
    ])).toThrow(FactInvariantError);
  });

  it('rejects duplicate field_distribution for same field', () => {
    expect(() => loadPersistedFacts([
      makeSummary(10),
      makeField('satisfaction', 8, 2),
      makeField('satisfaction', 8, 2), // duplicate
    ])).toThrow(FactInvariantError);
  });

  it('rejects duplicate cross_tab for same row+col', () => {
    expect(() => loadPersistedFacts([
      makeSummary(10),
      makeCrossTab('completion', 'difficulty', 10),
      makeCrossTab('completion', 'difficulty', 10), // duplicate
    ])).toThrow(FactInvariantError);
  });

  it('rejects cross-tab totalN > respondent_count', () => {
    expect(() => loadPersistedFacts([
      makeSummary(10),
      makeCrossTab('completion', 'difficulty', 11),
    ])).toThrow(FactInvariantError);
  });

  it('rejects multiple dataset summaries', () => {
    expect(() => loadPersistedFacts([
      makeSummary(10),
      makeSummary(10), // duplicate summary
    ])).toThrow(FactInvariantError);
  });

  it('accepts valid coherent fact set', () => {
    const facts = loadPersistedFacts([
      makeSummary(10),
      makeField('satisfaction', 10, 0),
      makeField('difficulty', 8, 2),
      makeCrossTab('satisfaction', 'difficulty', 8),
    ]);

    expect(facts).not.toBeNull();
    expect(facts!.totalRespondents).toBe(10);
    expect(facts!.fieldStats).toHaveLength(2);
    expect(facts!.crossTabs).toHaveLength(1);
  });

  it('each field appears exactly once in valid fact set', () => {
    const facts = loadPersistedFacts([
      makeSummary(10),
      makeField('satisfaction', 10, 0),
      makeField('difficulty', 9, 1),
      makeField('completion', 10, 0),
    ]);

    expect(facts).not.toBeNull();
    const fieldNames = facts!.fieldStats.map(f => f.fieldName);
    expect(new Set(fieldNames).size).toBe(fieldNames.length);
  });

  it('each cross-tab appears exactly once in valid fact set', () => {
    const facts = loadPersistedFacts([
      makeSummary(10),
      makeCrossTab('completion', 'satisfaction', 10),
      makeCrossTab('completion', 'difficulty', 8),
    ]);

    expect(facts).not.toBeNull();
    const ctKeys = facts!.crossTabs.map(ct => `${ct.rowField}:${ct.colField}`);
    expect(new Set(ctKeys).size).toBe(ctKeys.length);
  });

  it('nPresent never exceeds respondent_count in valid set', () => {
    const facts = loadPersistedFacts([
      makeSummary(10),
      makeField('f1', 10, 0),
      makeField('f2', 5, 5),
      makeField('f3', 0, 10),
    ]);

    expect(facts).not.toBeNull();
    for (const f of facts!.fieldStats) {
      expect(f.nPresent).toBeLessThanOrEqual(10);
    }
  });

  // ── Reconciliation invariants ──

  it('rejects nPresent + nMissing ≠ respondent_count', () => {
    // nPresent=9, nMissing=0 → sum=9, respondent_count=10 → FAIL
    expect(() => loadPersistedFacts([
      makeSummary(10),
      { construct_type: 'field_distribution', payload: {
        fieldName: 'f1', role: 'ordinal', totalRespondents: 10,
        nPresent: 9, nMissing: 0,
        distribution: { A: 9 }, median: 'A',
        nValidNumeric: null, nInvalidNumeric: null,
      }},
    ])).toThrow(FactInvariantError);
  });

  it('accepts nPresent + nMissing == respondent_count', () => {
    // nPresent=9, nMissing=1 → sum=10 → PASS
    const facts = loadPersistedFacts([
      makeSummary(10),
      { construct_type: 'field_distribution', payload: {
        fieldName: 'f1', role: 'ordinal', totalRespondents: 10,
        nPresent: 9, nMissing: 1,
        distribution: { A: 9 }, median: 'A',
        nValidNumeric: null, nInvalidNumeric: null,
      }},
    ]);
    expect(facts).not.toBeNull();
    expect(facts!.fieldStats[0].nPresent).toBe(9);
  });

  it('rejects distribution sum ≠ nPresent', () => {
    // distribution {A:5, B:3} sums to 8, nPresent=9 → FAIL
    expect(() => loadPersistedFacts([
      makeSummary(10),
      { construct_type: 'field_distribution', payload: {
        fieldName: 'f1', role: 'ordinal', totalRespondents: 10,
        nPresent: 9, nMissing: 1,
        distribution: { A: 5, B: 3 }, median: 'A',
        nValidNumeric: null, nInvalidNumeric: null,
      }},
    ])).toThrow(FactInvariantError);
  });

  it('rejects cross-tab cell sum ≠ totalN', () => {
    // cells sum to 9, totalN=10 → FAIL
    expect(() => loadPersistedFacts([
      makeSummary(10),
      { construct_type: 'cross_tab', payload: {
        rowField: 'a', colField: 'b',
        cells: { r1: { c1: 5, c2: 4 } }, totalN: 10,
      }},
    ])).toThrow(FactInvariantError);
  });

  it('accepts cross-tab when cell sum == totalN', () => {
    const facts = loadPersistedFacts([
      makeSummary(10),
      { construct_type: 'cross_tab', payload: {
        rowField: 'a', colField: 'b',
        cells: { r1: { c1: 5, c2: 5 } }, totalN: 10,
      }},
    ]);
    expect(facts).not.toBeNull();
    expect(facts!.crossTabs[0].totalN).toBe(10);
  });
});

describe('retry idempotency simulation', () => {
  it('same source persisted 3 times produces identical facts when deduplicated', () => {
    // Simulates what loadPersistedFacts receives AFTER idempotent persistence:
    // only one canonical construct per semantic identity.
    const singleSet = [
      {
        construct_type: 'survey_dataset_summary',
        payload: {
          total_respondents: 10,
          schema_summary: [{ fieldName: 'satisfaction', role: 'ordinal', nPresent: 10, nMissing: 0 }],
          nonresponse_limitation: 'Test',
          source_content_hash: 'abc',
        },
      },
      {
        construct_type: 'field_distribution',
        payload: {
          fieldName: 'satisfaction', role: 'ordinal', totalRespondents: 10,
          nPresent: 10, nMissing: 0,
          distribution: { Good: 6, Fair: 4 }, median: 'Good',
          nValidNumeric: null, nInvalidNumeric: null,
        },
      },
      {
        construct_type: 'cross_tab',
        payload: {
          rowField: 'completion', colField: 'satisfaction',
          cells: { Complete: { Good: 5, Fair: 2 } }, totalN: 7,
        },
      },
    ];

    // After idempotent persistence, retries produce the same single set
    const facts1 = loadPersistedFacts(singleSet);
    const facts2 = loadPersistedFacts(singleSet);
    const facts3 = loadPersistedFacts(singleSet);

    // All three produce identical results
    expect(facts1).toEqual(facts2);
    expect(facts2).toEqual(facts3);

    // Respondent count is always 10, never inflated
    expect(facts1!.totalRespondents).toBe(10);
    expect(facts1!.fieldStats).toHaveLength(1);
    expect(facts1!.crossTabs).toHaveLength(1);
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

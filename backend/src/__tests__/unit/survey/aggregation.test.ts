/**
 * Deterministic Qualitative Aggregation Tests
 *
 * Verifies the core Slice 2B invariant: accepted coding → deterministic
 * unique-respondent counts. No model involvement.
 */

import { computeQualitativeAggregation } from '../../../services/survey-aggregation.service';

describe('computeQualitativeAggregation', () => {
  const eligible = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10']);

  it('counts unique respondents per code (not entries)', () => {
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'Appt Selection', code_definition: 'def' },
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'Appt Selection', code_definition: 'def' }, // same respondent, same code = 1
      { respondent_key: 'R2', code_public_id: 'c1', code_label: 'Appt Selection', code_definition: 'def' },
    ];

    const result = computeQualitativeAggregation(assignments, eligible);
    const pattern = result.recurringPatterns.find(p => p.codePublicId === 'c1');
    expect(pattern).toBeDefined();
    expect(pattern!.uniqueRespondentCount).toBe(2); // R1 + R2, not 3
    expect(pattern!.acceptedEntryCount).toBe(3); // 3 assignment rows
  });

  it('respondent in multiple codes counts once per code', () => {
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R1', code_public_id: 'c2', code_label: 'B', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'c1', code_label: 'A', code_definition: '' },
    ];

    const result = computeQualitativeAggregation(assignments, eligible);
    const a = result.recurringPatterns.find(p => p.codePublicId === 'c1');
    expect(a!.uniqueRespondentCount).toBe(2); // R1 + R2
    // c2 has only R1 → individual observation
    const b = result.individualObservations.find(p => p.codePublicId === 'c2');
    expect(b!.uniqueRespondentCount).toBe(1);
  });

  it('denominator is eligible respondents, not entries', () => {
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'A', code_definition: '' },
    ];

    const result = computeQualitativeAggregation(assignments, eligible);
    expect(result.eligibleRespondentCount).toBe(10);
    expect(result.individualObservations[0].denominator).toBe(10);
    expect(result.individualObservations[0].denominatorBasis).toBe('eligible_respondents');
  });

  it('n=1 → Individual Observation, n>=2 → Recurring Pattern', () => {
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'Recurring', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'c1', code_label: 'Recurring', code_definition: '' },
      { respondent_key: 'R3', code_public_id: 'c2', code_label: 'Single', code_definition: '' },
    ];

    const result = computeQualitativeAggregation(assignments, eligible);
    expect(result.recurringPatterns).toHaveLength(1);
    expect(result.recurringPatterns[0].codeLabel).toBe('Recurring');
    expect(result.individualObservations).toHaveLength(1);
    expect(result.individualObservations[0].codeLabel).toBe('Single');
  });

  it('small-n format: count first when total < 20', () => {
    const small = new Set(['R1', 'R2', 'R3', 'R4', 'R5']);
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'c1', code_label: 'A', code_definition: '' },
    ];

    const result = computeQualitativeAggregation(assignments, small);
    expect(result.recurringPatterns[0].displayFrequency).toBe('2 of 5 (40%)');
  });

  it('large-n format: percentage first when total >= 20', () => {
    const large = new Set(Array.from({ length: 25 }, (_, i) => `R${i + 1}`));
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R3', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R4', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R5', code_public_id: 'c1', code_label: 'A', code_definition: '' },
    ];

    const result = computeQualitativeAggregation(assignments, large);
    expect(result.recurringPatterns[0].displayFrequency).toBe('20% (5 of 25)');
  });

  it('percentages are deterministic across runs', () => {
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'c1', code_label: 'A', code_definition: '' },
      { respondent_key: 'R3', code_public_id: 'c1', code_label: 'A', code_definition: '' },
    ];

    const r1 = computeQualitativeAggregation(assignments, eligible);
    const r2 = computeQualitativeAggregation(assignments, eligible);
    const r3 = computeQualitativeAggregation(assignments, eligible);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('empty assignments → no patterns', () => {
    const result = computeQualitativeAggregation([], eligible);
    expect(result.recurringPatterns).toHaveLength(0);
    expect(result.individualObservations).toHaveLength(0);
    expect(result.eligibleRespondentCount).toBe(10);
  });

  it('recurring patterns sorted by count desc then alphabetical', () => {
    const assignments = [
      { respondent_key: 'R1', code_public_id: 'c1', code_label: 'Zebra', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'c1', code_label: 'Zebra', code_definition: '' },
      { respondent_key: 'R3', code_public_id: 'c1', code_label: 'Zebra', code_definition: '' },
      { respondent_key: 'R1', code_public_id: 'c2', code_label: 'Apple', code_definition: '' },
      { respondent_key: 'R2', code_public_id: 'c2', code_label: 'Apple', code_definition: '' },
    ];

    const result = computeQualitativeAggregation(assignments, eligible);
    expect(result.recurringPatterns[0].codeLabel).toBe('Zebra'); // 3 > 2
    expect(result.recurringPatterns[1].codeLabel).toBe('Apple'); // 2
  });
});

/**
 * Assignment Generator Validation Tests
 *
 * Tests the validation logic only (no LLM calls).
 * Ensures invented IDs, prohibited language, and counting
 * patterns are correctly rejected.
 */

import { validateAssignments, type GeneratedAssignment } from '../../../helpers/survey/assignmentGenerator';

const validEntryIds = new Set(['entry-aaa', 'entry-bbb', 'entry-ccc']);
const validCodeIds = new Set(['code-111', 'code-222', 'code-333']);

describe('validateAssignments', () => {
  it('accepts valid assignments with known IDs', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: ['code-111'], rationale: 'Matches the definition.' },
      { qualitative_entry_public_id: 'entry-bbb', code_public_ids: ['code-111', 'code-222'], rationale: 'Both apply.' },
    ];

    const result = validateAssignments(assignments, validEntryIds, validCodeIds);
    expect(result).toHaveLength(2);
  });

  it('accepts empty code_public_ids (zero matches valid)', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: [], rationale: 'No grouping fits this response.' },
    ];

    const result = validateAssignments(assignments, validEntryIds, validCodeIds);
    expect(result).toHaveLength(1);
    expect(result[0].code_public_ids).toHaveLength(0);
  });

  it('rejects invented entry public_ids', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'invented-id', code_public_ids: ['code-111'], rationale: 'Reason.' },
    ];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('unknown entry "invented-id"');
  });

  it('rejects invented code public_ids', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: ['invented-code'], rationale: 'Reason.' },
    ];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('unknown code "invented-code"');
  });

  it('rejects "theme" in rationale', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: ['code-111'], rationale: 'This is a recurring theme.' },
    ];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('prohibited language');
  });

  it('rejects "prevalence" in rationale', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: ['code-111'], rationale: 'High prevalence of this pattern.' },
    ];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('prohibited language');
  });

  it('rejects counting patterns in rationale', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: ['code-111'], rationale: '5 respondents mentioned this.' },
    ];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('counts or percentages');
  });

  it('rejects percentage patterns in rationale', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: ['code-111'], rationale: 'About 30% of responses.' },
    ];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('counts or percentages');
  });

  it('rejects "3 out of 10" counting pattern', () => {
    const assignments: GeneratedAssignment[] = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: ['code-111'], rationale: '3 out of 10 participants noted this.' },
    ];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('counts or percentages');
  });

  it('rejects missing required fields', () => {
    const assignments = [
      { qualitative_entry_public_id: '', code_public_ids: ['code-111'], rationale: 'Reason.' },
    ] as GeneratedAssignment[];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('missing required fields');
  });

  it('rejects non-array code_public_ids', () => {
    const assignments = [
      { qualitative_entry_public_id: 'entry-aaa', code_public_ids: 'code-111' as unknown as string[], rationale: 'Reason.' },
    ] as GeneratedAssignment[];

    expect(() => validateAssignments(assignments, validEntryIds, validCodeIds))
      .toThrow('non-array code_public_ids');
  });
});

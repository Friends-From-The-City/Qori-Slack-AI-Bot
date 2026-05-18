import { calculatePerPersonCompensation } from '../../utils/compensationCalculator';

describe('calculatePerPersonCompensation', () => {
  const cases: { input: { parsed_budget_amount: number | null; target_participants: number | null } | null; expected: number | null; reason: string }[] = [
    { input: { parsed_budget_amount: 1000, target_participants: 10 }, expected: 100, reason: 'even division' },
    { input: { parsed_budget_amount: 1000, target_participants: 3 }, expected: 333.33, reason: 'rounds to 2 decimal places' },
    { input: { parsed_budget_amount: 500, target_participants: 8 }, expected: 62.5, reason: 'standard division' },
    { input: { parsed_budget_amount: 0, target_participants: 10 }, expected: null, reason: 'zero budget' },
    { input: { parsed_budget_amount: 1000, target_participants: 0 }, expected: null, reason: 'zero target' },
    { input: { parsed_budget_amount: 1000, target_participants: -1 }, expected: null, reason: 'negative target' },
    { input: { parsed_budget_amount: null, target_participants: 10 }, expected: null, reason: 'null budget' },
    { input: { parsed_budget_amount: 1000, target_participants: null }, expected: null, reason: 'null target' },
    { input: null, expected: null, reason: 'null study' },
  ];

  cases.forEach(({ input, expected, reason }) => {
    it(`returns ${expected} for ${JSON.stringify(input)} (${reason})`, () => {
      expect(calculatePerPersonCompensation(input)).toBe(expected);
    });
  });
});

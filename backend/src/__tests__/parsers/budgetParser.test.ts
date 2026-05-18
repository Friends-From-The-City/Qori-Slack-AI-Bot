import { parseBudget, parseParticipantTarget } from '../../utils/budgetParser';

describe('parseBudget', () => {
  const cases: { input: string | null | undefined; expected: number | null; reason: string }[] = [
    { input: '$800', expected: 800, reason: 'standard dollar amount' },
    { input: '800', expected: 800, reason: 'no dollar sign' },
    { input: '$800.00', expected: 800, reason: 'dollar with cents' },
    { input: '$800.50', expected: 800.50, reason: 'dollar with non-zero cents' },
    { input: '800 USD', expected: 800, reason: 'trailing currency label' },
    { input: '$800 participant incentives', expected: 800, reason: 'trailing description text' },
    { input: '$1,000', expected: 1000, reason: 'comma-formatted dollar amount' },
    { input: '$1000', expected: 1000, reason: 'no comma' },
    { input: '1000', expected: 1000, reason: 'plain integer' },
    { input: '1,000.50', expected: 1000.50, reason: 'comma and decimal' },
    { input: '$2,500.00', expected: 2500, reason: 'comma-formatted with cents' },
    { input: '  $800  ', expected: 800, reason: 'whitespace-padded' },
    // Rejected inputs
    { input: '', expected: null, reason: 'empty string' },
    { input: null, expected: null, reason: 'null' },
    { input: undefined, expected: null, reason: 'undefined' },
    { input: 'TBD', expected: null, reason: 'TBD placeholder' },
    { input: 'pending', expected: null, reason: 'pending placeholder' },
    { input: '$500-$1000', expected: null, reason: 'range with hyphen' },
    { input: '$500–$1000', expected: null, reason: 'range with en-dash' },
    { input: '$500 to $1000', expected: null, reason: 'range with "to"' },
    { input: 'between $500 and $1000', expected: null, reason: 'range with "between"' },
    { input: 'around $800', expected: null, reason: 'imprecision qualifier "around"' },
    { input: 'approximately $800', expected: null, reason: 'imprecision qualifier "approximately"' },
    { input: 'about $800', expected: null, reason: 'imprecision qualifier "about"' },
    { input: 'roughly $800', expected: null, reason: 'imprecision qualifier "roughly"' },
    { input: '$800 + travel', expected: null, reason: 'addition operator' },
    { input: 'invalid', expected: null, reason: 'non-numeric text' },
    { input: '$0', expected: null, reason: 'zero amount rejected' },
    { input: '$-100', expected: null, reason: 'negative rejected via range pattern' },
  ];

  cases.forEach(({ input, expected, reason }) => {
    it(`returns ${expected} for ${JSON.stringify(input)} (${reason})`, () => {
      expect(parseBudget(input)).toBe(expected);
    });
  });
});

describe('parseParticipantTarget', () => {
  const cases: { input: string | null | undefined; expected: number | null; reason: string }[] = [
    { input: '10', expected: 10, reason: 'plain integer' },
    { input: '8 Veterans', expected: 8, reason: 'integer with trailing label' },
    { input: '15 participants', expected: 15, reason: 'integer with "participants"' },
    { input: '1', expected: 1, reason: 'minimum valid' },
    { input: '100', expected: 100, reason: 'three digits' },
    { input: '  12  ', expected: 12, reason: 'whitespace-padded' },
    // Rejected inputs
    { input: '', expected: null, reason: 'empty string' },
    { input: null, expected: null, reason: 'null' },
    { input: undefined, expected: null, reason: 'undefined' },
    { input: 'ten', expected: null, reason: 'word number not supported' },
    { input: 'many', expected: null, reason: 'non-numeric text' },
    { input: '0', expected: null, reason: 'zero rejected' },
    { input: '0 participants', expected: null, reason: 'zero with label rejected' },
  ];

  cases.forEach(({ input, expected, reason }) => {
    it(`returns ${expected} for ${JSON.stringify(input)} (${reason})`, () => {
      expect(parseParticipantTarget(input)).toBe(expected);
    });
  });
});

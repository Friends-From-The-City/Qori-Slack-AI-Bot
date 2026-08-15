/**
 * Ordinal Scale Suggestions — pre-populate common ordinal orders.
 *
 * Sources of safe suggestions:
 * A. Known canonical scales (exact match, case-insensitive)
 * B. Numeric scales (ascending order)
 * C. Previously accepted project scales (deferred — not in Slice 1)
 * D. Unknown scales — leave blank
 *
 * Suggestions are NOT authoritative. Researcher must confirm.
 */

/**
 * Known canonical Likert-type scales.
 * Keys are normalized category sets (sorted lowercase).
 * Values are the correct low → high order.
 */
const KNOWN_SCALES: Array<{ categories: Set<string>; order: string[] }> = [
  {
    categories: new Set(['very dissatisfied', 'dissatisfied', 'neutral', 'satisfied', 'very satisfied']),
    order: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'],
  },
  {
    categories: new Set(['very difficult', 'difficult', 'neutral', 'easy', 'very easy']),
    order: ['Very Difficult', 'Difficult', 'Neutral', 'Easy', 'Very Easy'],
  },
  {
    categories: new Set(['strongly disagree', 'disagree', 'neither agree nor disagree', 'agree', 'strongly agree']),
    order: ['Strongly Disagree', 'Disagree', 'Neither Agree Nor Disagree', 'Agree', 'Strongly Agree'],
  },
  {
    categories: new Set(['very unlikely', 'unlikely', 'neither likely nor unlikely', 'likely', 'very likely']),
    order: ['Very Unlikely', 'Unlikely', 'Neither Likely Nor Unlikely', 'Likely', 'Very Likely'],
  },
  {
    categories: new Set(['very poor', 'poor', 'fair', 'good', 'excellent']),
    order: ['Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'],
  },
  {
    categories: new Set(['never', 'rarely', 'sometimes', 'often', 'always']),
    order: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
  },
];

export interface OrdinalSuggestion {
  suggestedOrder: string[] | null;
  source: 'known_scale' | 'numeric' | 'none';
}

/**
 * Suggest an ordinal category order for a set of observed values.
 *
 * Returns null suggestedOrder if no safe suggestion can be made.
 * Exact match only — no fuzzy matching.
 */
export function suggestOrdinalOrder(observedValues: string[]): OrdinalSuggestion {
  if (observedValues.length === 0) return { suggestedOrder: null, source: 'none' };

  // A. Check known canonical scales (exact, case-insensitive)
  const normalizedObserved = new Set(observedValues.map(v => v.toLowerCase().trim()));
  for (const scale of KNOWN_SCALES) {
    if (setsEqual(normalizedObserved, scale.categories)) {
      // Map observed casing to canonical order
      const caseMap = new Map(observedValues.map(v => [v.toLowerCase().trim(), v]));
      const order = scale.order.map(cat => caseMap.get(cat.toLowerCase()) ?? cat);
      return { suggestedOrder: order, source: 'known_scale' };
    }
  }

  // B. Numeric scale — all values parse as numbers
  const parsed = observedValues.map(v => ({ raw: v, num: parseFloat(v.trim()) }));
  if (parsed.every(p => !isNaN(p.num))) {
    const sorted = [...parsed].sort((a, b) => a.num - b.num);
    return { suggestedOrder: sorted.map(p => p.raw), source: 'numeric' };
  }

  // D. Unknown — no safe suggestion
  return { suggestedOrder: null, source: 'none' };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

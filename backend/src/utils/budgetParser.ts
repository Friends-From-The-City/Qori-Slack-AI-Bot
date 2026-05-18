/**
 * Parses a free-text budget field into a single dollar amount.
 * Returns null if the value is empty, non-numeric, or ambiguous.
 *
 * Accepted: "$800", "800", "$800.00", "800 USD", "$800 participant incentives"
 * Rejected: "", "TBD", "$500-$1000", "around $800", "$800 + travel"
 */
export function parseBudget(rawText: string | null | undefined): number | null {
  if (!rawText || typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();
  if (trimmed === '') return null;

  // Reject range indicators
  if (/-|–|\bto\b|\bbetween\b/i.test(trimmed)) return null;

  // Reject imprecision qualifiers
  if (/\b(around|approximately|approx|roughly|about|tbd|pending)\b/i.test(trimmed)) return null;

  // Reject addition/multiple components
  if (/\+/.test(trimmed)) return null;

  // Strip thousands-separator commas before matching
  // "$1,000" → "$1000", "$2,500.00" → "$2500.00"
  const normalized = trimmed.replace(/(\d),(\d{3})/g, '$1$2');

  // Extract the first dollar amount pattern
  const match = normalized.match(/\$?(\d{1,7}(?:\.\d{1,2})?)/);
  if (!match) return null;

  const amount = parseFloat(match[1]);
  if (Number.isNaN(amount) || amount <= 0) return null;

  return amount;
}

/**
 * Extracts a participant count from free-text (e.g., "8 Veterans" → 8).
 * Returns null if no clear leading integer is found.
 */
export function parseParticipantTarget(rawText: string | null | undefined): number | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const match = rawText.trim().match(/^(\d+)\b/);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  return count > 0 ? count : null;
}

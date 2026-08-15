/**
 * Display Labels — convert machine field names to researcher-facing labels.
 *
 * Default: snake_case → Title Case (replace underscores with spaces).
 * Special cases: id → ID, respondent_id → Respondent ID.
 *
 * Canonical source field name is preserved in persistence.
 * Display labels are presentation only.
 */

const SPECIAL_CASES: Record<string, string> = {
  id: 'ID',
  respondent_id: 'Respondent ID',
  response_id: 'Response ID',
  participant_id: 'Participant ID',
  url: 'URL',
  api: 'API',
  pii: 'PII',
};

/**
 * Convert a snake_case field name to a Title Case display label.
 */
export function toDisplayLabel(fieldName: string): string {
  const lower = fieldName.toLowerCase().trim();
  if (SPECIAL_CASES[lower]) return SPECIAL_CASES[lower];

  return fieldName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

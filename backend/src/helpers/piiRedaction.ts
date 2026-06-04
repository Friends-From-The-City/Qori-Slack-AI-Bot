/**
 * piiRedaction.ts — Pre-transmission PII redaction for LLM payloads
 *
 * H9 remediation: Replaces known participant names with participant codes
 * BEFORE content is sent to the Anthropic API. This is pre-transmission
 * redaction, not storage-time redaction.
 *
 * SCOPE LIMITATIONS (MVP):
 * - Only redacts FULL participant names (not first-name-only)
 * - Only redacts names we KNOW (from participant record)
 * - Does NOT redact: other people mentioned, place identifiers, dates,
 *   partial name matches, nicknames, or typos
 *
 * These limitations are documented — the system does not claim total PII
 * coverage, only that KNOWN participant names are replaced with codes.
 */

import { PiiRedactionError } from '../types/handlers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Redact known participant name from content, replacing with participant code.
 *
 * @param content - The transcript/notes content to redact
 * @param participantName - The full name to redact (e.g., "Jane Smith")
 * @param participantCode - The code to substitute (e.g., "PT-001")
 * @returns Content with name replaced by code
 *
 * DESIGN NOTES:
 * - Full-name substitution ONLY (no first-name-only — corrupts common words)
 * - Word-boundary matching to avoid partial replacements
 * - Case-insensitive to catch "jane smith", "Jane Smith", "JANE SMITH"
 * - Only substitutes names where name.length > 2 (avoid "Al" → "Also" issues)
 */
export function redactTranscript(
  content: string,
  participantName: string | null | undefined,
  participantCode: string,
): string {
  if (!content) return content;
  if (!participantName || participantName.trim().length <= 2) return content;

  const trimmedName = participantName.trim();

  // Full-name substitution with word boundaries
  const fullNamePattern = new RegExp(
    `\\b${escapeRegex(trimmedName)}\\b`,
    'gi',
  );
  const redacted = content.replace(fullNamePattern, participantCode);

  return redacted;
}

// ---------------------------------------------------------------------------
// Assertion (fail-closed)
// ---------------------------------------------------------------------------

/**
 * Assert that no known participant names remain in the payload.
 *
 * FAIL-CLOSED: If any known name is detected, this function THROWS.
 * The caller MUST NOT proceed with the API call.
 *
 * @param payload - The assembled prompt/payload string
 * @param knownNames - Array of participant names that should have been redacted
 * @param participantCode - The code that should appear instead
 * @throws PiiRedactionError if any known name is still present
 *
 * DESIGN NOTES:
 * - This is "known-name redaction verification", NOT "PII-free guarantee"
 * - A passing check means: redactTranscript() worked correctly
 * - A failing check means: a known name leaked through (redaction bug)
 * - Names ≤2 chars are skipped (same as redaction — too short, false positives)
 */
export function assertKnownNamesRedacted(
  payload: string,
  knownNames: Array<string | null | undefined>,
  participantCode?: string,
): void {
  const detectedNames: string[] = [];

  for (const name of knownNames) {
    if (!name || name.trim().length <= 2) continue;

    const trimmedName = name.trim();
    const pattern = new RegExp(`\\b${escapeRegex(trimmedName)}\\b`, 'gi');

    if (pattern.test(payload)) {
      detectedNames.push(trimmedName);
    }
  }

  if (detectedNames.length > 0) {
    // H9: Log count only, not actual names (could leak to Sentry)
    console.error(
      `[PII] known-name redaction failed: detected ${detectedNames.length} name(s) in payload`,
    );
    // Error message uses count, not names. detectedNames stored for local debugging only.
    throw new PiiRedactionError(
      `Known participant name(s) detected in payload after redaction (${detectedNames.length} found). Redaction failed - API call aborted.`,
      participantCode,
      detectedNames,  // Available in error object for local catch, NOT serialized to logs
    );
  }
}

// ---------------------------------------------------------------------------
// Re-export error for convenience
// ---------------------------------------------------------------------------

export { PiiRedactionError } from '../types/handlers';

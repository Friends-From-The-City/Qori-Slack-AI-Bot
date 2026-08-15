/**
 * Shared PII detection patterns — canonical deterministic rules.
 *
 * Used by both transcript scrubber and survey entry scrubber.
 * One implementation, one set of patterns.
 *
 * These patterns detect STRUCTURED PII only. Incidental PII
 * (names mentioned in conversation, locations, health details)
 * requires human review — these patterns cannot detect it.
 */

// Phone: various US formats
// - XXX-XXX-XXXX, (XXX) XXX-XXXX, XXX.XXX.XXXX (10 digit)
// - XXX-XXXX (7 digit local)
export const PHONE_PATTERN_10 = /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;
export const PHONE_PATTERN_7 = /\b[0-9]{3}[-.\s]?[0-9]{4}\b/g;

// Email: standard format
export const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Apply phone and email redaction to text.
 * Returns scrubbed text + detection counts.
 *
 * This is the shared implementation used by both
 * transcriptScrubber.ts and survey entryScrubber.ts.
 */
export function scrubPhoneAndEmail(text: string): {
  scrubbed: string;
  phoneCount: number;
  emailCount: number;
  detectedValues: string[];
} {
  let scrubbed = text;
  let phoneCount = 0;
  let emailCount = 0;
  const detectedValues: string[] = [];

  // Reset regex lastIndex (global flag)
  PHONE_PATTERN_10.lastIndex = 0;
  PHONE_PATTERN_7.lastIndex = 0;
  EMAIL_PATTERN.lastIndex = 0;

  scrubbed = scrubbed.replace(PHONE_PATTERN_10, (match) => {
    phoneCount++;
    detectedValues.push(match);
    return '[PHONE]';
  });
  scrubbed = scrubbed.replace(PHONE_PATTERN_7, (match) => {
    phoneCount++;
    detectedValues.push(match);
    return '[PHONE]';
  });
  scrubbed = scrubbed.replace(EMAIL_PATTERN, (match) => {
    emailCount++;
    detectedValues.push(match);
    return '[EMAIL]';
  });

  return { scrubbed, phoneCount, emailCount, detectedValues };
}

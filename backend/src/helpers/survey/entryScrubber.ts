/**
 * Survey Entry Scrubber — deterministic PII pattern detection + redaction
 * for open-text survey entries.
 *
 * Reuses phone and email regex patterns from transcriptScrubber.ts.
 * Does NOT require participant real names (survey respondents use system codes).
 *
 * Detection metadata is persisted alongside redacted text for consistency
 * verification: if a pattern was detected, the redacted text must not
 * contain the original pattern value.
 */

// Phone patterns (from transcriptScrubber.ts)
const PHONE_PATTERN_10 = /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;
const PHONE_PATTERN_7 = /\b[0-9]{3}[-.\s]?[0-9]{4}\b/g;

// Email pattern (from transcriptScrubber.ts)
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

export interface ScrubResult {
  /** Scrubbed text with patterns replaced */
  scrubbedText: string;
  /** Whether any pattern was detected */
  hasDetections: boolean;
  /** Detection counts by type */
  detections: {
    phoneCount: number;
    emailCount: number;
  };
  /** Original matched values (for consistency verification, never persisted externally) */
  detectedValues: string[];
}

/**
 * Apply deterministic PII pattern scrubbing to a survey entry.
 *
 * Replaces:
 *   Phone numbers → [PHONE]
 *   Email addresses → [EMAIL]
 *
 * @param text — raw entry text
 * @returns ScrubResult with scrubbed text and detection metadata
 */
export function scrubEntryText(text: string): ScrubResult {
  let scrubbed = text;
  let phoneCount = 0;
  let emailCount = 0;
  const detectedValues: string[] = [];

  // Phone (10-digit first, then 7-digit)
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

  // Email
  scrubbed = scrubbed.replace(EMAIL_PATTERN, (match) => {
    emailCount++;
    detectedValues.push(match);
    return '[EMAIL]';
  });

  return {
    scrubbedText: scrubbed,
    hasDetections: phoneCount > 0 || emailCount > 0,
    detections: { phoneCount, emailCount },
    detectedValues,
  };
}

/**
 * Verify consistency between detection metadata and redacted text.
 *
 * If a phone or email was detected, the redacted text must NOT contain
 * the original value. If it does, the entry is inconsistent and should
 * fail closed (remain pending).
 *
 * @param redactedText — the scrubbed or researcher-edited text
 * @param detectedValues — original matched values from scrubbing
 * @returns true if consistent (no detected values appear in redacted text)
 */
export function verifyRedactionConsistency(
  redactedText: string,
  detectedValues: string[],
): boolean {
  for (const value of detectedValues) {
    if (redactedText.includes(value)) {
      return false;
    }
  }
  return true;
}

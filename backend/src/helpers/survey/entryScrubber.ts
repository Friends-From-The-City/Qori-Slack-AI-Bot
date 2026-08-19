/**
 * Survey Entry Scrubber — deterministic PII pattern detection + redaction
 * for open-text survey entries.
 *
 * Uses shared piiPatterns.ts (canonical phone/email patterns used by
 * both transcript and survey paths — no duplicate regexes).
 *
 * Detection metadata is persisted alongside redacted text for consistency
 * verification: if a pattern was detected, the redacted text must not
 * contain the original pattern value.
 */

import { scrubPhoneAndEmail } from '../piiPatterns';

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
  // Use shared canonical phone/email scrubber (same patterns as transcriptScrubber)
  const result = scrubPhoneAndEmail(text);

  return {
    scrubbedText: result.scrubbed,
    hasDetections: result.phoneCount > 0 || result.emailCount > 0,
    detections: { phoneCount: result.phoneCount, emailCount: result.emailCount },
    detectedValues: result.detectedValues,
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

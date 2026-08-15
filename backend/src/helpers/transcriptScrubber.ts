/**
 * transcriptScrubber.ts — Upload-time PII scrubbing for transcripts
 *
 * Scrubs KNOWN/STRUCTURED PII from transcripts BEFORE storage:
 * - Participant real name (full, first, last, honorifics) → participant code (PT-XXX)
 * - Moderator name (full, first, last) → [Moderator]
 * - Speaker labels (DC:, TK:, etc.) → [Participant], [Moderator]
 * - Phone numbers → [PHONE]
 * - Email addresses → [EMAIL]
 *
 * PRIVACY GUARANTEE: The participant's real name is passed as a parameter,
 * used ONLY for in-memory string replacement, and NEVER stored anywhere
 * (no DB, no log, no temp file, no error message).
 */

// ─── Types ───────────────────────────────────────────────────────

export interface ScrubContext {
  /** Participant's real name (transient — used for scrubbing, never stored) */
  participantRealName: string;
  /** Participant code to substitute (e.g., "PT-001") */
  participantCode: string;
  /** Moderator/researcher name from session metadata */
  moderatorName?: string;
}

export interface ScrubResult {
  /** Scrubbed transcript content */
  content: string;
  /** Count of substitutions made, by type */
  stats: {
    participantName: number;
    moderatorName: number;
    speakerLabels: number;
    phoneNumbers: number;
    emailAddresses: number;
  };
  /** Warnings for human review */
  warnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract likely speaker initials from a name.
 * "David Chen" → "DC", "Taylor Kim" → "TK"
 */
function getInitials(name: string): string | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return parts.map(p => p[0]?.toUpperCase()).join('');
}

/**
 * Decompose a full name into all scrubable variants.
 * "David Chen" → ["David Chen", "David", "Chen", "Mr. Chen", "Ms. Chen", "Mr Chen", "Ms Chen"]
 */
function decomposeNameVariants(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return [];

  const variants: string[] = [];

  // Full name (highest priority - replace first)
  variants.push(fullName.trim());

  // For multi-part names, add individual parts
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];

    // First name alone (if >= 3 chars to avoid false positives)
    if (firstName.length >= 3) {
      variants.push(firstName);
    }

    // Last name alone (if >= 3 chars)
    if (lastName.length >= 3) {
      variants.push(lastName);
    }

    // Honorific + last name variants
    variants.push(`Mr. ${lastName}`);
    variants.push(`Ms. ${lastName}`);
    variants.push(`Mrs. ${lastName}`);
    variants.push(`Mr ${lastName}`);
    variants.push(`Ms ${lastName}`);
    variants.push(`Mrs ${lastName}`);
  }

  return variants;
}

// ─── Regex Patterns ──────────────────────────────────────────────

// Phone and email patterns shared with survey entry scrubber via piiPatterns.ts.
// Imported here for consistency — one canonical set of patterns.
import { PHONE_PATTERN_10, PHONE_PATTERN_7, EMAIL_PATTERN } from './piiPatterns';

// Speaker label: "XX:" at start of line or after timestamp, where XX is 2-4 uppercase letters
const SPEAKER_LABEL_PATTERN = /^(\[[^\]]+\]\s*)?([A-Z]{2,4}):\s/gm;

// ─── Main Scrubbing Function ─────────────────────────────────────

/**
 * Scrub PII from transcript content.
 *
 * PRIVACY: participantRealName is used ONLY in this function's local scope.
 * It is NEVER logged, stored, or included in any error message.
 *
 * @param content - Raw transcript content
 * @param ctx - Scrubbing context with names to replace
 * @returns Scrubbed content with statistics
 */
export function scrubTranscript(content: string, ctx: ScrubContext): ScrubResult {
  const stats = {
    participantName: 0,
    moderatorName: 0,
    speakerLabels: 0,
    phoneNumbers: 0,
    emailAddresses: 0,
  };
  const warnings: string[] = [];

  let scrubbed = content;
  const code = ctx.participantCode;

  // ── 1. Replace participant name variants ─────────────────────────
  // Order matters: replace full name first, then parts
  if (ctx.participantRealName && ctx.participantRealName.trim().length > 2) {
    const variants = decomposeNameVariants(ctx.participantRealName);

    for (const variant of variants) {
      // Context-aware replacement: avoid creating "PT-001 PT-001"
      // Pattern: replace variant but NOT when preceded by participant code
      const escapedVariant = escapeRegex(variant);
      const escapedCode = escapeRegex(code);

      // First, handle "CODE NAME" → "CODE" (remove the name, don't duplicate code)
      const codeNamePattern = new RegExp(
        `(${escapedCode})\\s+${escapedVariant}\\b`,
        'gi'
      );
      scrubbed = scrubbed.replace(codeNamePattern, (match, existingCode) => {
        stats.participantName++;
        return existingCode; // Keep just the code, remove the name
      });

      // Then, replace remaining occurrences of the name with code
      const namePattern = new RegExp(`\\b${escapedVariant}\\b`, 'gi');
      scrubbed = scrubbed.replace(namePattern, () => {
        stats.participantName++;
        return code;
      });
    }
  }

  // ── 2. Replace moderator name variants ───────────────────────────
  if (ctx.moderatorName && ctx.moderatorName.trim().length > 2) {
    const variants = decomposeNameVariants(ctx.moderatorName);

    for (const variant of variants) {
      const pattern = new RegExp(`\\b${escapeRegex(variant)}\\b`, 'gi');
      scrubbed = scrubbed.replace(pattern, () => {
        stats.moderatorName++;
        return '[Moderator]';
      });
    }
  }

  // ── 3. Replace speaker labels (XX:) ─────────────────────────────
  const participantInitials = ctx.participantRealName ? getInitials(ctx.participantRealName) : null;
  const moderatorInitials = ctx.moderatorName ? getInitials(ctx.moderatorName) : null;

  const initialsMap: Record<string, string> = {};
  if (participantInitials) {
    initialsMap[participantInitials.toUpperCase()] = '[Participant]';
  }
  if (moderatorInitials) {
    initialsMap[moderatorInitials.toUpperCase()] = '[Moderator]';
  }

  scrubbed = scrubbed.replace(SPEAKER_LABEL_PATTERN, (match, timestamp, initials) => {
    const upper = initials.toUpperCase();
    if (initialsMap[upper]) {
      stats.speakerLabels++;
      return `${timestamp || ''}${initialsMap[upper]}: `;
    }
    // Unknown speaker label — leave as-is but warn
    if (!warnings.includes('unknown_speaker_labels')) {
      warnings.push('unknown_speaker_labels');
    }
    return match;
  });

  // ── 4. Replace phone numbers ────────────────────────────────────
  // 10-digit first (more specific)
  scrubbed = scrubbed.replace(PHONE_PATTERN_10, () => {
    stats.phoneNumbers++;
    return '[PHONE]';
  });
  // Then 7-digit (local numbers)
  scrubbed = scrubbed.replace(PHONE_PATTERN_7, () => {
    stats.phoneNumbers++;
    return '[PHONE]';
  });

  // ── 5. Replace email addresses ──────────────────────────────────
  scrubbed = scrubbed.replace(EMAIL_PATTERN, () => {
    stats.emailAddresses++;
    return '[EMAIL]';
  });

  // ── 6. Add warnings for human review ────────────────────────────
  if (warnings.includes('unknown_speaker_labels')) {
    warnings.push('Transcript contains speaker labels that could not be identified. Please verify no names appear in labels.');
  }

  // Always warn about incidental PII
  warnings.push('Auto-scrub cannot detect incidental PII (names, locations, dates mentioned in conversation). Please review carefully.');

  return { content: scrubbed, stats, warnings };
}

// ─── Validation ──────────────────────────────────────────────────

/**
 * Check if scrubbed content still contains any known names.
 * Used as a sanity check before saving.
 *
 * PRIVACY: Names are checked but NEVER logged or included in errors.
 *
 * @returns Array of detection types (not the actual names)
 */
export function validateScrubbing(
  content: string,
  participantRealName: string,
  moderatorName?: string,
): string[] {
  const detected: string[] = [];

  if (participantRealName && participantRealName.trim().length > 2) {
    const variants = decomposeNameVariants(participantRealName);
    for (const variant of variants) {
      const pattern = new RegExp(`\\b${escapeRegex(variant)}\\b`, 'gi');
      if (pattern.test(content)) {
        detected.push('participant_name_variant');
        break;
      }
    }
  }

  if (moderatorName && moderatorName.trim().length > 2) {
    const variants = decomposeNameVariants(moderatorName);
    for (const variant of variants) {
      const pattern = new RegExp(`\\b${escapeRegex(variant)}\\b`, 'gi');
      if (pattern.test(content)) {
        detected.push('moderator_name_variant');
        break;
      }
    }
  }

  return detected;
}

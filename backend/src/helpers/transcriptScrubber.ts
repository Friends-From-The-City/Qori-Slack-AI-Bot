/**
 * transcriptScrubber.ts — Upload-time PII scrubbing for transcripts
 *
 * Scrubs KNOWN/STRUCTURED PII from transcripts BEFORE storage:
 * - Participant real name → participant code (PT-XXX)
 * - Moderator name → [Moderator]
 * - Speaker labels (DC:, TK:, etc.) → [Participant], [Moderator]
 * - Phone numbers → [PHONE]
 * - Email addresses → [EMAIL]
 *
 * PRIVACY GUARANTEE: The participant's real name is passed as a parameter,
 * used ONLY for in-memory string replacement, and NEVER stored anywhere
 * (no DB, no log, no temp file, no error message).
 *
 * KNOWN LIMITATIONS (v1):
 * - Speaker label detection is best-effort (handles "XX:" format, not all tools)
 * - Incidental PII (names/locations mentioned mid-transcript) requires human review
 * - First-name-only mentions may not be caught if ambiguous
 *
 * The human-review step is the backstop for anything auto-scrub misses.
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
 * Extract first name from a full name.
 * "David Chen" → "David"
 */
function getFirstName(name: string): string | null {
  const parts = name.trim().split(/\s+/);
  return parts[0] || null;
}

// ─── Regex Patterns ──────────────────────────────────────────────

// Phone: various US formats (XXX-XXX-XXXX, (XXX) XXX-XXXX, XXX.XXX.XXXX, etc.)
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;

// Email: standard format
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Speaker label: "XX:" at start of line or after timestamp, where XX is 2-4 uppercase letters
// Captures the label so we can decide if it's participant or moderator
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

  // ── 1. Replace participant full name ────────────────────────────
  if (ctx.participantRealName && ctx.participantRealName.trim().length > 2) {
    const fullName = ctx.participantRealName.trim();
    const pattern = new RegExp(`\\b${escapeRegex(fullName)}\\b`, 'gi');
    scrubbed = scrubbed.replace(pattern, () => {
      stats.participantName++;
      return ctx.participantCode;
    });

    // Also try first name with word boundary (but warn about ambiguity)
    const firstName = getFirstName(fullName);
    if (firstName && firstName.length > 2) {
      // Only replace first name when it appears in greeting patterns
      // e.g., "Hi David," "Hello David," "Thanks David"
      const greetingPattern = new RegExp(
        `\\b(Hi|Hello|Hey|Thanks|Thank you),?\\s+${escapeRegex(firstName)}\\b`,
        'gi'
      );
      scrubbed = scrubbed.replace(greetingPattern, (match, greeting) => {
        stats.participantName++;
        return `${greeting} ${ctx.participantCode}`;
      });
    }
  }

  // ── 2. Replace moderator name ───────────────────────────────────
  if (ctx.moderatorName && ctx.moderatorName.trim().length > 2) {
    const modName = ctx.moderatorName.trim();
    const pattern = new RegExp(`\\b${escapeRegex(modName)}\\b`, 'gi');
    scrubbed = scrubbed.replace(pattern, () => {
      stats.moderatorName++;
      return '[Moderator]';
    });
  }

  // ── 3. Replace speaker labels (XX:) ─────────────────────────────
  // Detect initials from the names we know
  const participantInitials = ctx.participantRealName ? getInitials(ctx.participantRealName) : null;
  const moderatorInitials = ctx.moderatorName ? getInitials(ctx.moderatorName) : null;

  // Build a map of known initials to their replacements
  const initialsMap: Record<string, string> = {};
  if (participantInitials) {
    initialsMap[participantInitials.toUpperCase()] = '[Participant]';
  }
  if (moderatorInitials) {
    initialsMap[moderatorInitials.toUpperCase()] = '[Moderator]';
  }

  // Replace known speaker labels
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
  scrubbed = scrubbed.replace(PHONE_PATTERN, () => {
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
    const pattern = new RegExp(`\\b${escapeRegex(participantRealName.trim())}\\b`, 'gi');
    if (pattern.test(content)) {
      detected.push('participant_full_name');
    }
  }

  if (moderatorName && moderatorName.trim().length > 2) {
    const pattern = new RegExp(`\\b${escapeRegex(moderatorName.trim())}\\b`, 'gi');
    if (pattern.test(content)) {
      detected.push('moderator_name');
    }
  }

  return detected;
}

/**
 * Unstructured Content Governance Service
 *
 * Domain-level privacy control for unstructured research content.
 * This service owns privacy state, disposition, audit, and the
 * analysis-eligible content accessor.
 *
 * Architecture (ADR 0032):
 *   - Privacy state and disposition logic live here, not in Slack handlers
 *   - Slack handlers are adapters that invoke this service
 *   - Raw pending content retrievable ONLY through authorized review paths
 *   - All model/analysis paths use getAnalysisEligibleContent()
 *
 * Current consumers:
 *   - Survey qualitative entries (Slice 2A)
 *
 * Future consumers (same invariant, migrate progressively):
 *   - Session transcripts
 *   - Manual notes
 *   - Uploaded source documents
 *   - /qori-ask content
 */

import type { PiiStatus, SurveyQualitativeEntry } from '../database/models/survey_qualitative_entry';

// ═══════════════════════════════════════════════════════════════════════
// ELIGIBLE CONTENT ACCESSOR
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get analysis-eligible text from a governed content record.
 *
 * This is THE controlled accessor for all model-facing paths.
 * Callers must NOT access entry_text directly.
 *
 * @returns eligible text or null (fail-closed for pending/restricted)
 */
export function getAnalysisEligibleContent(
  entry: { pii_status: PiiStatus; entry_text: string | null; redacted_text: string | null },
): string | null {
  switch (entry.pii_status) {
    case 'clear':
      return entry.entry_text;
    case 'redacted':
      return entry.redacted_text;
    case 'restricted':
      return null;
    case 'pending':
      return null;
    default:
      return null; // fail-closed for unknown states
  }
}

/**
 * Check whether a content record is eligible for analysis.
 */
export function isAnalysisEligible(piiStatus: PiiStatus): boolean {
  return piiStatus === 'clear' || piiStatus === 'redacted';
}

// ═══════════════════════════════════════════════════════════════════════
// DISPOSITION TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Valid privacy disposition transitions.
 *
 * pending → clear | redacted | restricted
 * clear → redacted | restricted (re-review)
 * redacted → clear | restricted (re-review)
 * restricted → clear | redacted (re-review)
 *
 * All transitions require reviewer identity.
 */
const VALID_TRANSITIONS: Record<PiiStatus, PiiStatus[]> = {
  pending: ['clear', 'redacted', 'restricted'],
  clear: ['redacted', 'restricted'],
  redacted: ['clear', 'restricted'],
  restricted: ['clear', 'redacted'],
};

export function isValidTransition(from: PiiStatus, to: PiiStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidDispositionError extends Error {
  constructor(from: PiiStatus, to: PiiStatus) {
    super(`Invalid privacy disposition transition: ${from} → ${to}`);
    this.name = 'InvalidDispositionError';
  }
}

/**
 * Build a disposition update payload.
 * Validates the transition and required fields.
 *
 * @throws InvalidDispositionError for invalid transitions
 * @throws Error if redacted status has empty redacted_text
 */
export function buildDispositionUpdate(
  currentStatus: PiiStatus,
  newStatus: PiiStatus,
  reviewedBy: string,
  redactedText?: string | null,
): {
  pii_status: PiiStatus;
  pii_reviewed_by: string;
  pii_reviewed_at: Date;
  redacted_text: string | null;
} {
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new InvalidDispositionError(currentStatus, newStatus);
  }

  if (newStatus === 'redacted') {
    if (!redactedText || redactedText.trim() === '') {
      throw new Error(
        'Cannot set pii_status to "redacted" with empty redacted_text. Use "restricted" to exclude the entry.',
      );
    }
  }

  return {
    pii_status: newStatus,
    pii_reviewed_by: reviewedBy,
    pii_reviewed_at: new Date(),
    redacted_text: newStatus === 'redacted' ? redactedText! : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// REVIEW COMPLETION CHECK
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check whether all entries for a source have been reviewed
 * (zero pending entries remain).
 */
export function isPrivacyReviewComplete(
  entries: Array<{ pii_status: PiiStatus }>,
): boolean {
  return entries.every(e => e.pii_status !== 'pending');
}

/**
 * Count entries by privacy status.
 */
export function countByStatus(
  entries: Array<{ pii_status: PiiStatus }>,
): Record<PiiStatus, number> {
  const counts: Record<PiiStatus, number> = {
    pending: 0,
    clear: 0,
    redacted: 0,
    restricted: 0,
  };
  for (const e of entries) {
    counts[e.pii_status] = (counts[e.pii_status] ?? 0) + 1;
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════════════════
// RAW CONTENT ACCESS AUTHORIZATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Marker type for authorized raw-content access.
 * Only privacy review surfaces should use getRawContentForReview().
 *
 * This function exists to make raw content access explicit and auditable.
 * Model/analysis paths must NEVER call this — they use
 * getAnalysisEligibleContent() instead.
 */
export function getRawContentForReview(
  entry: { entry_text: string | null; redacted_text: string | null },
): { originalText: string | null; suggestedSafeText: string | null } {
  return {
    originalText: entry.entry_text,
    suggestedSafeText: entry.redacted_text,
  };
}

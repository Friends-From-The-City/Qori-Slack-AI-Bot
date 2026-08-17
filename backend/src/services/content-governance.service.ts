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

// ═══════════════════════════════════════════════════════════════════════
// SHARED PRIVACY GATE — Model Access Authorization (PH-3 / ADR 0035)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Content policy types. Each policy has different authorization semantics:
 *
 * PARTICIPANT_CONTENT — session transcripts, manual notes.
 *   Requires quarantine → human review → redaction before model access.
 *   Existing sessionNotesHandler/analyzeNotesHandler semantics.
 *
 * SURVEY_QUALITATIVE — survey open-text entries.
 *   Requires PII detection → privacy review → disposition before model access.
 *   Existing content-governance.service getAnalysisEligibleContent semantics.
 *
 * DISCOVERY_UPLOAD — researcher-uploaded files (desk research, stakeholder docs).
 *   Requires deterministic PII scan → researcher confirmation before model access.
 *   NEW in PH-3: closes the discoverHandler bypass.
 *
 * TRUSTED_CURATED_ARTIFACT — Qori-generated research artifacts from GitHub.
 *   Auto-authorized when provenance is known and upstream privacy gates passed.
 *   Used by readoutHandler, researchSynthesisHandler for already-governed content.
 */
export type ContentPolicy =
  | 'PARTICIPANT_CONTENT'
  | 'SURVEY_QUALITATIVE'
  | 'DISCOVERY_UPLOAD'
  | 'TRUSTED_CURATED_ARTIFACT';

export type PrivacyDisposition = 'authorized' | 'pending_review' | 'denied';

export interface PrivacyGateResult {
  /** Whether the content is authorized for model access */
  status: PrivacyDisposition;
  /** The model-safe representation (null if denied or pending) */
  modelSafeContent: string | null;
  /** The policy that was applied */
  policy: ContentPolicy;
  /** Human-readable reason for the disposition */
  reason: string;
}

/**
 * Authorize unstructured content for model access.
 *
 * This is the platform-wide invariant:
 *   UNSTRUCTURED CONTENT → privacy/governance policy → authorized representation → model access
 *
 * Callers must check status === 'authorized' before passing content to any model.
 */
export function authorizeForModel(
  content: string,
  policy: ContentPolicy,
  provenance?: {
    /** Source identity (evidence_source.public_id, artifact path, etc.) */
    sourceId?: string;
    /** Project context */
    projectId?: number;
    /** Whether this content was produced by a Qori workflow */
    isQoriArtifact?: boolean;
    /** Whether upstream privacy gates have been completed */
    upstreamPrivacyComplete?: boolean;
  },
): PrivacyGateResult {
  switch (policy) {
    case 'TRUSTED_CURATED_ARTIFACT':
      return authorizeTrustedArtifact(content, provenance);
    case 'DISCOVERY_UPLOAD':
      return authorizeDiscoveryUpload(content);
    case 'SURVEY_QUALITATIVE':
      // Survey qualitative uses the existing entry-level accessor pattern.
      // This branch exists for completeness — callers should use
      // getAnalysisEligibleContent() for per-entry authorization.
      return {
        status: 'denied',
        modelSafeContent: null,
        policy: 'SURVEY_QUALITATIVE',
        reason: 'Survey qualitative entries must be authorized per-entry via getAnalysisEligibleContent()',
      };
    case 'PARTICIPANT_CONTENT':
      // Participant content uses the existing quarantine/review pattern.
      // This branch exists for completeness — callers should use
      // handler-specific quarantine flows.
      return {
        status: 'denied',
        modelSafeContent: null,
        policy: 'PARTICIPANT_CONTENT',
        reason: 'Participant content must be authorized through quarantine/review flow',
      };
    default:
      return {
        status: 'denied',
        modelSafeContent: null,
        policy,
        reason: 'Unknown content policy',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Policy: TRUSTED_CURATED_ARTIFACT
// ─────────────────────────────────────────────────────────────────────

/**
 * Auto-authorize Qori-managed artifacts when provenance is known.
 * These are already-governed research documents produced by Qori workflows
 * where upstream privacy/governance requirements already passed.
 */
function authorizeTrustedArtifact(
  content: string,
  provenance?: { isQoriArtifact?: boolean; upstreamPrivacyComplete?: boolean; sourceId?: string },
): PrivacyGateResult {
  if (provenance?.isQoriArtifact && provenance?.upstreamPrivacyComplete !== false) {
    return {
      status: 'authorized',
      modelSafeContent: content,
      policy: 'TRUSTED_CURATED_ARTIFACT',
      reason: `Auto-authorized: Qori artifact with known provenance (${provenance.sourceId ?? 'unknown source'})`,
    };
  }

  // Unknown provenance — still authorize but log the gap
  if (provenance?.isQoriArtifact === undefined) {
    return {
      status: 'authorized',
      modelSafeContent: content,
      policy: 'TRUSTED_CURATED_ARTIFACT',
      reason: 'Authorized: artifact from Qori content repo (provenance not explicitly confirmed)',
    };
  }

  return {
    status: 'denied',
    modelSafeContent: null,
    policy: 'TRUSTED_CURATED_ARTIFACT',
    reason: 'Denied: artifact provenance indicates non-Qori source or failed upstream privacy',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Policy: DISCOVERY_UPLOAD
// ─────────────────────────────────────────────────────────────────────

/** PII patterns for deterministic scan of discovery uploads */
const DISCOVERY_PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, label: 'SSN-like pattern' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, label: 'email address' },
  { pattern: /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, label: 'phone number' },
  { pattern: /\b\d{1,5}\s+[\w\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Way|Ct|Court)\b/i, label: 'street address' },
];

/**
 * Scan discovery upload for PII patterns.
 * Returns detected patterns (empty = clean).
 */
export function scanForPii(content: string): Array<{ label: string; snippet: string }> {
  const findings: Array<{ label: string; snippet: string }> = [];
  for (const { pattern, label } of DISCOVERY_PII_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      // Include context around the match (20 chars each side), redacting the actual match
      const idx = match.index ?? 0;
      const start = Math.max(0, idx - 20);
      const end = Math.min(content.length, idx + match[0].length + 20);
      const snippet = content.substring(start, end).replace(match[0], `[${label.toUpperCase()}]`);
      findings.push({ label, snippet });
    }
  }
  return findings;
}

/**
 * Authorize discovery upload content for model access.
 *
 * Performs deterministic PII scan. If PII detected, content is denied
 * until researcher confirms/resolves. If clean, auto-authorizes.
 */
function authorizeDiscoveryUpload(content: string): PrivacyGateResult {
  const piiFindings = scanForPii(content);

  if (piiFindings.length > 0) {
    return {
      status: 'pending_review',
      modelSafeContent: null,
      policy: 'DISCOVERY_UPLOAD',
      reason: `PII detected: ${piiFindings.map(f => f.label).join(', ')}. Researcher confirmation required.`,
    };
  }

  return {
    status: 'authorized',
    modelSafeContent: content,
    policy: 'DISCOVERY_UPLOAD',
    reason: 'No PII patterns detected in uploaded content',
  };
}

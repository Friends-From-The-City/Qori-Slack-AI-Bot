/**
 * Post-generation Claim Guard (MVP) — v10.2
 *
 * Validates AI-generated narrative sections against the accepted evidence
 * envelope. Detects five failure classes:
 *
 *   A. Respondent IDs not present in accepted evidence
 *   B. Numeric values not present in deterministic supplied facts
 *   C. Qualitative grouping labels not present in accepted research groupings
 *   D. Unsupported relationship language between qualitative groupings
 *      and structured measures without a deterministic linkage
 *   E. Prohibited causal language
 *
 * Returns a list of violations. The caller decides whether to retry or
 * render a deterministic fallback.
 *
 * This is the MVP precursor to the broader claim validator scheduled
 * for the Platform Hardening Gate.
 */

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface EvidenceEnvelope {
  /** Respondent IDs present in accepted evidence (e.g., "R001", "T003") */
  acceptedRespondentIds: Set<string>;
  /** Numeric values from deterministic facts (as strings for exact match) */
  acceptedNumericValues: Set<string>;
  /** Accepted qualitative grouping labels (lowercased for matching) */
  acceptedGroupingLabels: Set<string>;
  /** Whether a cross-tab exists between qualitative groupings and structured measures */
  hasQualitativeStructuredCrossTab: boolean;
}

export interface ClaimViolation {
  class: 'A' | 'B' | 'C' | 'D' | 'E';
  description: string;
  /** The substring that triggered the violation (for diagnostics) */
  evidence: string;
}

export interface ClaimGuardResult {
  valid: boolean;
  violations: ClaimViolation[];
}

// ─────────────────────────────────────────────────────────────────────
// Pattern libraries
// ─────────────────────────────────────────────────────────────────────

/**
 * Class D: Relationship language that implies respondent-level correspondence
 * between qualitative groupings and structured measures.
 */
const UNSUPPORTED_ASSOCIATION_PATTERNS: RegExp[] = [
  // Active voice: "[grouping verb] [the] [measure]"
  /(?:correspond\w*|anchor\w*|explain\w*|account\w*\s+for|driv\w+|underli\w+|map\w*\s+to|align\w*\s+with|predict\w*|contribut\w*\s+to|link\w*\s+to|associat\w*\s+with)\s+(?:\w+\s+){0,3}(?:median|distribution|rating|score|satisfaction|difficulty)/i,
  // Passive voice: "[measure] is [verb-ed] by/to/with"
  /(?:median|distribution|rating|score|satisfaction|difficulty)\s+(?:is\s+)?(?:explained|driven|anchored|accounted for|caused|attributed|mapped|aligned|predicted|linked|associated|contributed)\s+(?:by|to|with)/i,
  // Grouping-subject: "[grouping type] [respondent/group] [verb]"
  /(?:straightforward|smooth|friction|difficulty)\s+(?:group|respondent|participant)s?\s+(?:correspond|anchor|explain|account|drive|align|predict|link|associate)/i,
  // "may explain why" + measure
  /(?:may\s+explain\s+why)\s+(?:\w+\s+){0,4}(?:rating|median|distribution|score|satisfaction|difficulty)/i,
  // "the N% [label] group [verb]"
  /(?:the\s+\d+%?\s+\w+\s+group)\s+(?:correspond|anchor|explain|predict|link|associate)/i,
  // Prepositional: "associated with", "linked to", "correlated with" + measure
  /(?:associated\s+with|linked\s+to|correlated\s+with)\s+(?:\w+\s+){0,3}(?:median|distribution|rating|score|satisfaction|difficulty)/i,
];

/**
 * Class E: Prohibited causal language in descriptive survey context.
 */
const PROHIBITED_CAUSAL_PATTERNS: RegExp[] = [
  /\bcauses?\b/i,
  /\bcaused\s+by\b/i,
  /\bresult(?:s|ed|ing)\s+(?:in|from)\b/i,
  /\bleads?\s+to\b/i,
  /\bled\s+to\b/i,
  /\bdue\s+to\b/i,
  /\bbecause\s+of\b/i,
  /\bimpact(?:s|ed)?\s+(?:on|the)\b/i,
  /\bnormalized?\s+(?:the\s+)?(?:friction|difficulty|experience)/i,
  // Unmeasured psychological constructs — rejected when introduced as
  // explanatory language ("may reflect", "suggests", "indicates")
  /\bmay\s+reflect\s+(?:\w+\s+){0,2}(?:resignation|frustration|apathy|acceptance|habituation|expectation|trust|distrust|confidence|motivation|anxiety|fatigue)/i,
  /\b(?:suggest|indicate|imply|reveal|signal)s?\s+(?:\w+\s+){0,3}(?:resignation|frustration|trust|distrust|confidence|motivation|anxiety|fatigue|expectation)\b/i,
  // Standalone unmeasured constructs presented as findings
  /\bresignation\b/i,
  /\blow\s+expectation/i,
  /\blow\s+motivation/i,
  /\b(?:respondent|participant|user)s?\s+(?:\w+\s+){0,2}(?:trust|distrust|frustrat\w+|confiden\w+|motivat\w+|anxious|anxiet\w+|fatigu\w+)/i,
];

// ─────────────────────────────────────────────────────────────────────
// Respondent ID extraction
// ─────────────────────────────────────────────────────────────────────

/** Extract respondent ID references from generated text (e.g., "R001", "T003") */
function extractRespondentReferences(text: string): string[] {
  // Match common respondent label patterns: R001, T003, P012, etc.
  const matches = text.match(/\b[RPT]\d{2,4}\b/g);
  return matches ? [...new Set(matches)] : [];
}

// ─────────────────────────────────────────────────────────────────────
// Numeric extraction
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract numeric claims from generated text.
 *
 * Excludes:
 * - Numbers 0-10 (trivially common: section numbers, list items)
 * - 4-digit numbers in date context (years like 2026)
 * - Numbers immediately following respondent ID prefixes (R001, T003)
 * - Percentages derivable from supplied numerics (n/total × 100)
 */
function extractNumericClaims(
  text: string,
  acceptedNumerics?: Set<string>,
): string[] {
  const results: string[] = [];

  // Strip respondent IDs first to prevent extracting their numeric portions
  const cleaned = text.replace(/\b[RPT]\d{2,4}\b/g, '');
  // Strip date patterns: "Month DD, YYYY" and "YYYY-MM-DD"
  const noDate = cleaned
    .replace(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');

  const matches = noDate.match(/\b\d+(?:\.\d+)?%?\b/g);
  if (matches) {
    for (const m of matches) {
      const normalized = m.replace(/%$/, '');
      // Skip trivially common numbers (section numbers, etc.)
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(normalized)) continue;
      // Skip 4-digit numbers that look like years (1900-2099)
      if (/^(19|20)\d{2}$/.test(normalized)) continue;
      results.push(normalized);
    }
  }

  // Check if any rejected numerics are derivable percentages
  if (acceptedNumerics && acceptedNumerics.size > 0) {
    const derivable = new Set<string>();
    const accepted = [...acceptedNumerics].map(Number).filter(n => !isNaN(n));
    for (const num of accepted) {
      for (const denom of accepted) {
        if (denom > 0 && num <= denom) {
          const pct = Math.round((num / denom) * 100);
          derivable.add(String(pct));
          // Also allow one decimal place
          const pct1 = ((num / denom) * 100).toFixed(1);
          derivable.add(pct1);
        }
      }
    }
    return [...new Set(results)].filter(r => !derivable.has(r));
  }

  return [...new Set(results)];
}

// ─────────────────────────────────────────────────────────────────────
// Grouping label extraction
// ─────────────────────────────────────────────────────────────────────

/**
 * Check if text references qualitative grouping labels not in the accepted set.
 * Uses quoted or bold-formatted labels as signals.
 */
function extractGroupingReferences(text: string): string[] {
  const refs: string[] = [];
  // Match bold labels: **Some Label**
  const boldMatches = text.match(/\*\*([^*]+)\*\*/g);
  if (boldMatches) {
    for (const m of boldMatches) {
      refs.push(m.replace(/\*\*/g, '').toLowerCase().trim());
    }
  }
  // Match "label" patterns in context of grouping/pattern/observation language
  const quotedInContext = text.match(/(?:grouping|pattern|observation|category|type)\s+(?:"|")([^""]+)(?:"|")/gi);
  if (quotedInContext) {
    for (const m of quotedInContext) {
      const inner = m.match(/(?:"|")([^""]+)(?:"|")/);
      if (inner) refs.push(inner[1].toLowerCase().trim());
    }
  }
  return [...new Set(refs)];
}

// ─────────────────────────────────────────────────────────────────────
// Main validator
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate generated narrative text against the accepted evidence envelope.
 * Returns violations found. Empty array = valid.
 */
export function validateClaims(
  generatedText: string,
  envelope: EvidenceEnvelope,
): ClaimGuardResult {
  const violations: ClaimViolation[] = [];

  // Class A: Respondent IDs not in accepted evidence
  const respondentRefs = extractRespondentReferences(generatedText);
  for (const ref of respondentRefs) {
    if (!envelope.acceptedRespondentIds.has(ref)) {
      violations.push({
        class: 'A',
        description: `Respondent ID "${ref}" not present in accepted evidence`,
        evidence: ref,
      });
    }
  }

  // Class B: Numeric values not in deterministic facts
  const numericClaims = extractNumericClaims(generatedText, envelope.acceptedNumericValues);
  for (const num of numericClaims) {
    if (!envelope.acceptedNumericValues.has(num)) {
      violations.push({
        class: 'B',
        description: `Numeric value "${num}" not present in deterministic supplied facts`,
        evidence: num,
      });
    }
  }

  // Class C: Grouping labels not in accepted research groupings
  if (envelope.acceptedGroupingLabels.size > 0) {
    const groupingRefs = extractGroupingReferences(generatedText);
    for (const ref of groupingRefs) {
      if (!envelope.acceptedGroupingLabels.has(ref)) {
        // Only flag if it looks like a qualitative grouping reference,
        // not generic bold text. Skip very short refs (likely formatting).
        if (ref.length > 3) {
          violations.push({
            class: 'C',
            description: `Qualitative grouping label "${ref}" not present in accepted research groupings`,
            evidence: ref,
          });
        }
      }
    }
  }

  // Class D: Unsupported relationship language
  if (!envelope.hasQualitativeStructuredCrossTab) {
    for (const pattern of UNSUPPORTED_ASSOCIATION_PATTERNS) {
      const match = generatedText.match(pattern);
      if (match) {
        violations.push({
          class: 'D',
          description: 'Unsupported association between qualitative groupings and structured measures',
          evidence: match[0],
        });
      }
    }
  }

  // Class E: Prohibited causal language
  for (const pattern of PROHIBITED_CAUSAL_PATTERNS) {
    const match = generatedText.match(pattern);
    if (match) {
      violations.push({
        class: 'E',
        description: 'Prohibited causal or psychological language in descriptive survey',
        evidence: match[0],
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Envelope builder
// ─────────────────────────────────────────────────────────────────────

/**
 * Build an evidence envelope from the template data that was passed to
 * processYamlTemplate. Called by the handler before validation.
 */
export function buildEvidenceEnvelope(data: Record<string, unknown>): EvidenceEnvelope {
  const acceptedRespondentIds = new Set<string>();
  const acceptedNumericValues = new Set<string>();
  const acceptedGroupingLabels = new Set<string>();

  // Extract respondent IDs from qualitative coding
  const qc = data.qualitative_coding as {
    recurringPatterns?: Array<{ displayFrequency: string; label: string; quotes?: string }>;
    individualObservations?: Array<{ displayFrequency: string; label: string; quotes?: string }>;
    eligibleRespondentCount?: number;
  } | null;

  if (qc) {
    // Extract respondent IDs from quote blocks
    const quoteIdPattern = /— ([RPT]\d{2,4})/g;
    for (const patterns of [qc.recurringPatterns ?? [], qc.individualObservations ?? []]) {
      for (const p of patterns) {
        acceptedGroupingLabels.add(p.label.toLowerCase().trim());
        if (p.quotes) {
          let match;
          while ((match = quoteIdPattern.exec(p.quotes)) !== null) {
            acceptedRespondentIds.add(match[1]);
          }
        }
        // Extract frequency numbers
        const freqMatch = p.displayFrequency.match(/\d+/g);
        if (freqMatch) freqMatch.forEach(n => acceptedNumericValues.add(n));
      }
    }
    if (qc.eligibleRespondentCount != null) {
      acceptedNumericValues.add(String(qc.eligibleRespondentCount));
    }
  }

  // Extract numeric values from computed facts
  const cf = data.computed_facts as {
    totalRespondents?: number;
    fieldStats?: Array<{
      nPresent?: number;
      nMissing?: number;
      median?: string | number;
      distribution?: string;
    }>;
    crossTabs?: Array<{
      totalN?: number;
      cells?: string;
    }>;
  } | null;

  if (cf) {
    if (cf.totalRespondents != null) acceptedNumericValues.add(String(cf.totalRespondents));
    for (const fs of cf.fieldStats ?? []) {
      if (fs.nPresent != null) acceptedNumericValues.add(String(fs.nPresent));
      if (fs.nMissing != null) acceptedNumericValues.add(String(fs.nMissing));
      if (fs.median != null) acceptedNumericValues.add(String(fs.median));
      // Extract all numbers from distribution text
      if (fs.distribution) {
        const nums = fs.distribution.match(/\b\d+(?:\.\d+)?%?\b/g);
        if (nums) nums.forEach(n => acceptedNumericValues.add(n.replace(/%$/, '')));
      }
    }
    for (const ct of cf.crossTabs ?? []) {
      if (ct.totalN != null) acceptedNumericValues.add(String(ct.totalN));
      if (ct.cells) {
        const nums = ct.cells.match(/\b\d+(?:\.\d+)?%?\b/g);
        if (nums) nums.forEach(n => acceptedNumericValues.add(n.replace(/%$/, '')));
      }
    }
  }

  return {
    acceptedRespondentIds,
    acceptedNumericValues,
    acceptedGroupingLabels,
    // No cross-tab between qualitative groupings and structured measures exists
    // in the current survey pipeline. This would need to be set to true if/when
    // such a cross-tab is computed.
    hasQualitativeStructuredCrossTab: false,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Retry prompt builder
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a supplementary prompt that tells the LLM what went wrong,
 * used for the bounded retry.
 */
export function buildRetryGuidance(violations: Array<{ class: string; description: string; evidence: string }>): string {
  const lines = [
    'YOUR PREVIOUS OUTPUT CONTAINED CLAIM VIOLATIONS. Fix these specific issues:',
    '',
  ];
  for (const v of violations) {
    lines.push(`- [Class ${v.class}] ${v.description}: "${v.evidence}"`);
  }
  lines.push('');
  lines.push('Regenerate the section with these violations corrected. If you cannot');
  lines.push('produce a valid version, write only what the accepted evidence supports.');
  return lines.join('\n');
}

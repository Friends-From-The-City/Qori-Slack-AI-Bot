/**
 * Post-generation Claim Guard (MVP) — v10.2
 *
 * TRANSITIONAL SAFETY NET. This regex/pattern-based post-prose validator
 * is a temporary measure. The Platform Hardening Gate will replace it with:
 *
 *   Canonical Evidence → Structured Claim Plan → deterministic claim
 *   validation → validated claims → narrative rendering
 *
 * Do not add new semantic/regex classes beyond A–H. Invest in the
 * structured claim pipeline instead.
 *
 * Current classes:
 *   A. Respondent IDs not present in accepted evidence
 *   B. Numeric values not present in deterministic supplied facts
 *   C. Qualitative grouping labels not present in accepted research groupings
 *   D. Unsupported relationship language (qualitative ↔ structured)
 *   E. Prohibited causal / psychological language
 *   F. False absence claims about supplied deterministic evidence
 *   G. Skew/balance claims from median only
 *   H. Structured fact contradiction (nonzero category claimed absent)
 *
 * Returns a list of violations. The caller decides whether to retry or
 * render a deterministic fallback.
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
  /** Cross-tab labels that ARE available (e.g., "Completion Status × Overall Satisfaction") */
  availableCrossTabs: string[];
  /** Whether a median is the only central tendency available (no skew computation) */
  hasOnlyMedian: boolean;
  /** Known nonzero categorical values: lowercased label → count. Used for contradiction detection. */
  knownCategories: Map<string, number>;
}

export interface ClaimViolation {
  class: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
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
 *
 * Targets substantive causal claims where one research variable/grouping
 * is asserted to produce/change another outcome. Does NOT target
 * methodological limitation language (e.g., "limits confidence",
 * "prevents causal inference", "cannot determine").
 */
const PROHIBITED_CAUSAL_PATTERNS: RegExp[] = [
  // Substantive causal claims: [variable/grouping] caused/led to [outcome]
  /\bcaused\s+(?!by\b)(?:\w+\s+){0,3}(?:abandonment|completion|dissatisfaction|satisfaction|difficulty|failure|success)/i,
  /\bcaused\s+by\s+(?:\w+\s+){0,3}(?:confusion|friction|complexity|uncertainty|difficulty)/i,
  /\bresulted\s+in\s+(?:\w+\s+){0,3}(?:completion|abandonment|satisfaction|dissatisfaction|failure|success)/i,
  /\bled\s+to\s+(?:\w+\s+){0,3}(?:lower|higher|increased|decreased|more|less|greater|reduced)/i,
  /\bdrove\s+(?:\w+\s+){0,3}(?:dissatisfaction|satisfaction|abandonment|completion)/i,
  /\bnormalized?\s+(?:the\s+)?(?:friction|difficulty|experience)/i,
  // Unmeasured psychological constructs as explanatory language
  /\bmay\s+reflect\s+(?:\w+\s+){0,2}(?:resignation|frustration|apathy|acceptance|habituation|expectation|trust|distrust|confidence|motivation|anxiety|fatigue)/i,
  /\b(?:suggest|indicate|imply|reveal|signal)s?\s+(?:\w+\s+){0,3}(?:resignation|frustration|trust|distrust|confidence|motivation|anxiety|fatigue|expectation)\b/i,
  // Standalone unmeasured constructs presented as findings
  /\bresignation\b/i,
  /\blow\s+expectation/i,
  /\blow\s+motivation/i,
  /\b(?:respondent|participant|user)s?\s+(?:\w+\s+){0,2}(?:trust|distrust|frustrat\w+|confiden\w+|motivat\w+|anxious|anxiet\w+|fatigu\w+)/i,
];

/**
 * Class F: False absence claims about supplied deterministic evidence.
 *
 * Validates AGAINST capability flags — only rejects when the capability
 * flag says a structure IS present but the text claims it's absent.
 *
 * True limitation statements (e.g., "no qualitative × structured cross-tab")
 * are allowed when the capability flag confirms the structure is absent.
 *
 * Implementation is in validateClaims, not pattern-based.
 */

/**
 * Class G: Skew/balance claims derived only from median.
 * A neutral median does not establish absence of skew.
 */
const UNSUPPORTED_SKEW_PATTERNS: RegExp[] = [
  /\bno\s+skew\b/i,
  /\bwithout\s+skew\b/i,
  /\bbalanced\s+distribution/i,
  /\bevenly\s+distributed/i,
  /\bsymmetric(?:al)?\s+(?:distribution|spread|pattern)/i,
  /\bno\s+(?:clear\s+)?(?:positive|negative)\s+skew/i,
  /\bskew(?:ed)?\s+toward\s+neither/i,
  /\bnot\s+skew/i,
];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Escape special regex characters in a string for use in RegExp constructor */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
 * Document structure labels that should NOT be treated as qualitative groupings.
 * These are headings, table labels, callout labels, and other structural elements.
 */
const DOCUMENT_STRUCTURE_LABELS = new Set([
  'suggested research approach',
  'suggested research approach:',
  'what this source establishes',
  'where it stops',
  'evidence gaps',
  'executive summary',
  'what this means',
  'what respondents described',
  'research context',
  'analysis details',
  'method & provenance',
  'recurring patterns',
  'individual observations',
  'structured evidence',
  'view structured evidence',
  'cross-tabulations',
  'analysis authority',
  'privacy review',
  'qualitative method',
  'grouping review',
  'match review',
  'aggregation',
  'computation',
  'generation',
  'integrity',
  'source',
  'schema',
  'note',
  'tip',
  'warning',
]);

/**
 * Check if text references qualitative grouping labels not in the accepted set.
 * Uses bold-formatted labels as signals, excluding document structure elements.
 */
function extractGroupingReferences(text: string): string[] {
  const refs: string[] = [];
  // Match bold labels: **Some Label**
  const boldMatches = text.match(/\*\*([^*]+)\*\*/g);
  if (boldMatches) {
    for (const m of boldMatches) {
      const label = m.replace(/\*\*/g, '').toLowerCase().trim().replace(/:$/, '');
      // Skip document structure labels
      if (DOCUMENT_STRUCTURE_LABELS.has(label)) continue;
      if (DOCUMENT_STRUCTURE_LABELS.has(label + ':')) continue;
      // Skip labels that end with colon (likely headings/callouts)
      if (m.replace(/\*\*/g, '').trim().endsWith(':')) continue;
      refs.push(label);
    }
  }
  // Match "label" patterns in context of grouping/pattern/observation language
  const quotedInContext = text.match(/(?:grouping|pattern|observation|category|type)\s+(?:"|"\u201c)([^""\u201d]+)(?:"|"\u201d)/gi);
  if (quotedInContext) {
    for (const m of quotedInContext) {
      const inner = m.match(/(?:"|"\u201c)([^""\u201d]+)(?:"|"\u201d)/);
      if (inner) {
        const label = inner[1].toLowerCase().trim();
        if (!DOCUMENT_STRUCTURE_LABELS.has(label)) {
          refs.push(label);
        }
      }
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

  // Class F: False absence claims — validated against capability flags.
  // Only flags claims that a SUPPLIED structure is absent.
  // True limitations (e.g., "no qualitative × structured cross-tab") pass.
  if (envelope.availableCrossTabs.length > 0) {
    const textLower = generatedText.toLowerCase();
    for (const ct of envelope.availableCrossTabs) {
      const ctLower = ct.toLowerCase();
      // Extract the field names from "Field A × Field B"
      const parts = ctLower.split(/\s*×\s*/);
      if (parts.length === 2) {
        // Check if text claims this specific cross-tab is absent/missing/unavailable
        const fieldA = parts[0].trim();
        const fieldB = parts[1].trim();
        // Look for absence language near mentions of both fields
        const absenceNearFields = new RegExp(
          `(?:no|without|missing|unavailable|absent|lacking|do\\s+not)\\s+(?:\\w+\\s+){0,5}(?:${escapeRegex(fieldA)}|${escapeRegex(fieldB)})\\s*(?:×|x|cross|\\*)\\s*(?:\\w+\\s+){0,3}(?:${escapeRegex(fieldA)}|${escapeRegex(fieldB)})`,
          'i',
        );
        const match = generatedText.match(absenceNearFields);
        if (match) {
          violations.push({
            class: 'F',
            description: `False absence claim: ${ct} cross-tab IS available but text claims otherwise`,
            evidence: match[0],
          });
        }
      }
    }
    // Also check for blanket "no cell-level values" when cell-level cross-tabs exist
    const blanketAbsence = generatedText.match(
      /(?:do\s+not|don'?t|does\s+not|doesn'?t)\s+(?:supply|provide|include)\s+(?:\w+\s+){0,3}(?:cell-?level|deterministic\s+cell)/i,
    );
    if (blanketAbsence) {
      violations.push({
        class: 'F',
        description: 'False absence claim: cell-level cross-tab values ARE available',
        evidence: blanketAbsence[0],
      });
    }
  }

  // Class G: Skew/balance claims from median only
  if (envelope.hasOnlyMedian) {
    for (const pattern of UNSUPPORTED_SKEW_PATTERNS) {
      const match = generatedText.match(pattern);
      if (match) {
        violations.push({
          class: 'G',
          description: 'Unsupported skew/balance claim — median alone does not establish distribution shape',
          evidence: match[0],
        });
      }
    }
  }

  // Class H: Structured fact contradiction — claims absence/zero for a
  // category that has a known nonzero count in deterministic facts.
  if (envelope.knownCategories.size > 0) {
    const textLower = generatedText.toLowerCase();
    for (const [category, count] of envelope.knownCategories) {
      if (count === 0) continue; // only check nonzero categories
      // Check for absence/unknown claims about this category
      const absencePatterns = [
        new RegExp(`(?:unknown|unclear|uncertain)\\s+(?:\\w+\\s+){0,5}${escapeRegex(category)}`, 'i'),
        new RegExp(`(?:whether|if)\\s+(?:any\\s+)?(?:\\w+\\s+){0,3}${escapeRegex(category)}\\s+(?:\\w+\\s+){0,3}(?:represented|included|present|exist|captured)`, 'i'),
        new RegExp(`(?:no|zero|without|absent|lacking)\\s+(?:\\w+\\s+){0,3}${escapeRegex(category)}`, 'i'),
        new RegExp(`${escapeRegex(category)}\\s+(?:\\w+\\s+){0,3}(?:not\\s+(?:represented|included|present|captured|recorded))`, 'i'),
        new RegExp(`(?:does\\s+not|do\\s+not|doesn'?t|don'?t)\\s+(?:\\w+\\s+){0,3}(?:include|contain|capture|represent)\\s+(?:\\w+\\s+){0,3}${escapeRegex(category)}`, 'i'),
      ];
      for (const pattern of absencePatterns) {
        const match = textLower.match(pattern);
        if (match) {
          violations.push({
            class: 'H',
            description: `Fact contradiction: "${category}" has ${count} respondents in deterministic facts but text claims absence/unknown`,
            evidence: match[0],
          });
          break; // one violation per category is enough
        }
      }
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
      displayName?: string;
      nPresent?: number;
      nMissing?: number;
      median?: string | number;
      distribution?: string;
    }>;
    crossTabs?: Array<{
      totalN?: number;
      cells?: string;
      rowDisplayName?: string;
      colDisplayName?: string;
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

  // Extract available cross-tab labels
  const availableCrossTabs: string[] = [];
  if (cf?.crossTabs) {
    for (const ct of cf.crossTabs) {
      if (ct.rowDisplayName && ct.colDisplayName) {
        availableCrossTabs.push(`${ct.rowDisplayName} × ${ct.colDisplayName}`);
      }
    }
  }
  // Also check structured_evidence_capabilities if present
  const sec = data.structured_evidence_capabilities as {
    available_cross_tabs?: string[];
  } | null;
  if (sec?.available_cross_tabs) {
    for (const ct of sec.available_cross_tabs) {
      if (!availableCrossTabs.includes(ct)) availableCrossTabs.push(ct);
    }
  }

  // hasOnlyMedian: true when any field has a median but no computed skew
  // (the survey pipeline doesn't compute skew, so this is always true when medians exist)
  const hasOnlyMedian = (cf?.fieldStats ?? []).some(fs => fs.median != null);

  // Extract known nonzero categorical values from distribution tables.
  // Used by Class H to detect contradiction claims (e.g., claiming "Abandoned"
  // respondents are absent when the distribution shows Abandoned = 2).
  const knownCategories = new Map<string, number>();
  for (const fs of cf?.fieldStats ?? []) {
    if (fs.distribution) {
      // Parse markdown table rows: "| Value | Count |"
      const rows = fs.distribution.match(/\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/g);
      if (rows) {
        for (const row of rows) {
          const match = row.match(/\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/);
          if (match) {
            const label = match[1].trim();
            const count = parseInt(match[2], 10);
            // Skip header rows and zero counts
            if (label.toLowerCase() !== 'value' && label !== '---' && count > 0) {
              knownCategories.set(label.toLowerCase(), count);
            }
          }
        }
      }
    }
  }

  return {
    acceptedRespondentIds,
    acceptedNumericValues,
    acceptedGroupingLabels,
    hasQualitativeStructuredCrossTab: false,
    availableCrossTabs,
    hasOnlyMedian,
    knownCategories,
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

// ─────────────────────────────────────────────────────────────────────
// Deterministic evidence-gaps fallback
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a deterministic evidence-gaps fallback from structural limitations
 * known from template/computed state. Used when AI-generated gaps fail
 * validation twice.
 *
 * Only includes gaps whose preconditions are known from the data dictionary.
 * Does NOT invent examples, raw observations, or new findings.
 */
export function buildDeterministicEvidenceGaps(
  data: Record<string, unknown>,
): string {
  const gaps: string[] = [];
  let gapNum = 1;

  const sec = data.structured_evidence_capabilities as {
    has_qualitative_structured_cross_tabs?: boolean;
    available_cross_tabs?: string[];
    sample_size?: number;
    has_population_representativeness?: boolean;
    has_process_sequence_data?: boolean;
  } | null;

  const hasAccepted = data.has_accepted_coding === true;

  // Gap 1: No qualitative ↔ structured cross-tabs
  if (hasAccepted && sec && !sec.has_qualitative_structured_cross_tabs) {
    gaps.push(
      `### Gap ${gapNum}: Can accepted qualitative groupings be linked to structured outcomes?\n\n` +
      '| What this source establishes | Where it stops |\n' +
      '|:-----------------------------|:---------------|\n' +
      '| Accepted qualitative groupings and structured distributions are both available | ' +
      'No deterministic cross-tab links qualitative groupings to completion status, satisfaction, or difficulty |\n\n' +
      '> [!TIP]\n' +
      '> **Suggested research approach:** Compute respondent-level cross-tabulation between qualitative grouping membership and structured measures.',
    );
    gapNum++;
  }

  // Gap 2: Sample size without population representativeness
  if (sec && sec.sample_size != null && !sec.has_population_representativeness) {
    gaps.push(
      `### Gap ${gapNum}: Can findings be generalized to the broader population?\n\n` +
      '| What this source establishes | Where it stops |\n' +
      '|:-----------------------------|:---------------|\n' +
      `| Survey captured ${sec.sample_size} respondents | ` +
      'No population-representativeness information is available, so findings cannot be generalized |\n\n' +
      '> [!TIP]\n' +
      '> **Suggested research approach:** Compare sample demographics against known population parameters, or conduct follow-up with a probability sample.',
    );
    gapNum++;
  }

  // Gap 3: No process-sequence data
  if (sec && !sec.has_process_sequence_data && hasAccepted) {
    gaps.push(
      `### Gap ${gapNum}: At what point in the process does each type of friction occur?\n\n` +
      '| What this source establishes | Where it stops |\n' +
      '|:-----------------------------|:---------------|\n' +
      '| Accepted qualitative groupings identify types of friction | ' +
      'The survey does not capture step-level process sequence, so the exact point where each friction type occurs cannot be established |\n\n' +
      '> [!TIP]\n' +
      '> **Suggested research approach:** Conduct task-analysis sessions or add process-step questions to the survey instrument.',
    );
    gapNum++;
  }

  if (gaps.length === 0) {
    return 'No structural evidence gaps could be determined from the available data.';
  }

  return gaps.join('\n\n---\n\n');
}

// ─────────────────────────────────────────────────────────────────────
// Deterministic interpretation fallback
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a deterministic "What This Means" interpretation from validated state.
 * Used when AI-generated interpretation fails validation twice.
 *
 * Assembles a publication-quality narrative from:
 * - computed_facts (respondent count, medians, field stats)
 * - accepted qualitative grouping labels and counts
 * - cross-tab capability flags
 * - sample size / methodological limitations
 *
 * No model call. No raw text. No unsupported associations.
 */
export function buildDeterministicInterpretation(
  data: Record<string, unknown>,
): string {
  const paragraphs: string[] = [];

  const cf = data.computed_facts as {
    totalRespondents?: number;
    fieldStats?: Array<{
      displayName?: string;
      role?: string;
      median?: string | number | null;
      nPresent?: number;
    }>;
    crossTabs?: Array<{
      rowDisplayName?: string;
      colDisplayName?: string;
    }>;
  } | null;

  const qc = data.qualitative_coding as {
    recurringPatterns?: Array<{ label: string; displayFrequency: string }>;
    individualObservations?: Array<{ label: string; displayFrequency: string }>;
  } | null;

  const sec = data.structured_evidence_capabilities as {
    has_qualitative_structured_cross_tabs?: boolean;
    available_cross_tabs?: string[];
    sample_size?: number;
  } | null;

  const respondentCount = cf?.totalRespondents ?? sec?.sample_size ?? 0;

  // Paragraph 1: Structured evidence summary
  const mediansDescribed: string[] = [];
  for (const fs of cf?.fieldStats ?? []) {
    if (fs.median != null && fs.displayName) {
      mediansDescribed.push(`${fs.displayName} of ${fs.median}`);
    }
  }

  if (mediansDescribed.length > 0) {
    paragraphs.push(
      `The structured results show median ${mediansDescribed.join(' and ')} ` +
      `across ${respondentCount} respondents.` +
      (cf?.crossTabs && cf.crossTabs.length > 0
        ? ` Cross-tabulations are available for ${cf.crossTabs.map(ct => `${ct.rowDisplayName} × ${ct.colDisplayName}`).join(' and ')}.`
        : ''),
    );
  } else if (respondentCount > 0) {
    paragraphs.push(
      `The survey captured ${respondentCount} respondents with structured distributions available for each measured field.`,
    );
  }

  // Paragraph 2: Accepted qualitative evidence
  const allGroupings: string[] = [];
  for (const p of qc?.recurringPatterns ?? []) {
    allGroupings.push(`${p.label.toLowerCase()} (${p.displayFrequency})`);
  }
  for (const p of qc?.individualObservations ?? []) {
    allGroupings.push(`${p.label.toLowerCase()} (${p.displayFrequency})`);
  }

  if (allGroupings.length > 0) {
    paragraphs.push(
      `Separately, accepted qualitative evidence includes ${allGroupings.length} ` +
      `grouping${allGroupings.length === 1 ? '' : 's'}: ` +
      formatList(allGroupings) + '.',
    );
  }

  // Paragraph 3: Cross-evidence boundary
  if (allGroupings.length > 0 && mediansDescribed.length > 0) {
    const unavailableCrossTabs = sec?.has_qualitative_structured_cross_tabs === false;
    if (unavailableCrossTabs) {
      paragraphs.push(
        'These bodies of evidence describe different aspects of the experience ' +
        'and should not be treated as respondent-level associations. No deterministic ' +
        'cross-tab links accepted qualitative groupings to completion status, ' +
        'satisfaction, or difficulty ratings.',
      );
    }
  }

  // Paragraph 4: Methodological limitation
  if (respondentCount > 0) {
    paragraphs.push(
      `The sample contains ${respondentCount} respondent${respondentCount === 1 ? '' : 's'}, ` +
      'so findings should remain descriptive and hypothesis-generating rather than ' +
      'representative of the broader population.',
    );
  }

  if (paragraphs.length === 0) {
    return 'Structured and qualitative evidence are available in this report for independent review.';
  }

  return paragraphs.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────
// Deterministic executive summary fallback
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a deterministic executive summary from validated state.
 * Used when AI-generated executive summary fails validation twice.
 *
 * Reads as a concise research narrative — not a fact dump.
 * No model call. No raw text. No unsupported associations.
 */
export function buildDeterministicExecutiveSummary(
  data: Record<string, unknown>,
): string {
  const paragraphs: string[] = [];

  const cf = data.computed_facts as {
    totalRespondents?: number;
    fieldStats?: Array<{
      displayName?: string;
      role?: string;
      median?: string | number | null;
      nPresent?: number;
      distribution?: string;
    }>;
    crossTabs?: Array<{
      rowDisplayName?: string;
      colDisplayName?: string;
      totalN?: number;
    }>;
  } | null;

  const qc = data.qualitative_coding as {
    recurringPatterns?: Array<{ label: string; displayFrequency: string }>;
    individualObservations?: Array<{ label: string; displayFrequency: string }>;
  } | null;

  const respondentCount = cf?.totalRespondents ?? 0;

  // Paragraph 1: Main structured outcome
  const mediansDescribed: string[] = [];
  for (const fs of cf?.fieldStats ?? []) {
    if (fs.median != null && fs.displayName) {
      mediansDescribed.push(`${fs.displayName} of ${fs.median}`);
    }
  }

  if (respondentCount > 0 && mediansDescribed.length > 0) {
    paragraphs.push(
      `A survey of ${respondentCount} respondents produced median ` +
      `${mediansDescribed.join(' and ')}. ` +
      `Full value distributions and ${cf?.crossTabs?.length ?? 0} cross-tabulation${(cf?.crossTabs?.length ?? 0) === 1 ? '' : 's'} are available in the structured evidence section.`,
    );
  } else if (respondentCount > 0) {
    paragraphs.push(
      `A survey of ${respondentCount} respondents produced structured distributions for each measured field, available in the structured evidence section.`,
    );
  }

  // Paragraph 2: Qualitative patterns
  const recurring = qc?.recurringPatterns ?? [];
  const individual = qc?.individualObservations ?? [];
  if (recurring.length > 0 || individual.length > 0) {
    const parts: string[] = [];
    if (recurring.length > 0) {
      const labels = recurring.map(p => `${p.label.toLowerCase()} (${p.displayFrequency})`);
      parts.push(`${recurring.length} recurring pattern${recurring.length === 1 ? '' : 's'}: ${formatList(labels)}`);
    }
    if (individual.length > 0) {
      const labels = individual.map(p => p.label.toLowerCase());
      parts.push(`${individual.length} individual observation${individual.length === 1 ? '' : 's'}: ${formatList(labels)}`);
    }
    paragraphs.push(
      `Accepted qualitative coding identified ${parts.join('; and ')}.`,
    );
  }

  // Paragraph 3: Limitation
  if (respondentCount > 0) {
    paragraphs.push(
      `With ${respondentCount} respondents and no population-representativeness data, these findings are descriptive. ` +
      'Qualitative groupings and structured measures describe different aspects of the experience and have not been linked at the respondent level.',
    );
  }

  if (paragraphs.length === 0) {
    return 'Structured and qualitative evidence are available in this report.';
  }

  return paragraphs.join('\n\n');
}

/**
 * Format a list with Oxford comma: "a, b, and c"
 */
function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}

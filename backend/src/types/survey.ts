/**
 * Survey domain types for Slice 1: structured CSV ingestion.
 *
 * These types define the boundary between the CSV parser, schema inference,
 * stats engine, and evidence persistence. Parser-library-specific structures
 * do not leak beyond csvParser.ts.
 */

// ═══════════════════════════════════════════════════════════════════════
// FIELD ROLES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Supported survey field roles per discovery-survey-spec-rev3.
 *
 * - id: Respondent identifier
 * - nominal: Unordered categorical (e.g., department, role)
 * - ordinal: Ordered categorical (e.g., satisfaction scale) — requires confirmed order
 * - continuous: Numeric measurement
 * - multi_select: Comma-separated or delimited multi-choice
 * - open_text: Free-text response
 * - timestamp: Date/time value
 */
export type SurveyFieldRole =
  | 'id'
  | 'nominal'
  | 'ordinal'
  | 'continuous'
  | 'multi_select'
  | 'open_text'
  | 'timestamp';

// ═══════════════════════════════════════════════════════════════════════
// PARSED SURVEY
// ═══════════════════════════════════════════════════════════════════════

/** Output of the CSV parser — library-independent representation. */
export interface ParsedSurvey {
  sourceFilename: string;
  headers: string[];
  rows: SurveyRow[];
  rowCount: number;
  parseWarnings: string[];
}

/** A single survey row keyed by header name. */
export interface SurveyRow {
  /** Values keyed by header name. Empty cells are empty strings. */
  values: Record<string, string>;
  /** 0-based index in the parsed output order (for respondent identity). */
  rowIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════
// SURVEY FIELD (schema inference output)
// ═══════════════════════════════════════════════════════════════════════

export interface SurveyField {
  fieldName: string;
  inferredRole: SurveyFieldRole;
  /** First N non-empty distinct values for researcher review. */
  sampleValues: string[];
  distinctCount: number;
  presentCount: number;
  missingCount: number;
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIRMED FIELD SCHEMA (after researcher review)
// ═══════════════════════════════════════════════════════════════════════

export interface ConfirmedField {
  fieldName: string;
  confirmedRole: SurveyFieldRole;
  /** For ordinal fields: researcher-confirmed category order. */
  orderMetadata: string[] | null;
  /** Whether the field is demographic (for potential sample_demographics projection). */
  isDemographic: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// RESPONDENT IDENTITY
// ═══════════════════════════════════════════════════════════════════════

export interface RespondentIdentity {
  /** Canonical identity — either declared ID value or SHA-256 derived key. */
  canonicalKey: string;
  /** Human-facing label (R001, R002, etc.). Not identity. */
  displayLabel: string;
  /** Source of identity: 'declared' (from ID field) or 'generated' (hash-based). */
  source: 'declared' | 'generated';
  /** 0-based row index in parsed order. */
  rowIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════
// NONRESPONSE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Observable cell states for bare CSV (no semantic missingness).
 * Per discovery-survey-spec-rev3: bare CSV cannot distinguish why
 * a value is absent.
 */
export type CellPresence = 'value_present' | 'empty_or_missing';

// ═══════════════════════════════════════════════════════════════════════
// COMPUTED FACTS (deterministic output)
// ═══════════════════════════════════════════════════════════════════════

/**
 * SurveyComputedFacts — the typed boundary passed to survey_synthesis.
 *
 * Contains ONLY authoritative code-computed values per ADR 0028.
 * No free-text analysis. No interpretive content.
 * Same CSV + same schema = identical output (deterministic invariant).
 */
export interface SurveyComputedFacts {
  /** Evidence source identity (content hash). */
  sourceContentHash: string;
  /** Total respondent count. */
  totalRespondents: number;
  /** Schema summary for template context. */
  schemaSummary: FieldStatSummary[];
  /** Per-field statistics (ordinal, nominal, continuous). */
  fieldStats: FieldStat[];
  /** Structured cross-tabulations. */
  crossTabs: CrossTab[];
  /** Nonresponse limitation note. */
  nonresponseLimitation: string;
}

export interface FieldStatSummary {
  fieldName: string;
  role: SurveyFieldRole;
  nPresent: number;
  nMissing: number;
}

/** Per-field statistics — varies by role. */
export interface FieldStat {
  fieldName: string;
  role: SurveyFieldRole;
  totalRespondents: number;
  nPresent: number;
  nMissing: number;
  /** Category distribution (ordinal/nominal). Keys are category values. */
  distribution: Record<string, number> | null;
  /** Median for ordinal (confirmed order) or continuous fields. */
  median: string | number | null;
  /** For continuous: count of valid numeric values. */
  nValidNumeric: number | null;
  /** For continuous: count of non-numeric/invalid values. */
  nInvalidNumeric: number | null;
}

export interface CrossTab {
  rowField: string;
  colField: string;
  /** row_value → col_value → count */
  cells: Record<string, Record<string, number>>;
  totalN: number;
}

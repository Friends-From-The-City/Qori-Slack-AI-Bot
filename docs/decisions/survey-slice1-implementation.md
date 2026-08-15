# Survey Slice 1 Implementation Decisions

Date: 2026-08-15

## Parser Choice: csv-parse

**Selected:** `csv-parse` v7 (npm `csv-parse`)

**Why:** Server-side Node.js library with RFC 4180 compliance. Handles quoted fields, embedded newlines, escaped quotes, BOM, and delimiter detection. Synchronous API (`csv-parse/sync`) guarantees deterministic output. Well-maintained (part of the csv ecosystem). No browser-only dependencies.

**Rejected:** `papaparse` (primarily browser-focused, Node support is secondary), hand-rolled parser (RFC compliance is non-trivial), `fast-csv` (less RFC-complete quoted field handling).

## XLS/XLSX Intentionally Disabled

Excel support removed from survey upload modal. CSV only for Slice 1.

**Why:** The backend returned placeholder text for Excel files — accepting them in the UI while silently not parsing them was unsafe. Adding an Excel dependency (e.g., `xlsx`, `exceljs`) is not justified until researcher demand is confirmed. CSV is the universal survey export format.

**Record:** Filetypes changed from `["csv", "xlsx", "xls"]` to `["csv"]` in both the modal definition and the DISCOVERY_TYPES config.

## Schema Inference Requires Complete Researcher Review

Field roles are inferred by heuristic, never declared authoritative without confirmation.

**Complete review enforced:** ALL fields must be reviewed before computation proceeds. Surveys with >100 columns are rejected with a clear message. Surveys with 21-100 columns use paginated schema review (20 fields per page, multiple pages). No unreviewed inferred role becomes authoritative.

**Heuristic categories:** id (by field name pattern), ordinal (Likert labels or small integer range), nominal (low cardinality), continuous (mostly numeric), open_text (high cardinality or long), timestamp (date patterns), multi_select (delimiter patterns).

## Ordinal Fields Require Explicit Category Order

**Rule:** No ordinal median computed without BOTH:
1. Researcher confirms `confirmed_role = 'ordinal'`
2. Researcher provides/confirms explicit category order via pipe-separated text input

Appearance order, lexical order, and numeric-looking values are NOT treated as authoritative ordering without researcher confirmation.

For numeric ordinal scales (e.g., 1-5), Qori proposes the detected values but the researcher must explicitly confirm.

If an ordinal field has no confirmed order, it is treated as nominal for statistics: distribution is shown, but median is NOT computed.

**Validation:** The confirmed order must include ALL observed non-missing category values. Duplicate categories fail. Incomplete orders fail.

## Bare CSV Missingness Limitations

Two observable states only: `value_present`, `empty_or_missing`.

No semantic missingness (`not_asked`, `no_response`, `blank`) — bare CSV cannot distinguish why a value is absent. The nonresponse limitation is documented in SurveyComputedFacts and rendered in the output.

## Pending CSV Storage: Redis with TTL

**Corrected from initial design.** Raw CSV staging uses Redis with automatic TTL expiry, NOT a Postgres column.

**TTL:** 2 hours. Schema review typically happens immediately after upload; 2 hours provides margin for researcher interruptions without retaining PII-bearing content indefinitely.

**Key format:** `survey:pending:{projectId}:{sourcePublicId}:{userId}`

**Lifecycle:**
- Upload → `Redis SET` with TTL
- Schema confirmation → `Redis DEL` immediately
- TTL reached → automatic deletion (no orphan data)
- Expired review → clear error asking researcher to re-upload

**PII implications:** Survey CSVs may contain respondent names/emails. The TTL guarantees automatic deletion even if the researcher never completes review. On confirmation, content is deleted immediately. No PII persists beyond the staging window. Staged content is NOT exposed to /qori-ask, study_variables, generated artifacts, model prompts, or evidence metadata.

## Deterministic Facts in Evidence Layer

Survey constructs use `derivation_type: 'deterministic'` and `status: 'accepted'` (auto-accepted because they are code-computed, not model-interpreted). Three construct types: `survey_dataset_summary`, `field_distribution`, `cross_tab`.

## No Cascade Projection in Slice 1

No evidence constructs are projected into study_variables. `sample_demographics` is NOT auto-projected because `total_responses` alone is not demographic information — projection requires researcher-confirmed genuinely demographic fields matching the cascade schema semantics. The LLM may still extract cascade variables from rendered prose (existing behavior).

## Qualitative Coding Deferred to Slice 2

No codebook generation, model coding, theme/category frequency from open-text, coding audit trail, or coded cross-tabs. Open-text content is passed to the LLM for qualitative interpretation only.

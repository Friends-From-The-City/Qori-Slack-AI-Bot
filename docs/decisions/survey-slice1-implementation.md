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

## Schema Inference Requires Researcher Review

Field roles are inferred by heuristic, never declared authoritative without confirmation.

**Heuristic categories:** id (by field name pattern), ordinal (Likert labels or small integer range), nominal (low cardinality), continuous (mostly numeric), open_text (high cardinality or long), timestamp (date patterns), multi_select (delimiter patterns).

**Ordinal gate:** No ordinal median computed without confirmed role AND confirmed category order metadata. Missing order = treated as nominal (distribution only, no median).

## Bare CSV Missingness Limitations

Two observable states only: `value_present`, `empty_or_missing`.

No semantic missingness (`not_asked`, `no_response`, `blank`) — bare CSV cannot distinguish why a value is absent. The nonresponse limitation is documented in SurveyComputedFacts and rendered in the output.

## Pending CSV Storage: Quarantine Pattern

Staged CSV text stored in `survey_field_schemas.pending_csv_content` TEXT column, following the `study_notes.pending_content` quarantine pattern. Cleared to NULL on schema confirmation. PII-bearing during its lifetime (survey CSVs may contain respondent names/emails); no PII persists beyond the review step.

## Deterministic Facts in Evidence Layer

Survey constructs use `derivation_type: 'deterministic'` and `status: 'accepted'` (auto-accepted because they are code-computed, not model-interpreted). Three construct types: `survey_dataset_summary`, `field_distribution`, `cross_tab`.

## No Cascade Projection in Slice 1

No evidence constructs are projected into study_variables. `sample_demographics` is NOT auto-projected because `total_responses` alone is not demographic information. The LLM may still extract cascade variables from rendered prose (existing behavior).

## Qualitative Coding Deferred to Slice 2

No codebook generation, model coding, theme/category frequency from open-text, coding audit trail, or coded cross-tabs. Open-text content is passed to the LLM for qualitative interpretation only.

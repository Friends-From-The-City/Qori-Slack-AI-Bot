# Survey and Codebook Contract

**Status:** IMPLEMENTED (Slices 1, 2A, 2B complete)

## Overview

The survey pipeline is a multi-stage workflow for analyzing survey responses. It operates within Discovery (pre-study) scope and has its own dedicated handlers, models, and review surfaces separate from the interview/usability pipeline.

## Pipeline Stages

```
CSV Upload (/qori-discover → survey synthesis)
    │
    ▼ Auto-infer schema
Schema Review (researcher confirms field roles)
    │
    ▼ Deterministic stats
Privacy Review (PII detection + per-entry disposition)
    │
    ▼ Auto-scrub + manual review
Codebook Generation (AI proposes codes)
    │
    ▼ Researcher review
Match Review (AI assigns entries to codes)
    │
    ▼ Researcher review
Qualitative Synthesis (survey_synthesis.yaml)
    │
    ▼ Cascade variables emitted
Downstream consumption (brief, readout)
```

## Stage 1: Survey Upload

**Handler:** `surveySubmissionHandler.ts`
**Entry:** `/qori-discover` → "Survey Synthesis" button

### Input
- CSV file uploaded via Slack file_input
- Survey name, description, question focus (from discovery modal)

### Processing
1. Download CSV from Slack (buffer ingestion)
2. Parse via `parseCsvBuffer()` → `ParsedSurvey`
3. Infer schema via `inferSurveySchema()` → `SurveyField[]`
4. Cache parsed survey + headers in Redis (2-hour TTL, key: `survey:{evidenceSourceId}`)
5. Send DM with schema review button

### ParsedSurvey Structure

| Field | Type | Description |
|-------|------|-------------|
| sourceFilename | string | Original CSV filename |
| headers | string[] | CSV column names |
| rows | SurveyRow[] | Keyed by header name, rowIndex 0-based |
| rowCount | number | Total rows |
| parseWarnings | string[] | Parser issues (never blocking) |

## Stage 2: Schema Review

**Handler:** `surveySubmissionHandler.ts` → `handleSurveySchemaConfirmation`
**Action:** `survey_review_schema`
**Callback ID:** `survey_schema_review_modal`

### What Researcher Sees
Paginated modal (10 fields per page) showing each inferred field with:
- Field name (from CSV header)
- Inferred role
- Sample values (first N distinct non-empty values)
- Distinct/present/missing counts
- Role selector to override inference

### SurveyFieldRole Enum

| Role | Description | How Inferred |
|------|-------------|-------------|
| `id` | Respondent identifier | Column name heuristics |
| `nominal` | Unordered categories | Low distinct count, non-numeric |
| `ordinal` | Ordered categories | Likert-like patterns detected |
| `continuous` | Numeric measurement | High numeric ratio |
| `multi_select` | Multiple selections | Delimiter-separated values |
| `open_text` | Free-text response | High distinct ratio, long values |
| `timestamp` | Date/time | Date pattern detected |

### Researcher Confirms
- Confirmed role per field (can override inference)
- For ordinal fields: confirmed category order (e.g., ["Low", "Medium", "High"])
- Demographic flag (is_demographic → feeds `sample_demographics`)

### After Schema Confirmation

Deterministic statistics computed via `computeSurveyComputedFacts()`:

| Output | Type | Authority |
|--------|------|-----------|
| `dataset_summary` | Evidence construct | CANONICAL — sourceContentHash, totalRespondents |
| `field_distribution` | Evidence construct | CANONICAL — per-field stats, distributions, medians |
| `cross_tab` | Evidence construct | CANONICAL — cross-tabulations between nominal/ordinal pairs |

All three use semantic keys for idempotent recreation.

## Stage 3: Privacy Review

**Handler:** `surveyPrivacyHandler.ts`
**Action:** `survey_privacy_review`
**Callback ID:** `survey_privacy_review_modal`

### Auto-Detection
Phone and email patterns detected via regex (same patterns as transcript scrubbing).

### Modal Structure
- **Flagged entries** (auto_scrub.has_detections = true): individual review required
- **Unflagged entries**: separate section with bulk approval checkbox

### Bulk Approval Invariant
Bulk action NEVER applies to flagged entries. Code enforces: `if (!isFlagged && doBulk)`.

### PII Status Lifecycle

| Status | Meaning | Analysis Use |
|--------|---------|-------------|
| `pending` | Awaiting review | Excluded |
| `clear` | Approved as written | Included |
| `redacted` | Approved with edited text | Included (edited version) |
| `restricted` | Excluded from analysis | Excluded |

## Stage 4: Codebook Generation

**Handler:** `codebookHandler.ts`
**Action:** `survey_generate_codebook`
**Callback ID:** `codebook_review_modal`

### Generation
1. Load approved qualitative entries (pii_status = 'clear' or 'redacted')
2. AI generates draft codes (groupings of similar responses)
3. Creates `SurveyCodebook` record (status: 'draft')
4. Creates `SurveyCode` records (one per draft code)
5. DM sent with "Review Groupings" button

### Idempotency
Checks for existing active unaccepted codebook or last accepted codebook — reuses if found.

### Researcher Review (Paginated Modal)
~5 codes per page to avoid Slack render limits.

| Decision | Effect |
|----------|--------|
| Keep | Code accepted as-is |
| Edit (rename) | Code renamed by researcher |
| Remove | Code excluded |
| Add new | Researcher creates inline code |

### After Acceptance
- `SurveyCodingRun` record marks codebook as accepted
- Codes promoted via `promoteAcceptedPatterns()` (two-stage promotion)
- Next step: match review

### Codebook Schema

| Model | Fields |
|-------|--------|
| SurveyCodebook | codebook_name, status ('draft' \| 'accepted') |
| SurveyCode | code_id, code_name, description, created_from_content, status ('accepted' \| 'edited' \| 'removed') |

## Stage 5: Match Review

**Handler:** `matchReviewHandler.ts`
**Action:** `survey_generate_assignments` → `survey_open_match_review`
**Callback ID:** `match_review_modal`

### Generation
1. Load accepted codebook codes
2. AI matches open-text entries to codes (generates assignments)
3. Creates `SurveyCodingRun` record
4. Creates `SurveyEntryAssignment` records (one per entry→code match)
5. DM with "Review Matches" button

### Researcher Review (Paginated Modal)
Shows each entry with:
- Entry text (approved text or redacted version)
- Proposed code assignment(s), pre-checked
- Option to add additional codes
- Decision: reviewed / uncodable / no_grouping_applies

### Bulk Approval
Applies to entries with proposed matches only (Qori suggestions). Researcher-added codes always respected.

### Entry Status After Review

| Status | Meaning |
|--------|---------|
| `reviewed` | Has ≥1 accepted assignment |
| `no_grouping_applies` | Explicitly rejected (no assignment) |
| `uncodable` | Cannot be categorized |

## Stage 6: Qualitative Synthesis

**Handler:** `surveySynthesisAction.ts`
**Action:** `survey_run_synthesis`

### Prerequisites Checked
1. Privacy review complete (all entries have pii_status ≠ 'pending')
2. Accepted coding run exists (Slice 2B gate)

### Output — Emitted Variables

| Variable | Schema | Pool Strategy |
|----------|--------|---------------|
| `survey_themes` | `schemas/survey_theme.yaml` | Pool (append) |
| `survey_findings` | `schemas/survey_finding.yaml` | Pool (append) |
| `survey_recommendations` | `schemas/survey_recommendation.yaml` | Pool (append) |
| `sample_demographics` | (singleton) | Singleton |

### survey_theme Schema

| Field | Type | Required |
|-------|------|----------|
| id | string | Yes |
| theme_name | string | Yes |
| frequency_count | integer | Yes |
| frequency_percentage | integer | Yes |
| sentiment | enum: Negative, Positive, Mixed, Neutral | Yes |
| priority | enum: High, Medium, Low | Yes |
| pattern | string | Yes |
| verbatim_quotes | array of {quote, respondent} | No |

## What Is NOT IMPLEMENTED

| Concept | Status |
|---------|--------|
| Skip/display logic | NOT IMPLEMENTED — all questions treated equally |
| Scale definitions (semantic differential, etc.) | NOT IMPLEMENTED — ordinal order is researcher-confirmed |
| Derived variables (computed from other responses) | NOT IMPLEMENTED |
| Question-level metadata (intent, construct measured) | NOT IMPLEMENTED |
| Multi-language support | NOT IMPLEMENTED |
| Longitudinal / repeated measures | NOT IMPLEMENTED |
| Response validation rules | NOT IMPLEMENTED |
| Branching / conditional display | NOT IMPLEMENTED |

## Field Classification

| Element | Classification |
|---------|---------------|
| CSV upload | RESEARCHER ENTERS |
| Field roles (initial) | QORI DERIVES (auto-inference) |
| Field roles (confirmed) | RESEARCHER ENTERS (override) |
| Ordinal category order | RESEARCHER ENTERS |
| Demographic flag | RESEARCHER ENTERS |
| Field statistics | QORI DERIVES (deterministic) |
| Cross-tabulations | QORI DERIVES (deterministic) |
| PII detection | QORI DERIVES (regex auto-scrub) |
| PII disposition | RESEARCHER ENTERS |
| Draft codes | AI PROPOSES |
| Code keep/edit/remove | RESEARCHER ENTERS |
| Entry-code matches | AI PROPOSES |
| Match accept/reject | RESEARCHER ENTERS |
| Survey themes | AI PROPOSES |
| Survey findings | AI PROPOSES |
| Survey recommendations | AI PROPOSES |

## Workspace Design Notes

- Upload → drag-and-drop CSV with preview
- Schema review → table view with role selectors per column
- Privacy review → table view with entry text, PII highlights, disposition selectors
- Codebook review → card-based or table view of codes with keep/edit/remove
- Match review → entry list with code assignments and accept/reject
- Synthesis → progress indicator, results in artifact viewer
- Missing from current design package — survey pipeline has NO Workspace screens designed

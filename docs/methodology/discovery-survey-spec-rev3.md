# Discovery Survey Methodology Specification — Revision 3

## Overview

Survey synthesis is a discovery workflow that analyzes survey response data to identify themes, findings, barriers, and knowledge gaps. It feeds into downstream research briefs and plans via the cascade variable system.

The survey methodology distinguishes between structured (quantitative) and qualitative analysis. Structured analysis is deterministic and code-computed. Qualitative analysis (theme identification, sentiment interpretation) involves model-assisted generation with researcher oversight.

## Principles

1. **Structured data is not raw LLM context.** The LLM must not parse CSV structure or compute authoritative numbers. Code owns headers, rows, respondent identity, field roles, counts, distributions, medians, and cross-tabs.

2. **Deterministic transformations occur outside the generative model (ADR 0028).** Same CSV + same accepted schema = identical structured facts. No randomness, no model-dependent variation in quantitative output.

3. **Schema inference requires researcher review.** Heuristic classification is a candidate, not a decision. Researchers confirm or correct every field role before computation proceeds.

4. **Ordinal computation requires explicit confirmed order.** Appearance order, lexical order, and numeric-looking values are not authoritative ordering without researcher confirmation.

5. **Bare CSV cannot distinguish semantic missingness.** Two observable states: value_present, empty_or_missing. Reserved states (not_asked, no_response, blank, uncodable) require metadata not present in bare CSV exports.

## Slices

### Slice 1: Structured Ingestion + Deterministic Facts

**Scope:**

- CSV upload and parsing (RFC-compliant, csv-parse)
- Field schema inference with complete researcher review
- Deterministic statistics: distributions, medians, completion splits, cross-tabs
- Evidence persistence: source → constructs → lineage
- Computed facts injected into template; LLM interprets only
- Redis-based temporary CSV staging with automatic TTL expiry

**Field Roles:**

| Role | Meaning |
|------|---------|
| id | Respondent identifier |
| nominal | Unordered categorical (e.g., department, role) |
| ordinal | Ordered categorical (e.g., satisfaction scale, difficulty rating) |
| continuous | Numeric measurement |
| multi_select | Comma-separated or delimited multi-choice |
| open_text | Free-text response |
| timestamp | Date/time value |

**Deterministic Measures:**

- Per-field: total respondents, n present, n missing
- Ordinal (confirmed order): distribution by category, median using confirmed order
- Ordinal (no confirmed order): distribution only, NO median
- Nominal: distribution by category
- Continuous: n valid numeric, n invalid, median
- Cross-tabs: completion × difficulty, completion × satisfaction (counts only)
- No means for ordinal fields
- No inferential statistics
- Percentages retain numerator + denominator when computed

**Explicitly Excluded from Slice 1:**

- Free-text coding and codebooks
- Theme/category frequency from open-text analysis
- Coded challenge cross-tabs
- Researcher coding review/adjudication
- Sentiment classification of open-text responses
- Recurring pattern promotion
- XLS/XLSX ingestion

### Slice 2A: Qualitative Evidence + Response Groups (BUILT)

**Scope:**

- Governed qualitative evidence units (one per respondent × open-text field)
- Privacy-gated two-stage processing: structured facts first, qualitative after review
- Deterministic PII pattern detection (phone → [PHONE], email → [EMAIL])
- Human privacy review with bulk (unflagged) + individual (flagged) disposition
- Qori proposes response groups from approved evidence (mixed inductive/deductive)
- Researcher reviews, edits, removes, adds response groups
- Accepted response-group set (versioned, immutable after acceptance)

**Researcher-facing terminology:**
- "Response groups" — researcher-visible term for qualitative groupings
- "Codebook/codes" — internal methodological/domain terms only

**No authoritative qualitative counts exist until Slice 2B adjudicated assignments.**

### Slice 2B: Coding Adjudication + Deterministic Aggregation (NOT BUILT)

**Required workflow sequence:**

```
privacy review complete
→ Review Response Groups (Slice 2A)
→ researcher accepts/edits/removes/adds groups
→ accepted response-group set
→ Qori proposes response-to-group assignments (Slice 2B)
→ researcher adjudicates assignments
→ accepted coding assignments
→ deterministic unique-respondent aggregation
→ accepted recurring patterns / barriers
→ integrated interpretation
→ final survey summary (Create Survey Summary)
```

**Rules:**
- The normal "Create Survey Summary" action is not available until accepted coding exists
- No bypass from privacy review directly to a final survey artifact
- No authoritative qualitative counts before adjudicated assignments
- Reporting unit is the unique respondent, not text entries
- Model cannot calculate counts — all aggregation is deterministic from accepted assignments

**Planned scope:**

- Qori proposes response-to-group assignments
- Researcher adjudicates (accept/reject per assignment)
- Deterministic respondent-level frequency from accepted assignments
- Accepted recurring patterns / barriers
- Coded challenge × completion cross-tabs
- Coding audit trail
- Final survey synthesis artifact generation

### Nonresponse Semantics

**Slice 1 (bare CSV):**

| State | Meaning |
|-------|---------|
| value_present | Cell contains a non-empty value |
| empty_or_missing | Cell is empty or whitespace-only; reason unknown |

**Future (metadata-aware):**

| State | Meaning |
|-------|---------|
| not_asked | Question was not presented to this respondent |
| no_response | Question was presented but respondent did not answer |
| blank | Respondent submitted an empty response |
| uncodable | Response exists but cannot be categorized (Slice 2 coding judgment) |

### Respondent Identity

**Precedence:**
1. Researcher-declared ID field (confirmed_role = 'id')
2. Generated stable key: SHA-256(source_content_hash + row_index)

Generated identity is deterministic for identical source content regardless of which evidence_source record holds it.

Human-facing labels (R001, R002) are presentation references, not canonical identity.

### Source Versioning

- SHA-256 of raw CSV buffer content
- Same project + identical hash = eligible to reuse accepted schema (if complete and all fields confirmed)
- Changed content = new source version requiring new review

### Evidence Persistence

Survey constructs:
- `survey_dataset_summary` — overall survey statistics
- `field_distribution` — per-field distribution
- `cross_tab` — cross-tabulation result

All: `derivation_type: 'deterministic'`, `status: 'accepted'`

Linked to evidence_source via `DERIVED_FROM` relationship.

### Cascade Integration

Slice 1 produces zero study_variables projections from the evidence layer. `sample_demographics` is NOT auto-projected because `total_responses` alone is not demographic information. Projection requires researcher-confirmed genuinely demographic fields matching cascade schema semantics.

The LLM may still extract cascade variables (survey_themes, survey_findings, discovered_barriers, etc.) from rendered template prose — that existing extraction path is unchanged.

### Excel Support

Intentionally disabled for Slice 1. CSV only. Excel support will be added when an XLSX parsing dependency is justified by researcher demand and a proper ingestion path is implemented.

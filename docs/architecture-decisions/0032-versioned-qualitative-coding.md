# ADR 0032: Versioned Researcher-Adjudicated Qualitative Coding

**Status:** Accepted
**Date:** 2026-08-15
**Decision drivers:** Survey Slice 2A — establishing governed qualitative evidence and researcher-controlled codebook authority.

## Context

Qori's survey synthesis (Slice 1) computes deterministic structured evidence but treats open-text responses as transient template input. No durable qualitative evidence units exist, no formal coding framework exists, and qualitative observations are labeled "preliminary" because no researcher-adjudicated coding has occurred.

Survey open-text responses may contain PII regardless of whether respondent identifiers are system-coded. The existing PII pipeline (ADR 0026) handles transcripts and manual notes but has no survey-specific review path.

## Decision

### Qualitative Method

Survey qualitative analysis uses **structured qualitative content analysis** with **mixed inductive/deductive** draft generation and **researcher-adjudicated** coding.

The term "theme" is reserved for accepted coded analysis. Before coding adjudication, qualitative groupings are called "observations," "categories," or "preliminary groupings."

### Privacy Gate

**Unstructured research content is model-eligible only after an approved privacy disposition.** Model-based privacy detection outside the trusted boundary cannot itself establish that disposition.

Privacy state and disposition logic live in domain services (`content-governance.service.ts`), not in Slack handlers. Researcher-facing review interfaces are adapters to the governance control, not the governance boundary itself.

States: pending → clear | redacted | restricted.

### Codebook Versioning

- Qori proposes draft codebook from approved qualitative evidence
- Researcher reviews, accepts/edits/removes codes
- Accepted codebook is immutable
- Editing creates a new version with `based_on_codebook_id` linkage
- Prior version becomes superseded only after replacement is accepted
- No authoritative qualitative counts until coding assignments exist (Slice 2B)

### Two-Stage Processing

1. **Structured plane** (immediate): schema confirmation → deterministic facts + evidence constructs + qualitative entries (pending)
2. **Qualitative plane** (after privacy review): eligible entries → LLM synthesis + codebook generation

Structured analysis does not wait for privacy review. Qualitative analysis cannot proceed until privacy review is complete (zero pending entries).

## Alternatives considered

**Process open text without privacy review.** Faster but unsafe — open-text responses may contain names, health information, or other sensitive content regardless of respondent ID format. Rejected.

**Store only redacted text, never original.** Simpler privacy model but prevents the reviewer from seeing what was actually said. Rejected — reviewer needs original text to make an informed disposition decision.

**Use existing study_notes table for survey entries.** Would unify governance but conflates different research domains. Survey qualitative entries have different identity model (respondent_key + field_name) than session notes (participant_id + session). Separate table is cleaner.

### Coding Run Lifecycle (Slice 2B — 2026-08-16)

- **Versioned coding runs** reference an accepted codebook
- Active run scoping: `findActiveUnacceptedRun(evidenceSourceId, codebookId)` — scoped to codebook to prevent reuse across grouping versions
- Accepted runs are immutable; editing creates a new version preserving original assignment origin (`qori_proposed` / `researcher_added` — no "inherited")
- Supersession: accepting a new version supersedes the prior accepted run for the same source+codebook

### Match Review

- Qori proposes response-to-grouping matches for each privacy-eligible entry
- Researcher reviews via paginated modal: accept, reject, add from any accepted grouping, or mark as "no grouping applies" / "cannot be categorized"
- Zero-suggestion entries (Qori proposes no match) cannot be silently bulk-approved — researcher must explicitly choose status
- Bulk approval applies only to entries with proposed matches

### Acceptance Validation

Before accepting a coding run (fail-closed):
- Zero pending entry reviews
- Reviewed entries have ≥1 accepted assignment
- `no_grouping_applies` and `uncodable` entries have zero accepted assignments
- All accepted assignments reference current codebook's accepted codes
- No restricted entries present
- No duplicate run-entry-code assignments

### Aggregation

- **Reporting unit:** unique respondent (not text entries)
- **Denominator:** eligible respondents with ≥1 privacy-approved entry
- Multiple entries from same respondent × same code = count once
- Respondent in multiple groupings = count once per grouping
- **Recurring pattern:** ≥2 unique respondents
- **Individual observation:** 1 unique respondent
- All calculations deterministic — code-computed, never AI-generated

### Evidence Promotion

- Two-stage idempotent promotion (separate transaction from acceptance)
- Construct types: `survey_qualitative_pattern`, `survey_individual_observation`
- Idempotency key: `coding_run_public_id` + `code_public_id`
- `survey_themes` NOT re-enabled — "themes" terminology retired
- `discovered_barriers` NOT auto-emitted from qualitative patterns

### Quote Selection

- Deterministic governed quote selection (no LLM involvement)
- Up to 2 quotes per grouping, preferring distinct respondents
- Order: `source_row_index` ASC, `qualitative_entry_id` ASC
- Uses governed text only (clear → entry_text, redacted → redacted_text)
- Restricted entries never selected

### Final Artifact Gate

- Survey synthesis requires accepted coding run (no bypass)
- "What Respondents Described" replaces "Preliminary Qualitative Observations" when accepted coding exists
- Template v10.0 renders deterministic counts and governed quotes from template, not from AI

## Consequences

- Open-text responses are durably persisted as governed qualitative evidence units
- Privacy review required before any model-based analysis of open text
- All model-facing paths use `getAnalysisEligibleContent()` — fail-closed on pending/restricted
- Codebook versions provide full audit trail of analytical decisions
- Respondent counts are deterministic based on accepted coding
- Existing survey synthesis artifact generation is deferred until privacy review completes
- Redis staging cleanup occurs only after all durable writes succeed
- "Response groups" is the researcher-facing term; "codebook/codes" remain internal domain terms
- The normal "Create Survey Summary" action requires accepted coding — no bypass from privacy review to final artifact

## Roadmap Status

| Slice | Status |
|-------|--------|
| 2A — Privacy, codebook, evidence foundation | Complete / dev-accepted |
| 2B — Coding runs, assignments, aggregation, artifact | Implemented / dev review pending |

## References

- ADR 0026 — PII scrubbing at ingestion (existing pipeline)
- ADR 0028 — Deterministic research transformations
- ADR 0029 — Canonical evidence state vs cascade projection
- ADR 0030 — Evidence lineage identity
- `backend/src/services/content-governance.service.ts` — privacy domain service
- `backend/src/services/survey-coding-run.service.ts` — coding run lifecycle
- `backend/src/services/survey-aggregation.service.ts` — deterministic aggregation
- `backend/src/helpers/survey/assignmentGenerator.ts` — model-based draft matching
- `backend/src/database/models/survey_coding_run.ts` — coding run model
- `backend/src/database/models/survey_coding_assignment.ts` — assignment model
- `backend/src/database/models/survey_coding_entry_review.ts` — entry review model
- `config/prompts/survey_synthesis.yaml` — v10.0 template with qualitative integration

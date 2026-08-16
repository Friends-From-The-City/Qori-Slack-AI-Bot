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

## Consequences

- Open-text responses are durably persisted as governed qualitative evidence units
- Privacy review required before any model-based analysis of open text
- All model-facing paths use `getAnalysisEligibleContent()` — fail-closed on pending/restricted
- Codebook versions provide full audit trail of analytical decisions
- Respondent counts will be deterministic (Slice 2B) based on accepted coding, not model estimates
- Existing survey synthesis artifact generation is deferred until privacy review completes
- Redis staging cleanup occurs only after all durable writes succeed
- "Response groups" is the researcher-facing term; "codebook/codes" remain internal domain terms
- The normal "Create Survey Summary" action requires accepted coding — no bypass from privacy review to final artifact
- Slice 2B workflow: accepted groups → proposed assignments → researcher adjudication → deterministic aggregation → final survey summary

## References

- ADR 0026 — PII scrubbing at ingestion (existing pipeline)
- ADR 0028 — Deterministic research transformations
- ADR 0029 — Canonical evidence state vs cascade projection
- `backend/src/services/content-governance.service.ts` — privacy domain service
- `backend/src/database/models/survey_qualitative_entry.ts` — entry model
- `backend/src/database/models/survey_codebook.ts` — codebook model

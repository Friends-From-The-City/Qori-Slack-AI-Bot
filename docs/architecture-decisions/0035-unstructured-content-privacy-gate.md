# ADR 0035: Unstructured Content Privacy Gate

**Status:** Accepted
**Date:** 2026-08-17
**Decision drivers:** Platform Hardening Phase 3 (PH-3) — establish a single architectural privacy invariant for all unstructured content before model access.

## Context

Qori processes unstructured content from multiple sources: researcher-uploaded files (desk research, stakeholder documents), session transcripts, manual notes, survey open-text entries, and Qori-generated research artifacts. Before PH-3, privacy handling was implemented per-handler with no shared contract:

- **Session transcripts**: quarantine → human review → redaction (sessionNotesHandler)
- **Session analysis**: PII check + pre-transmission redaction (analyzeNotesHandler)
- **Survey entries**: PII detection → privacy review → disposition (content-governance.service)
- **Discovery uploads**: **no privacy gate** — raw content passed directly to model
- **Qori artifacts**: **no explicit authorization** — fetched from GitHub and passed to model

The discovery upload bypass was a critical gap: researcher-uploaded PDFs containing participant-adjacent data could reach the model without any scan or review.

## Decision

### Platform Invariant

All unstructured content must pass through a privacy/governance policy before model access:

```
UNSTRUCTURED CONTENT → privacy/governance policy → authorized model-safe representation → model access
```

### Policy Types

The gate enforces one invariant but applies different policies by source:

| Policy | Source | Authorization | Review |
|--------|--------|--------------|--------|
| **PARTICIPANT_CONTENT** | Session transcripts, manual notes | Quarantine → human review → redaction | Mandatory |
| **SURVEY_QUALITATIVE** | Survey open-text entries | PII detection → privacy review → disposition | Mandatory |
| **DISCOVERY_UPLOAD** | Researcher-uploaded files | Deterministic PII scan → auto-authorize if clean, block if PII detected | Conditional |
| **TRUSTED_CURATED_ARTIFACT** | Qori-generated research artifacts from GitHub | Auto-authorized when provenance known and upstream privacy gates passed | Automatic |

### Implementation

The shared gate is implemented in `content-governance.service.ts` via `authorizeForModel()`. Each handler routes content through the gate before any model call:

- **discoverHandler**: `DISCOVERY_UPLOAD` — scans for PII patterns (SSN, email, phone, address). Blocks with researcher notification if PII detected.
- **readoutHandler**: `TRUSTED_CURATED_ARTIFACT` — auto-authorizes Qori-managed artifacts with known provenance.
- **researchSynthesisHandler**: `TRUSTED_CURATED_ARTIFACT` — auto-authorizes session summaries and research plans.
- **sessionNotesHandler / analyzeNotesHandler**: Continue using existing quarantine/review flow (PARTICIPANT_CONTENT semantics).
- **surveySubmissionHandler**: Continues using existing `getAnalysisEligibleContent()` accessor (SURVEY_QUALITATIVE semantics).

### What TRUSTED_CURATED_ARTIFACT does NOT do

It does not add unnecessary human review to already-governed Qori artifacts. Content produced by Qori workflows where upstream privacy/governance requirements already passed is auto-authorized. The gate exists to make the authorization explicit and auditable, not to add friction.

## Consequences

- Closes the discovery upload privacy bypass.
- All unstructured content paths now have explicit authorization before model access.
- The gate contract is extensible: new content sources add a policy type, not a new handler-specific privacy implementation.
- Participant-operations PII and research-evidence privacy remain distinct — the gate unifies the contract, not the disposition semantics.
- TRUSTED_CURATED_ARTIFACT makes the existing implicit trust of Qori artifacts explicit and logged.

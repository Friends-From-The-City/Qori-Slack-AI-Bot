# ADR 0045: Source Annotation and Evidence Promotion

**Status:** Proposed
**Date:** 2026-08-21
**Decision drivers:** Workspace source viewer design; manual evidence creation; research annotation needs; source-analysis capability gaps identified in workflow contract Phase A

## Context

The current evidence pipeline is entirely AI-driven. Session transcripts and source documents enter Qori, the AI extracts nuggets/themes/findings, and researchers review the output. Researchers cannot:

- Select a specific text span in a transcript
- Annotate source material with working notes
- Manually create evidence nuggets from source observations
- Discuss/comment on evidence without entering the evidence graph
- Promote a researcher observation to canonical evidence

These 8 capabilities were classified as NOT IMPLEMENTED during the Workspace workflow contract audit (Phase A, 2026-08-21). The Workspace design package (UX-1) assumes evidence already exists — it has no screens for evidence creation from source material.

## Decision

Introduce three additive domain models that extend the existing evidence layer (ADRs 0028-0030, 0037) without modifying it:

### 1. Source Spans (`research_source_spans`)

Stable sub-file content anchors with frozen text snapshots and content hashes. Locator JSONB supports transcript offsets, document page/paragraph, and future media timestamps.

Spans are references, not evidence. No span selection alone creates canonical evidence.

### 2. Research Annotations (`research_annotations`)

Researcher working notes attached to sources, spans, or evidence constructs. Two types: `note` (working observation) and `evidence_candidate` (flagged for potential promotion).

Annotations are NOT comments. Annotations may be promoted to evidence; comments never can be.

### 3. Research Comments (`research_comments`)

Collaboration/discussion objects with typed target references (source, span, annotation, construct, artifact). Comments never enter the evidence graph. Comments are not sent to LLM models by default.

### 4. Construct-to-Span Provenance (`evidence_construct_source_spans`)

FK-backed join table linking promoted evidence constructs to their exact source spans. This is the canonical provenance link — not a JSONB-only reference. JSONB provenance may duplicate the reference for convenient rendering, but the FK wins if they disagree.

### Evidence Promotion

Explicit `Promote to Evidence` action creates a canonical `evidence_construct` (nugget, `derivation_type: 'human'`) with:
- `DERIVED_FROM` lineage to the evidence_source (file-level)
- FK-backed `evidence_construct_source_spans` link to the exact source span (sub-file)

Promotion is:
- Explicit (no UI selection alone creates evidence)
- Auditable (derivation_context + FK-backed span link)
- Idempotent (semantic_key prevents duplicate nuggets from same span)
- Privacy-preserving (only post-PII content, participant codes only)
- Governed by existing candidate → accepted review workflow (UX-2B)

### Source Version

`source_version_ref` is provider-neutral — not GitHub-specific. Supports commit SHAs, object versions, transcript revision IDs, or content-hash self-reference depending on source origin.

### Source Mutation

Span `anchor_status` tracks `valid | stale | broken`. Source edits mark spans stale but never modify the frozen text snapshot or promoted evidence. Historical basis of accepted evidence is preserved.

## Consequences

**Positive:**
- Researchers gain manual evidence creation capability alongside AI extraction
- Source-level collaboration possible without evidence graph pollution
- Clean separation: span ≠ annotation ≠ comment ≠ evidence
- Additive — no existing table/model modifications required
- Privacy boundaries preserved (post-PII content only, no comments to models)

**Negative:**
- Three new tables and associated services/APIs
- Offset-based anchoring is fragile if source content changes frequently
- Comments could scope-creep toward social features

**Risks:**
- Overlapping spans complicate rendering
- Annotation body may contain participant references (PII detection question)
- Multi-span evidence promotion deferred (one span → one nugget for now)

## Implementation

Proposed as 8 slices (SA-1 through SA-8). SA-1 (source spans) and SA-3 (comments) are independent starting points. SA-4 (promotion) requires SA-1 + SA-2. SA-6 (Workspace source viewer) requires all prior slices.

Full specification: `docs/architecture/source-annotation-evidence-promotion.md`

## Related ADRs

- ADR 0028 — Deterministic research transformations
- ADR 0029 — Canonical evidence state distinct from cascade projection
- ADR 0030 — Stable database IDs and typed relational lineage
- ADR 0037 — Canonical evidence lineage
- ADR 0026 — PII scrubbing at ingestion
- UX-2B — Finding/recommendation review lifecycle

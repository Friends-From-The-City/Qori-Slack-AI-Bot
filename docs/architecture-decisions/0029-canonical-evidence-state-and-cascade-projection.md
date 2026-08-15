# ADR 0029: Canonical evidence state is distinct from cascade projection

**Status:** Accepted
**Date:** 2026-08-15
**Decision drivers:** Evidence architecture foundation — establishing that authoritative research evidence persists independently of the consumer-shaped variables in `study_variables`.

## Context

Qori currently stores all structured research state in the `study_variables` table as consumer-shaped JSONB values. This works well for the cascade pipeline: each template declares what it `consumes` and `emits`, the variable extractor parses LLM output into the declared schema, and downstream templates read the stored shape directly.

However, this conflates two distinct concerns:

1. **Authoritative evidence state** — the durable truth about what was observed, analyzed, and decided. A knowledge gap exists. A barrier was validated by 6 of 8 participants. A finding is accepted. A recommendation led to a GitHub ticket.

2. **Cascade projection** — the shape a downstream consumer expects. A research readout template needs findings formatted with supporting_themes arrays and severity_distribution objects. An affinity map template needs nuggets grouped by participant.

When these are the same thing, several problems emerge:
- Evidence identity is tied to template schema. If a template changes its expected shape, historical evidence must be migrated or becomes unqueryable.
- Cross-study queries (future `/qori-ask`) must parse consumer-shaped JSONB to answer "which studies found accessibility barriers?" — a structural query against an unstructured store.
- Deterministic facts (ADR 0028) route through LLM extraction to land in the variable store, introducing unnecessary non-determinism.

## Decision

Authoritative research evidence and construct state is distinct from `study_variables` cascade projection.

The long-term relationship is:

```
accepted evidence/construct
├→ authoritative evidence store (evidence_constructs table)
├→ study_variables projection where required
└→ template rendering context
```

`study_variables` remains in place, unchanged, and continues to serve the existing cascade pipeline. No migration of existing variables into the evidence layer. No dual-write of every current emit.

The evidence layer introduces:
- **evidence_sources** — metadata about evidence-bearing inputs (uploaded documents, transcripts, survey datasets)
- **evidence_constructs** — typed research objects with stable database IDs, structured JSONB payloads, derivation metadata, and acceptance status
- **evidence_relationships** — directed typed edges between sources and constructs

The projection seam is a service boundary: when a vertical slice converts a template to evidence-aware operation, accepted constructs are projected into the cascade-compatible shape through validated deterministic transformation — no LLM re-extraction, no render/extract round-trip. The projection flow is:

```
accepted EvidenceConstruct
→ validate canonical construct requirements (required payload fields)
→ deterministic projection transform
→ validate destination cascade schema (variable_key, pool/singleton, item_key)
→ CascadeProjection
```

If an accepted construct cannot satisfy its projection contract, the service throws `EvidenceProjectionError` (fail-closed). It does not invent defaults, silently omit fields, or produce malformed cascade variables.

## Alternatives considered

**Replace study_variables entirely.** Disruptive — 27 YAML templates, 40+ variable types, and the entire cascade pipeline depend on the current schema. The migration risk far exceeds the benefit, especially since study_variables works correctly for its purpose.

**Store evidence as additional study_variables rows.** Keeps one table, but overloads study_variables with a responsibility it wasn't designed for. Evidence needs relational identity (FKs between constructs), acceptance status, derivation metadata, and typed relationships — none of which fit the variable store's append/pool/singleton model.

**Build evidence as a separate microservice.** Premature — the evidence layer shares the same Postgres database, the same project/study FKs, and the same transaction boundaries. Extracting it to a service boundary adds network overhead and distributed transaction complexity for no current benefit.

## Consequences

- The cascade pipeline continues to work exactly as before. Empty evidence tables have zero impact on existing workflows.
- New vertical slices (starting with survey) will write to evidence tables and project into study_variables, rather than routing through LLM extraction for deterministic constructs.
- Future `/qori-ask` queries structured evidence directly, not by searching generated Markdown or parsing consumer-shaped JSONB.
- DSAR/deletion implications: project_id uses CASCADE — deleting a project removes all its evidence. study_id also uses CASCADE — deleting a study removes study-scoped evidence. Project-scoped discovery evidence (study_id = NULL) is unaffected by study deletion. Study deletion does NOT silently reclassify study-scoped evidence as project-scoped by nulling study_id. The disposition audit log (ADR 0025) captures pre-deletion counts including evidence records.
- The projection seam is a service, not a framework. Each vertical slice defines its own projection logic as a plain function. Projection validation is deterministic infrastructure (ADR 0028) — no LLM involvement.

## References

- ADR 0028 — Deterministic research transformations
- `backend/src/helpers/studyVariables.ts` — existing cascade variable store (unchanged)
- `backend/src/helpers/variableExtractor.ts` — extraction (unchanged, still valid for interpretive constructs)
- `backend/src/types/cascade.ts` — cascade type definitions (unchanged)

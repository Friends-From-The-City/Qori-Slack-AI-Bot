# ADR 0037: Canonical Evidence Lineage

**Status:** Accepted
**Date:** 2026-08-17
**Decision drivers:** Platform Hardening Phase 5 (PH-5A/5B/5C) — extend canonical evidence identity and derivation lineage beyond survey to the core research vertical.

## Context

Before PH-5, canonical evidence identity (evidence_sources, evidence_constructs, evidence_relationships) existed only for the survey pipeline. The entire session→readout research chain stored everything in study_variables (cascade projection) with no canonical evidence graph. This meant:

- No stable identity for nuggets, themes, findings, or recommendations
- No derivation lineage traceable to source transcripts
- No way to answer "what source evidence supports this finding?" without reading rendered Markdown
- Candidate vs. accepted authority state not tracked for non-survey research

## Decision

### Canonical evidence graph is lineage authority

The evidence graph (evidence_sources → evidence_constructs → evidence_relationships) is the sole authority for research derivation lineage. study_variables carries evidence refs for downstream convenience but is not the lineage authority.

### Target trace

```
evidence_source (session_transcript)
  ├─ DERIVED_FROM → evidence_construct (nugget, candidate)
  ├─ DERIVED_FROM → evidence_construct (nugget, candidate)
       ├─ SYNTHESIZED_FROM → evidence_construct (theme, candidate)
       │    └─ SYNTHESIZED_FROM → evidence_construct (finding, candidate)
       │         └─ SUPPORTS → evidence_construct (recommendation, candidate)
       └─ SYNTHESIZED_FROM → evidence_construct (theme, candidate)
```

### Relationship direction

All edges flow **upstream → downstream** (from = upstream, to = downstream):

| Edge | From | To | Type |
|------|------|----|------|
| Source → Nugget | `from_source_id` | `to_construct_id` | `DERIVED_FROM` |
| Nugget → Theme | `from_construct_id` | `to_construct_id` | `SYNTHESIZED_FROM` |
| Theme → Finding | `from_construct_id` | `to_construct_id` | `SYNTHESIZED_FROM` |
| Finding → Recommendation | `from_construct_id` | `to_construct_id` | `SUPPORTS` |

### Lineage is explicit, never reconstructed from prose

Evidence refs use canonical `evidence_construct.public_id` (UUID). No title matching, text similarity, or local-label reconstruction is used for lineage. A pattern enforcement test verifies this.

### Derivation identity includes upstream fingerprint

Semantic key: `{type}:{study_id}:{display_id}:{version}:{upstream_hash}`

Where `upstream_hash` is SHA-256 of the sorted, deduplicated upstream evidence public_ids. Same derivation reruns reuse the construct; changed upstream evidence creates a new candidate.

### Candidate vs. accepted authority state

All non-survey generated constructs are `status: 'candidate'`. No human review gate currently exists for themes, findings, or recommendations outside the survey pipeline. This is a documented conformance gap, not a hidden assumption.

### study_variables role

study_variables is **authoritative cascade projection** (ADR 0033). Projected items may carry:

```json
{
  "id": "finding-01",
  "finding": "...",
  "evidence_construct_ref": "<canonical UUID>",
  "status": "candidate"
}
```

The ref is convenience metadata. Canonical relationships live in evidence_relationships. Projection failure does not destroy canonical evidence.

### Rendered artifacts are independent

Generated Markdown documents are rendered projections of canonical state. Deleting or regenerating an artifact does not affect the evidence graph. The graph exists independently of GitHub.

## Consequences

### Enabled by this graph

- **Structured claim validation**: future claim validators can verify narrative against canonical evidence
- **Evidence-backed GitHub handoff**: recommendations carry canonical finding refs → ticket candidates can trace to source
- **Research completeness/coverage**: "which research questions have findings? which don't?"
- **/qori-ask evidence traversal**: future PH-9 queries canonical evidence, not Markdown
- **Cross-study research continuity**: canonical evidence persists across artifact regeneration

### Current limitations

- Non-survey constructs lack human review gates (conformance gap)
- Discovery sources (desk research, stakeholder) not yet in the evidence graph (future PH-5D)
- Graph does not yet replace study_variables for downstream template consumption
- No cross-study evidence traversal yet

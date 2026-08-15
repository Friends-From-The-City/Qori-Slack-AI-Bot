# ADR 0030: Stable database IDs and typed relational lineage are authoritative evidence identity

**Status:** Accepted
**Date:** 2026-08-15
**Decision drivers:** Evidence architecture foundation — ensuring research provenance survives document regeneration, template changes, and artifact renames.

## Context

Qori generates Markdown documents stored in GitHub repositories. These documents contain section headers, numbered findings, citation markers (`[D1]`, `[S1]`), and cross-references. The current cascade system uses string-based IDs within JSONB payloads (e.g., `KG-001` for knowledge gaps, `TB-003` for target barriers) that are assigned by the LLM during extraction and referenced by downstream variables via linkage fields.

These string IDs serve the cascade pipeline well — they're human-readable, appear in rendered documents, and enable traceability within a single study's cascade flow. However, they have limitations as canonical identity:

- They're assigned by the LLM (non-deterministic — ADR 0028)
- They exist only inside JSONB payloads, not as relational database entities
- They can't participate in foreign key relationships
- Cross-study queries require parsing JSONB to find references
- Document regeneration could reassign IDs (KG-001 might refer to different gaps across regenerations)

The evidence architecture needs identity that is stable, relational, and independent of rendered document anchors.

## Decision

Stable database IDs and typed relational lineage are the authoritative evidence identity. Rendered document anchors (section numbers, citation markers, human-readable codes) are presentation references, not identity.

Evidence identity has three tiers:

1. **Integer PK (`id`)** — internal relational identity. Used for joins, FK references within the evidence layer, and transactional operations. Never exposed outside the persistence layer.

2. **UUID (`public_id`)** — durable machine identity. Auto-generated, stable across document regeneration, template version changes, and artifact renames. Suitable for provenance chains, exports, API references, GitHub document anchors, admin surfaces, and future `/qori-ask`. Every evidence_source, evidence_construct, and evidence_relationship has a `public_id UUID NOT NULL UNIQUE`.

3. **Human-readable label** — presentation reference. Optional display identifiers such as `RQ-004`, `F-012`, `NUGGET-PT003-007`. May vary by artifact context. Stored in the construct's JSONB payload or label field. Not identity.

Specifically:

- Every evidence source, construct, and relationship gets an auto-incrementing integer PK for internal use and a UUID `public_id` for durable external identity.
- Relationships between entities are stored as rows in `evidence_relationships` with FK-backed columns (`from_source_id`, `from_construct_id`, `to_source_id`, `to_construct_id`) and CHECK constraints enforcing exactly one FROM and one TO endpoint. Lineage endpoint integrity is database-enforced, not service-layer validated.
- Construct payloads may contain human-readable labels (e.g., `"label": "Upload barrier"`) for display purposes, but these are presentation references, not identity.
- Existing cascade string IDs (`KG-001`, `TB-003`, `PT-007`) remain valid within the cascade pipeline. They are not replaced. When a construct is promoted from cascade to evidence, the cascade ID may be stored in the construct's JSONB payload as a cross-reference.

The provenance chain:

```
source (DB ID) → construct (DB ID) → construct (DB ID) → ... → ticket (DB ID)
```

is structurally possible through `evidence_relationships` rows, each with typed relationship semantics (`DERIVED_FROM`, `SUPPORTS`, `ADDRESSES`, `IMPLEMENTED_BY`, etc.).

## Alternatives considered

**UUIDs as the only PK (no integer PK).** UUIDs are globally unique but slower for joins and less readable in debugging. The two-tier approach (integer PK for internal joins, UUID public_id for external identity) gives both performance and durability without trade-off.

**Service-layer referential integrity (polymorphic from_type/from_id).** The initial implementation used polymorphic type+id columns with integrity checks in application code. This was corrected: lineage is a trust boundary and must be database-enforced. FK-backed columns with CHECK constraints prevent orphan edges at the Postgres level.

**Embed relationships in JSONB arrays.** The current cascade pattern — `supporting_nuggets: ["NUG-001", "NUG-003"]` — works for template rendering. But JSONB arrays can't enforce referential integrity, can't be indexed for reverse lookups, and can't participate in transactional guarantees. The evidence layer needs "find all constructs that support finding F" as a relational query, not a full-table JSONB scan.

**Graph database (Neo4j, etc.).** The evidence layer is a directed graph, and a graph database would be a natural fit. But Qori runs on PostgreSQL, the team knows PostgreSQL, and the graph is small enough (hundreds to low thousands of nodes per project) that a relational representation with typed edges is sufficient. A graph database would add operational complexity with no current query-performance justification.

## Consequences

- Evidence entities have durable identity (`public_id` UUID) that survives document regeneration, template version changes, and artifact renames.
- Lineage endpoint integrity is database-enforced via FK columns and CHECK constraints. Invalid references fail at INSERT, not at query time.
- Reverse lookups ("what supports this finding?") are indexed relational queries, not JSONB scans.
- The evidence_relationships table supports the full provenance chain from source → ... → ticket without requiring all intermediate nodes to exist yet. Future edge types (e.g., recommendation → ticket) can be added via additive FK columns.
- Cascade string IDs (`KG-001`, etc.) continue to work unchanged within the cascade pipeline. Three ID tiers coexist: integer PKs for internal joins, UUIDs for durable external identity, cascade IDs for template rendering.
- Future `/qori-ask` can traverse the relationship graph relationally: "find all recommendations supported by findings from study X that reference barrier B."
- Deletion of a source or construct cascades to its relationship edges — no orphan lineage can exist.

## References

- ADR 0028 — Deterministic research transformations (ID assignment is deterministic)
- ADR 0029 — Canonical evidence state vs cascade projection
- ADR 0020 — System-assigned participant codes (existing pattern for stable IDs)
- `backend/src/types/cascade.ts` — existing cascade string IDs (unchanged)

# Traceability Model

Traceability is a first-class interaction, designed for researchers — not a database relationship viewer. No node-link graph in v1; the lineage is linear enough (per ADR-0037's edge model) that a strip + expandable lists communicate it better.

## The lineage chain

BACKWARD: recommendation → finding → theme → evidence (nuggets) → source → study
FORWARD: finding → recommendation → artifact → GitHub (future Jira) handoff

## Pattern 1 — Lineage strip

On every finding/recommendation/artifact detail:

```
Study: Veteran Telehealth › 4 sources › 12 evidence › Theme: Scheduling friction › ● Finding › 2 recommendations › 1 artifact › GitHub ↗
```

- Ordered, horizontal, scrollable at narrow widths; current node emphasized (ink pill).
- Each segment is a button → opens the TraceabilityPanel scoped to that hop.
- Counts are live and specific ("12 evidence"), never vague.
- A11y: ordered list labeled "Lineage"; each segment's name includes position ("Backward: 4 sources").

## Pattern 2 — TraceabilityPanel (drawer/docked)

Two sections:

**Why this exists (backward)**
- Evidence summary sentence: "Supported by 12 evidence items from 4 interviews in 1 study."
- Staleness roll-up: "Oldest evidence: Jan 2025 · 19 months" with StaleIndicator when past threshold.
- Nested, expandable list: Source → its evidence items (quote previews, participant codes). Expanding never navigates; clicking an evidence item opens EvidenceDrawer (drawer back stack).
- Theme row showing which theme synthesized the evidence.

**Where this goes (forward)**
- Recommendations with their statuses.
- Artifacts with workflow + publication status (both badges).
- Handoffs: GitHub link(s), future Jira refs, each with adapter status.

## Pattern 3 — Inline evidence counts

Cards carry "12 evidence · 4 sources" as a compact affordance; clicking it deep-links to the panel's backward section.

## Answering the five questions (finding)

| Question | Surface |
|---|---|
| Why does it exist? | Backward section: theme + evidence list |
| How much evidence? | Evidence summary sentence + counts on card |
| Which studies/sources? | Source-grouped evidence list; multi-study findings group by study first |
| Is evidence stale? | Staleness roll-up + per-item dates |
| What depends on it? | Forward section: recommendations, artifacts, handoffs with statuses |

## Graph — deliberately deferred

A graph view is only justified when constructs commonly have many-to-many lineage across studies. Revisit when cross-study findings become common; if added, it must be an alternate view of the same panel data with a full text/table equivalent (a11y).

## Data contract

Per construct: lineage chain with per-hop counts, per-hop refs (id, title, status), evidence items (text, participant code, source, date), staleness roll-up, forward refs with workflow + publication status. Backend basis: `evidence_relationships` (ADR-0030/0037) — `SYNTHESIZED_FROM` and `SUPPORTS` edges.

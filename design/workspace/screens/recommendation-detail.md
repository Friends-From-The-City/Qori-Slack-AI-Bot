# Screen: Recommendation Detail

**Route** `/recommendations/:id` · **Purpose**: Recommendation with supporting findings and downstream handoff.

## Hierarchy
PageHeader (crumbs · StatusBadge · publication-adjacent actions in ⋯) → h1 recommendation statement → lineage strip → main (statement, rationale, priority, supporting findings as FindingCards with statuses) + trace panel (backward: findings→evidence roll-up; forward: artifacts, GitHub/Jira handoff with adapter status).

`addresses_findings` is required in the backend (linkage audit) — the UI treats a recommendation without findings as an invalid/legacy state, shown with a "Lineage incomplete" note.

## Data
Recommendation (statement, rationale, priority, status), supporting findings[] with statuses, artifacts[], handoff records (adapter, state, URL).

## Interactions
Finding cards → finding detail (drawer); handoff rows show PublicationStatus with retry where failed; "Generate artifact" if none exists.

## States
Suggested (review gate like findings), accepted, published-in-artifact, handed-off (ticket link), stale-upstream warning ("2 supporting findings rely on stale evidence"), superseded.

## Breakpoints
Same pattern as finding detail: docked panel → drawer → sheet.

## A11y
Same grammar as finding detail; handoff statuses icon+label.

## API
`GET /recommendations/:id`, `/lineage`, `POST /recommendations/:id/review`, handoff status endpoints.

## Unresolved
- Priority model (P1/P2 vs effort/impact) — align with readout templates
- Direct Jira handoff v-future: placeholder card only

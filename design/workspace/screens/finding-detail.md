# Screen: Finding Detail + Traceability

**Route** `/findings/:id` · **Purpose**: The canonical finding view — statement, status, evidence, downstream use. The traceability showcase.

## Layout (xl)

```
PageHeader: crumbs Org/Project/Study/Findings · StatusBadge · [Accept] [Edit] ⋯
h1: finding statement
Lineage strip: Study › 4 sources › 12 evidence › Theme › ● Finding › 2 recs › 1 artifact
┌ Main ──────────────────────────────┐ ┌ Trace panel (docked 384px) ─┐
│ Statement (full) · rationale        │ │ WHY THIS EXISTS             │
│ Tags (system/researcher/suggested) │ │ 12 evidence · 4 interviews  │
│ Review state & history             │ │ Oldest: Jan 2025 ⏱ stale    │
│ Study context                      │ │ ▸ Source: P03 interview (4) │
│                                    │ │ ▸ Source: P07 interview (3) │
│                                    │ │ WHERE THIS GOES             │
│                                    │ │ Rec: Simplify scheduling ✓  │
│                                    │ │ Artifact: Readout v2 ▪Pub   │
└────────────────────────────────────┘ └─────────────────────────────┘
```

## Data
Finding (statement, rationale, status, review history, tags, study ref), full lineage contract per `traceability-model.md`.

## Interactions
Suggested findings show review actions (Accept/Edit/Dismiss) per review-finding flow; lineage strip segments scope the panel; evidence rows → EvidenceDrawer; forward refs → their details. "Trace" keyboard shortcut `t` focuses the panel.

## States
Suggested (dashed + ✦ + review footer), accepted, stale roll-up warning, dismissed (archived view), partial lineage (pre-migration note), permission-gated hops named, downstream-impact notes on status change.

## Breakpoints
xl: docked panel · lg/md: panel becomes drawer via "Trace" button (badge with evidence count) · sm: full-screen sheet; lineage strip horizontally scrollable.

## A11y
h1 = statement; strip = ordered list labeled "Lineage"; panel `complementary` labeled; disclosure rows; status changes announced.

## API
`GET /findings/:id`, `GET /findings/:id/lineage`, `POST /findings/:id/review` (accept/edit/dismiss), tags PATCH.

## Backend Contract (UX-2B)

Review endpoint: `POST /api/v1/findings/:publicId/review` with body `{ "decision": "accept" | "reject" }`.

Review states: `candidate → accepted`, `candidate → rejected`. Re-review (accepted↔rejected) allowed with new audit record. `overridden` is governance-terminal.

Response includes: `public_id`, `construct_type`, `review_status`, `previous_status`, `reviewed_at`, `reviewed_by_display_name`, `stale_due_to_disposition`, `traceability_summary { upstream_count, downstream_count }`.

Authorization: project membership required. Cross-org review fails closed.

CD note: "Dismiss" maps to `reject` decision. "Edit" is not a review state transition — it modifies the construct payload (deferred to UX-3 implementation).

## Unresolved
- Multi-study findings: grouping order in backward section (by study then source?)
- Finding-level commenting/discussion in v1?

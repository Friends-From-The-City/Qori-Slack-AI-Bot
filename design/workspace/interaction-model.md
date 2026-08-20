# Interaction Model

Core patterns reused across the Workspace. Details for each domain live in `traceability-model.md`, `search-and-ask-qori.md`, `artifact-experience.md`, `states-and-feedback.md`.

## 1. Drawer-first detail

Clicking an entity in a list (evidence item, finding card, source) opens a **right-side drawer** over the current context — not a navigation. The drawer has a "Open full page ↗" action. This preserves context (the list, the filters, the scroll position) and makes traceability hops cheap. Drawers are 480px (desktop), full-height sheets on tablet, full-screen on mobile. One drawer at a time; a hop inside a drawer replaces its content and pushes a back stack (with in-drawer back button).

## 2. Lineage strip (traceability)

Every finding/recommendation/artifact detail shows a horizontal **lineage strip**: `Study › Sources (4) › Evidence (12) › Theme › Finding › Recommendation › Artifact`. Current node is emphasized; each segment is clickable and opens the drawer scoped to that hop. No node-link graph in v1 — see `traceability-model.md`.

## 3. Proposal vs accepted

AI-proposed content (tags, draft findings, draft artifacts) renders with a dashed border + "Suggested" badge + sparkline-free ✦ marker and requires explicit **Accept / Edit / Dismiss**. Accepted content renders solid, no AI marker (provenance retained in metadata, visible in the detail view under "History").

## 4. Staged AI progress

Long tasks never show a bare spinner. Pattern:

```
Analyzing 7 interviews
✓ Sources validated
✓ Privacy checks complete
● Extracting evidence        (current, animated)
○ Building themes
○ Drafting findings
```

Rules: steps named in research language; current step shows partial counts where available ("4 of 7 interviews"); banner states "You can leave — we'll notify you in your Work Queue"; failures stop at the failed step with a plain-language cause and Retry/Cancel; completed background tasks produce a Work Queue item + toast if the user is still present.

## 5. Tag interaction

Tag chips have three visual states: **system taxonomy** (solid neutral), **researcher tag** (outlined), **AI-suggested** (dashed + ✦, requires accept). Max 3 chips render on any card; "+N" opens the full set in a popover. Tags filter on click. Full model in `screens/` and `component-inventory.md` (TagChip).

## 6. Status + staleness

One StatusBadge system across entities (Draft / Needs review / Accepted / Approved / Published / Archived). Staleness is a **separate** indicator (clock icon + "Evidence is 14 months old") — never conflated with status, never color-only.

## 7. Review gates

Anything AI-generated that becomes canonical passes a review surface: side-by-side of the proposal and its evidence, Accept / Edit / Request changes. Same gate grammar for findings, tags, and artifacts.

## 8. Keyboard model

- `⌘K` — command palette: search, jump to study, ask Qori
- `Esc` — closes drawer/dialog (focus returns to trigger)
- Lists: arrow keys move, Enter opens drawer, `t` trace (opens lineage)
- All interactions keyboard-complete; see `accessibility.md`.

# Screen: Study Overview

**Route** `/studies/:id` · **Purpose**: The main research workspace shell + orientation tab. Progressive disclosure — not every field.

## Layout (xl)

```
PageHeader: crumbs Org/Project/Study · h1 · StatusBadge · [Analyze sources] ⋯
Tabs (sticky): Overview · Sources · Evidence · Findings · Outputs
┌ Progress ────────────────────────────┐ ┌ At a glance ───────┐
│ Stepper: Sources 7 → Evidence 84 →   │ │ Method, dates,     │
│ Themes 6 → Findings 9 → Outputs 2    │ │ researchers,       │
│ (counts clickable → tabs)            │ │ governance state   │
├ Needs attention ─────────────────────┤ │ Research questions │
│ 3 findings need review [Review]      │ │ (collapsed ≥3)     │
│ Evidence getting stale (Jan 2025)    │ └────────────────────┘
├ Active analysis (when running) ──────┤
│ ProgressStepper: Analyzing 7 files…  │
└──────────────────────────────────────┘
```

Primary column: pipeline progress (counts per stage, each a link into its tab), needs-attention list, active AI tasks. Side column: at-a-glance metadata + research questions behind disclosure. Nothing else on Overview — method details, full team, settings live behind "Study settings" in ⋯.

## Data
Study meta, per-stage counts, review-needed items, staleness roll-up, running tasks, research questions, governance state.

## States
First-use empty (teach workflow, Add sources primary), analyzing (stepper panel), stale warning, archived (muted, read-only), partial (stages render independently).

## Breakpoints
Side column stacks under primary at md; tabs scrollable at sm; pipeline counts wrap to 2 rows.

## A11y
h1 study name; tabs pattern; pipeline is a described list ("Evidence: 84 items, link"); running-task announcements polite.

## API
`GET /studies/:id` (meta + counts + attention items), `GET /studies/:id/tasks` (running), stage endpoints per tab.

## Unresolved
- Governance state visibility for members vs leads
- Should pipeline stages show deltas ("+12 this week")?

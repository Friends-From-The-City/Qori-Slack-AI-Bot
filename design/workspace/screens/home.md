# Screen: Home / Research Portfolio

**Route** `/` · **Purpose**: Immediately useful start — what needs me, what's active, where to resume. Modular panels; not a dashboard builder.

## Layout (xl)

```
┌──────┬────────────────────────────────────────────────┐
│ Side │ TopBar (agency lockup · search ⌘K · user)      │
│ Nav  ├────────────────────────────────────────────────┤
│      │ Good afternoon, Maya          [New study]      │
│      │ ┌ Needs your review (queue preview) ─────────┐ │
│      │ │ 3 findings need review        [Review]     │ │
│      │ │ Readout ready for approval    [Open]       │ │
│      │ └────────────────────────────────────────────┘ │
│      │ ┌ Active studies ──────┐ ┌ Recent activity ──┐ │
│      │ │ StudyCard ×3         │ │ event list        │ │
│      │ └──────────────────────┘ └───────────────────┘ │
│      │ ┌ Recently published ──┐ ┌ Ask Qori entry ───┐ │
│      │ └──────────────────────┘ └───────────────────┘ │
└──────┴────────────────────────────────────────────────┘
```

Panel order (fixed v1, "customizable in spirit"): 1 Needs your review (only if items; top slot) · 2 Active studies (pinned first) · 3 Recent activity · 4 Recently published outputs · 5 Ask Qori entry (query field, recent questions) · 6 Stale-evidence and governance alerts appear as a banner-style panel only when present. Archived research reachable via Studies index filter, not a Home panel.

## Data
Queue preview (top 3 actionable), active studies (status, progress, staleness roll-up), recent activity events, recent artifacts (workflow + publication status), user recents/pins, org alerts.

## Interactions
Panel items → drawer or destination screen; queue "Review" enters review flow; New study dialog (see flow). No panel drag in v1.

## States
First-use (no studies): welcome empty state teaching workflow + "New study" + sample tour link. No queue items: panel hidden, not empty. Partial: panels render independently with own skeletons. Integration banner slot above panels.

## Breakpoints
xl: 2-col panel grid · lg: 2-col, narrower · md: 1-col, queue first · sm: 1-col, bottom tab bar, greeting condenses.

## A11y
h1 = greeting; each panel a labeled region with h2; queue items announce counts; skip link to main.

## API capabilities expected
`GET /me/home` aggregate (queue preview, active studies, activity, recent artifacts), or discrete endpoints per panel with independent loading.

## Unresolved
- Personalized panel show/hide in v1.1? (v1 fixed order)
- Activity feed granularity (per-event vs digest)


## UX-2 reconciliation addendum
Order confirmed: 1) Needs your review (focal) — briefs to approve, PII reviews, findings to review, artifacts to approve, failed publications, stale evidence. 2) Active studies with lifecycle position + computed next action. 3) Start research persistent primary. 4) Recent work. 5) Search & Ask entry. No vanity metrics. Class: full page.

## Refinements (Block 1 review)
- Greeting line: "Hello, {name} · {date}" — count lives in the "Needs your review" header only.
- Study-card next action is a text link ("Next: …") — reverted from button treatment per review; buttons on Home stay reserved for queue-item actions.
- Search field placeholder advertises the unified surface: "Search, or ask Qori a question…".
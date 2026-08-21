# Screen: Work Queue

**Route** `/queue` · **Purpose**: The pull surface for everything needing action. Prioritized by actionability; not a Slack clone.

## Hierarchy
PageHeader (h1 Work Queue · count) → filter tabs: **Needs action · Waiting on others · Done** → WorkQueueItem list, grouped by kind, priority order:

1. Review gates (findings, themes, privacy reviews, artifact approvals)
2. Failures needing retry (publication failed, analysis failed)
3. Governance (holds, records review)
4. Informational (background task completed, study archived, evidence became stale)

Examples: "3 findings need review [Review]" · "Readout ready for approval [Open]" · "GitHub publication failed — Veteran Telehealth readout [Retry]" · "Evidence in Scheduling study became stale [View]" · "Transcript needs privacy review [Review]".

## Data
Queue items (kind, statement, refs, primary action, created, priority, state), counts per tab.

## Interactions
Primary action inline (Review enters batch review flow with "next item" chaining); row → context; batch select for same-kind items (accept N reviews sequentially, never blind-batch-accept); dismiss informational items; item auto-clears when resolved anywhere (Slack included — canonical state is Core).

## States
Empty ("You're caught up" + link to active studies), items resolved elsewhere (grey flash + removal announced), failure items carry cause preview, permission-scoped (privacy reviews only to authorized reviewers).

## Breakpoints
Single column at all sizes; actions remain visible at sm (stacked under statement); tabs scrollable.

## A11y
Items are list items with full accessible names (kind + statement + age); inline action buttons named specifically ("Review 3 findings in Veteran Telehealth"); removal announced politely; badge count in nav matches h1 count.

## API
`GET /queue?tab`, `POST /queue/:id/action`, dismissal, live count endpoint (nav badge).

## Unresolved
- Assignment model (personal vs team queue views)
- Digest cadence relationship with Slack notifications


## UX-2 reconciliation addendum
WHAT NEEDS ME NOW: brief approvals, PII reviews, analysis completed (info), findings review, artifact approvals, publication failures, stale evidence. Not a Slack-notification mirror. Row = item + study + why + age + one action deep-linking to the gate. FUTURE: evidence-candidate queue joins here (SA-6). Class: review queue.

## Refinements (Block 1 review)
- Empty queue = success state: "Nothing needs you right now" + running-studies links, never a dead end.
- Ages >3d escalate: warning tone + "aging".
- Kind renders as an inline mono chip on each row (APPROVAL/PRIVACY/FINDINGS/FAILURE), not stacked section headers.

## Notification model (explicit constraint)
There is NO notification infrastructure (no push, no email, no toasts-as-notifications). The Work Queue IS the notification system: every event that would have been a Slack DM (approval requests, PII reviews, completed analyses, failures, stale evidence) lands here, surfaces on Home's "Needs your review," and counts in the nav badge. Toasts confirm the user's OWN actions only.
GAP (Phase 9): infrequent users — a stakeholder approver may not log in daily; a pending approval can sit unseen. Out-of-band nudge (email) requires a backend capability that does not exist; flagged, not designed around.
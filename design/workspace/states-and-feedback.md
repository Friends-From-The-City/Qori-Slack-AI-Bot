# States & Feedback

## Universal state matrix

Every major screen/component must define these states. Defaults below; screen specs note deviations.

| State | Treatment |
|---|---|
| Default | Per component spec |
| Hover | Surface tint shift (`surface-hover`), no size change |
| Focus | 2px `focus` ring, 2px offset |
| Selected | `surface-selected` + 2px inset start-border in `accent-ink`; never color-only (checkmark or border) |
| Loading | Skeletons matching final layout (cards, rows, text lines); never full-page spinners; skeletons ≥300ms delay to avoid flash |
| Empty (first-use) | Illustration-free EmptyState: heading, one-sentence explanation of the workflow, primary action |
| Empty (filtered) | "No results for these filters" + Clear filters |
| Partial data | Render what exists; missing sections show inline "Not yet available — Qori is still analyzing" with progress link |
| Success | Toast (polite, auto-dismiss 6s, pausable) + inline state change |
| Warning | Inline banner in-context, icon + text, never toast-only |
| Stale | StaleIndicator: clock icon + "Evidence from Jan 2025 (19 months old)"; on cards a compact clock + tooltip |
| Error | Inline ErrorState: plain-language cause + one recovery action; global errors banner at page top, focus moved to it |
| Permission denied | Explains what the item is at a level the user may know ("A finding in a study you don't have access to") + who to ask; never a bare 403 |
| Archived | Muted surface + "Archived" badge; read-only; restore action if permitted |
| Disabled | Reduced contrast still ≥3:1; tooltip explains why |
| Offline / integration unavailable | Banner scoped to the affected capability ("GitHub is unreachable — publishing paused, research work unaffected") |
| AI processing | ProgressStepper (see `interaction-model.md` §4) inline or in drawer; queued state shows position ("Waiting to start — 2 tasks ahead") |
| Publication failed | PublicationStatus component: research status badge unchanged; separate red "Publication failed · Retry" pill |

## Notification model

- **Toast**: transient confirmations of the user's own action only.
- **Work Queue item**: anything requiring action or that completed in the background (see `screens/work-queue.md`).
- **Banner**: environmental conditions (integration down, governance hold).
- Slack remains the push channel; the Workspace never re-implements Slack notifications — the Work Queue is a pull surface.

## Recoverable failure pattern

Failed AI task → stepper stops at failed step → cause in plain language → primary Retry (idempotent, per ADR-0036), secondary Cancel → on cancel, partial results are kept and labeled "Partial — analysis cancelled".

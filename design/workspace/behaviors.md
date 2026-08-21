# System Behaviors (absorbs Phase 4C, approved patterns referenced)

## Generation / long-running analysis (UX-2 §21)
Inline narrative progress, never spinner-in-box: stepped checklist naming real inputs ("Read 2 discovery sources you selected", "6 sessions ready", "Extracting patterns"), honest estimate, step N of M from contract task list. Non-blocking: researcher may leave; lifecycle rail node shows the running state; completion lands in Work Queue + suggested-next. Failure: recoverable, states what survived + retry; partial availability rendered honestly ("4 of 6 sessions analyzed").

## Failure & retry
Publication failure never un-approves (workflow vs publication). Retry is idempotent and stated. Generation failure keeps inputs; retry re-runs from the failed step where the backend supports it.

## Layout composition (interaction classes, UX-2 §38)
full page (Home, study, evidence) . guided setup (New Project ONLY) . structured editor (brief) . confirmation-over-inherited-state (plan) . table/grid (codebook, schema, evidence) . source viewer (transcripts) . split-pane workspace (gates) . side drawer (trail) . contextual panel (synthesis initiation, context/trace) . review queue (work queue, match review) . artifact viewer (readouts) . modal ONLY for lightweight actions (reject note, promote confirm). No modal-heavy Slack translation. Every container choice has a stated reason in its spec.

## Orientation
Org > Project > Study compact breadcrumb, always. Lifecycle rail = position in the research, one current node, computed next action. Every locked step names its unlock. Every screen reachable from Home in <=3 intentional steps.

## Keyboard
Global: / search, g+letter nav, ? keymap. Gate frame keys per Phase 3. All decisions keyboard-complete; focus visible always.

## Responsive (UX-2 §35)
Desktop large: rail + work surface + context panel. Laptop: context panel collapses to on-demand drawer. Tablet: rail collapses to horizontal stage strip (B-form); tables keep semantic headers, priority columns. Mobile: read + review + approve preserved (queues, peeks, approvals, reading); creation/editing degrade gracefully to "continue on desktop" only where truly unusable; trail drawer becomes full-sheet. Touch targets >=44px.

## Empty states
Every empty state names the prerequisite step and links it ("No evidence yet — analyze your first session"). Never dead-ends, never decorative illustration filler.

## Content design (UX-2 §36)
Plain research language: Start research, Ready for review, Analyze sessions, Evidence, Publish. Forbidden in researcher UI: cascade variable, construct, template execution, projection state, LLM task (admin diagnostics only). Per design/workspace/content-design.md.
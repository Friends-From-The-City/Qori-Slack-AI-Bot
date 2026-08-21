# Runtime Reconciliation (Phase B, PR #346)

Full matrix and rulings in "Phase B — Runtime Reconciliation.dc.html" at project root. This file is the package-resident record.

## KEEP
Home . Finding/Recommendation detail (UX-2B accept/reject is real) . Work Queue . Artifact Review (with CA-002 caveat shown) . Search/Ask (scoped to variable search; full-text = gap) . Admin (+repo settings) . design system / a11y / responsive / branding / traceability grammar / component inventory / wait states / workflow-vs-publication separation.

## MODIFY
- Study experience: re-founded on lifecycle + dependency classes; 3 alternatives evaluated (see DC); recommended: Workspace model (persistent lifecycle rail + work surface + context panel) with next-action logic and state-first evidence table.
- Sources: unified ingestion (drag-drop + paste, no tabs), hosts PII review gate; plain-text viewer (no spans/highlight/comments — NOT IMPLEMENTED).
- Evidence: state-first table (candidate/accepted/rejected/stale legible without reading items); no manual create/edit/promote affordances.
- IA: study tabs remain Overview/Sources/Evidence/Findings/Outputs but Overview leads with lifecycle position + next action + needs-review.
- Phase 3 gate 2 (codebook): runtime decisions are Keep/Edit(label,definition,include/exclude)/Remove/Add — "Merge" is NOT a runtime action -> moved to FUTURE. Gate 3 (match review): entry statuses are reviewed / no_grouping_applies / uncodable; code assignment via pre-checked code checkboxes; bulk approve applies to proposed matches only.

## ADD (P0 -> P2)
P0: New Project, Brief form, Brief approval, Plan form, Synthesis initiation, PII review. P1: Guide form, Session analysis, Readout initiation, Discovery hub. P2: Participants (basic, not CRM), Outreach, Observers, Survey pipeline (schema/privacy/codebook/match per survey-codebook.md), Tickets (2-step).

## DEFER (labeled FUTURE / NOT CURRENTLY IMPLEMENTED wherever shown)
Inline transcript highlighting . exact-span annotations . researcher comments on sources . manual transcript coding . manual nugget creation . promote-to-evidence . stable span anchors . media clips . codebook merge . content_readout template . observer role . cross-study operations . multi-stakeholder approval routing.

## PREFILLED vs DERIVED (addendum D)
PREFILLED (visible, editable, provenance-labeled):
- problem statement (from project) . learning objectives (from discovery stakeholder questions) . methodology (from discovery recommendation) . out of scope (barrier coverage) . participant approach (hints) . start date (next Monday default) . lead researcher in PLAN (users_select — legitimately reassignable) . enrichment selection (auto-detected, all on, researcher may exclude) . survey field roles + suggested redaction text + pre-checked match codes (override is the review work itself).
DERIVED (never an input; surfaced read-only where useful):
- study selection (URL context) . actor identity / lead researcher in BRIEF (session auth; no field exists at runtime) . participant code PT-NNN . session stats . enrichment availability . slug . approver (read-only context, set at project level) . timeline phases.
DROPPED (Slack-era): channel toggle . tabs . paste-vs-file radio . observer channel CTA . study dropdowns.

## Backend gaps encountered (gap report feed)
CA-002 readout projection-boundary violation . CA-003 ticket lineage . no canonical finding/recommendation constructs from synthesis (artifact-only) . jobs + design_opportunities variable-only (no construct type) . no full-text search . no nugget-level review . 8 source-analysis capabilities . plan-approval doc contradiction (artifact-lifecycle.md vs research-plan.md) . single stakeholder only . no stakeholder overview surface.

## CC implementation order (recommendation)
1. New Project + Brief form + Brief approval (unlocks the operating loop)
2. PII review (unblocks analysis; highest-risk queue)
3. Plan + Synthesis initiation + evidence/findings review (UX-2B UI over existing API)
4. Work queue wiring (approvals + reviews)
5. Readout view w/ evidence links + publish; tickets after CA-003 lineage fix.

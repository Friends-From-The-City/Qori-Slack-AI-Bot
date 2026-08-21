# Gap Report — Phase 9 (final rollup)

Every place the approved design meets a missing or broken backend capability. Nothing below is designed around; each renders honestly in v1.

## Class B — architecture defects (CC-confirmed, fixes planned)
- CA-002 readout projection: readouts read rendered GitHub Markdown, not canonical state. UI ships the intended mental model; artifact viewer states the fidelity limit in plain language ("section-level links reflect the generated document and may lag the live evidence").
- CA-003 ticket lineage: recommendation → GitHub issue relationship not persisted. Tickets drawer ships with a labeled ✂ seam ("full recommendation-to-ticket lineage isn't recorded yet"); trail shows the hop as unverified.

## Missing capabilities surfaced in v1 UI as honest limits
- No full-text search inside transcripts/documents — Search scoped to entities/variables; stated on the Search page.
- No nugget-level review API — extracted evidence renders un-judged ("extracted", no state chip), never implied-accepted.
- No canonical finding/recommendation constructs from non-survey synthesis (artifact-only, CA-002 adjacent); jobs + design_opportunities are variable-only.
- No notification infrastructure — Work Queue IS the notification system. RISK: infrequent approvers may not see pending approvals; out-of-band nudge (email) needs a backend capability decision.
- Single stakeholder approver with owner fallback; no multi-stakeholder routing, no stakeholder overview surface.
- Doc contradiction: artifact-lifecycle.md still describes a plan approval; runtime removed it (docs fix).

## FUTURE / APPROVED ARCHITECTURE (not in v1, designs ready)
- Source annotation & Promote-to-Evidence (SA-1..8, ADR-0046 candidate): spans, highlights, notes, comments, candidates, promotion, stale/broken anchors, AI-proposed candidates. v1 source viewer is read-only but reserves the layers (source-annotation-future.md).
- Evidence-candidate queue in Work Queue (SA-6).

## Deferred by product ruling
Codebook merge · content_readout template · observer role · cross-study operations · media clips · graph visualization (secondary to ledger).

## Accessibility acceptance gate (binds CC)
Per-screen a11y contracts in screens/*.md + accessibility.md: WCAG 2.2 AA + Section 508; keyboard-complete gates; live-region announcements; focus restoration; color-never-alone (state chips shape+glyph+word, age ramp carries "aging" label); contrast 4.5:1/3:1 including agency-theme guard.

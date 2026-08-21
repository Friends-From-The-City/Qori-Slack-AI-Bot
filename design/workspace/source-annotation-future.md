# Source Annotation & Promote to Evidence — FUTURE / APPROVED ARCHITECTURE

Source: docs/architecture/source-annotation-evidence-promotion.md (ADR 0046 candidate). ALL of this is FUTURE / NOT CURRENTLY IMPLEMENTED (slices SA-1..SA-8). Design exists so the v1 source viewer component is forward-compatible.

## Five concepts, never conflated (verbatim from architecture)
- SOURCE SPAN — anchored exact source material (frozen redacted snapshot + content hash). A reference, NOT evidence.
- ANNOTATION — researcher working note (types: note, evidence_candidate). Promotable. Not model input unless promoted + synthesized.
- COMMENT — collaboration only. NEVER evidence, NEVER model input by default, never enters the evidence graph.
- EVIDENCE CANDIDATE — flagged span/annotation, explicit staging state (reuses construct candidate semantics).
- PROMOTED EVIDENCE — canonical nugget (derivation_type human/hybrid) created ONLY by explicit Promote to Evidence; enters UX-2B candidate review.

## Future interaction (SA-6 viewer)
1. Select text -> span created (post-PII content only; blocked if pii_reviewed=false)
2. Contextual menu: Add Note / Comment / Mark Evidence Candidate / Promote to Evidence
3. Promote -> confirmation dialog (nugget type, shows exact frozen text + privacy/governance checks) -> candidate nugget + DERIVED_FROM + FK span provenance, atomic
4. Span highlight styles by status: annotation (grey underline), candidate (dashed + candidate chip), promoted (yellow custody underline + Evidence badge -> click opens construct)
5. Overlapping spans supported (merge rendering)
6. AI-proposed candidates (SA-7): dashed ✦ spans, researcher accepts/dismisses; never auto-accepted

## Text-state grammar (extends the settled three-state grammar)
- yellow underline = promoted canonical evidence (EV custody)
- dashed grey = candidate (AI-proposed or researcher-flagged)
- blue = active selection
- grey solid underline = annotation (working note, margin-anchored)
Comments live in the margin thread panel, visually apart from evidence marks; resolvable; never carry evidence styling.

## Anchor health (anchor_status)
valid (no mark) . stale — "Source changed since this was marked" warning chip; promoted evidence unaffected; researcher may re-anchor by creating a new span (no auto re-anchor) . broken — "Source no longer available" . archived. Snapshots never rewritten.

## Governance
Promotion irreversible except governed disposition. Span referenced by canonical evidence cannot be deleted (SOURCE_SPAN_IN_USE; archive instead). Candidate queue surfaces in Work Queue (future).

## Design rule for v1
The v1 source viewer ships read-only (scrub chips only) but its component contract reserves: selection layer, margin rail, span highlight layer — so SA-6 lands without re-architecture. No dead affordances in v1.
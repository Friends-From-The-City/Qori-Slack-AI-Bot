# Qori Consolidated Roadmap

Last updated: 2026-08-15

## Evidence + Context Architecture

| Phase | Status | Reference |
|-------|--------|-----------|
| Evidence foundation (tables, services, ADRs 0028-0031) | BUILT + VERIFIED IN DEV | PR #278 |
| Survey deterministic ingestion (CSV parse, schema review, stats, evidence) | IMPLEMENTED IN PR #279 / AWAITING DEV VERIFICATION | PR #279 |
| Survey qualitative coding + adjudication (codebooks, theme frequency, coding audit) | NOT BUILT / NEXT SURVEY SLICE | |
| Survey artifact v9 (evidence-first presentation) | CORRECTION PR / AWAITING DEV VERIFICATION | |
| Active Project Context Visibility (UX) | ROADMAP — not implemented | |
| Schema Review UX improvements (plain-language labels, help cues) | ROADMAP — not implemented | |
| XLS/XLSX survey ingestion | DISABLED until proper ingestion exists | |
| `/qori-ask` — evidence-backed research queries | NOT BUILT; evidence foundation intended to support it later | |
| Staleness detection | NOT BUILT; deferred until evidence graph is populated | |
| Discovery Cycle 2 — stakeholder guide | NOT BUILT | |
| Session nugget → evidence migration | NOT BUILT | |
| Affinity rewrite | NOT BUILT | |
| Personas rewrite | NOT BUILT | |
| Service blueprint rewrite | NOT BUILT | |
| Readout rewrite | NOT BUILT | |
| GitHub ticket lineage | NOT BUILT | |

## Existing Systems (Operational)

| System | Status |
|--------|--------|
| `/qori-start` project creation + GitHub scaffolding | Operational |
| Discovery workflows (desk research, stakeholder synthesis, survey synthesis) | Operational |
| Research brief / plan / guide generation | Operational |
| Session notes / transcript workflows | Operational |
| Analysis methods (affinity, personas, usability, etc.) | Operational |
| Readouts (research, engineering, leadership, etc.) | Operational |
| GitHub ticket creation | Operational |
| Outreach generation | Operational |
| Participant tracking | Operational |
| Admin center | Operational |
| PII review / disposition infrastructure | Operational |
| Cascade variable system (study_variables) | Operational |
| YAML consumes / emits / GET / CCA architecture | Operational |
| Dev → production deployment flow (Railway) | Operational |

## Four Cooperating Planes

The architecture is organized into four planes:

1. **Research Evidence Plane** — authoritative research state: sources, observations, constructs, findings, recommendations, evidence relationships, derivation metadata, review/adjudication state, provenance, method/version
2. **Contextual Cascade Plane (GET/CCA)** — existing contextual propagation: consumes, asks, commits, emits, destination-specific transformation, artifact generation, downstream accumulation
3. **Participant Operations Plane** — operational participant state: outreach, recruitment, participant tracker, scheduling/session assignment, participation status, participant codes
4. **Governance / Control Plane** — PII review, approval/disposition, authorization, admin center, audit, deletion/DSAR, lifecycle/environment controls

## Federal Readiness

| Area | Status |
|------|--------|
| NARA-compliant disposition audit logging (ADR 0025) | Operational |
| PII scrubbing at ingestion (ADR 0026) | Operational |
| Owner-gated deletion with retention schedules | Operational |
| Legal holds | Operational |
| DSAR compliance | Operational |
| Section 508 accessibility | Ongoing |

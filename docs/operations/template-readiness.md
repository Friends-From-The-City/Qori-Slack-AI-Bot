# Template Readiness Audit

Last updated: 2026-08-19 (RR-1 pre-release)

---

## Purpose

Audit all active research artifact templates for release readiness. For each template: name, purpose, rendering engine, inputs, canonical state sourcing, AI generation bounding, provenance retention, stable anchors, currency, and cleanup required.

---

## Tier 1: v7.0 Conformant Templates (17)

All have: interleaved Handlebars output_template, bounded AI tasks, cascade summary, OUTPUT BOUNDARIES (except research_plan — gap below), anti-fabrication guards, emit schemas.

| Template | Version | Purpose | Inputs from canonical state | AI bounded | Provenance refs | Stable anchors | Current | Cleanup needed |
|----------|:-------:|---------|:---------------------------:|:----------:|:---------------:|:--------------:|:-------:|:--------------|
| session_summary | v7.0 | Session analysis → nuggets | Yes (transcript, participant data) | Yes | Yes (per-nugget) | Yes (emit schemas) | Yes | None |
| affinity_mapping | v7.0 | Cross-session theme synthesis | Yes (consumes nuggets) | Yes | Yes (nugget refs) | Yes | Yes | None |
| persona_generator | v7.0 | Behavioral personas | Yes (consumes nuggets + themes) | Yes | Yes | Yes | Yes | None |
| journey_mapping | v7.0 | User journey stages | Yes (consumes nuggets + personas) | Yes | Yes | Yes | Yes | None |
| usability_issues_extractor | v7.0 | Prioritized usability issues | Yes (consumes nuggets) | Yes | Yes | Yes | Yes | **Verify emit `prioritized_issues` exists for research_readout** |
| jobs_to_be_done | v7.0 | Validated JTBD | Yes (consumes nuggets + themes) | Yes | Yes | Yes | Yes | None |
| design_opportunity_generator | v7.0 | Design HMW opportunities | Yes (consumes JTBD) | Yes | Yes | Yes | Yes | None |
| research_readout | v7.0 | Terminal synthesis → findings + recommendations | Yes (consumes upstream) | Yes | Yes (per-finding citations) | Yes | Yes | **Verify `prioritized_issues` contract** |
| designer_readout | v7.0 | Design team readout | Yes (consumes research_readout) | Yes | Yes | Yes | Yes | None |
| engineering_readout | v7.0 | Engineering readout | Yes (consumes research_readout) | Yes | Yes | Yes | Yes | None |
| accessibility_readout | v7.0 | Accessibility readout | Yes (consumes research_readout) | Yes | Yes | Yes | Yes | None |
| leadership_readout | v7.0 | Executive summary | Yes (consumes research_readout) | Yes | Yes | Yes | Yes | None |
| research_brief | v7.0 | Approval gate document | Yes (discovery vars optional) | Yes | Yes (discovery citations) | Yes | Yes | None |
| research_plan | v7.0 | Execution plan | Yes (consumes brief) | Yes | Yes | Yes | Yes | **Add OUTPUT BOUNDARIES** |
| discussion_guide | v7.0 | Interview guide | Yes (consumes plan) | Yes | Yes | Yes | Yes | None |
| desk_research | v7.0 | Discovery desk research | Yes (discovery scope) | Yes | Yes | Yes | Yes | None |
| stakeholder_synthesis | v7.0 | Discovery stakeholder synthesis | Yes (discovery scope) | Yes | Yes | Yes | Yes | None |
| survey_synthesis | v7.0 | Discovery survey synthesis | Yes (discovery scope) | Yes | Yes | Yes | Yes | None |

### Tier 1 Cleanup Required Before Release

| Item | Template | Priority | Description |
|------|----------|----------|-------------|
| 1 | research_plan | **RR-1** | Add OUTPUT BOUNDARIES instruction (only v7.0 template missing it) |
| 2 | usability_issues → research_readout | **RR-1** | Verify `prioritized_issues` emit contract is complete and reachable |

---

## Tier 2: Utility Templates (7)

Intentionally non-conformant — no cascade participation, no v7.0 requirements.

| Template | Version | Purpose | Rendering | Inputs canonical | AI bounded | Current | Cleanup needed |
|----------|:-------:|---------|-----------|:----------------:|:----------:|:-------:|:--------------|
| participant_outreach | v4.1 | Recruitment/reminder emails | Handlebars + 2 AI tasks | Participant data from DB | Yes | Yes | None |
| session_notes | v2.1 | Structure raw observations | Handlebars + 1 AI task | Manual input | Yes | Yes | None |
| transcript_upload | v2.4 | Upload + PII redaction + coding | Handlebars + 2 AI tasks | File upload | Yes (7 enforcement rules) | Yes | None |
| stakeholder_interview_guide | v2.1 | Internal interview guide | Handlebars + 1 AI task | Manual input | Yes | Yes | None |
| research_request | v1.1 | Stakeholder research requests | Handlebars + 4 AI tasks | Manual input | Yes | Yes | Dead `llm_config` referencing GPT-4o (harmless) |
| github_issues_generator | v4.0 | Findings → GitHub issues | Handlebars + 1 AI task | Manual readout input | Yes | Yes | Should eventually consume readout emits; not blocking |
| targeted_readouts | v4.1 | Multi-audience reports | Handlebars + 1 monolithic task | Manual input | Fragile (5+ format branches) | Yes | **Low priority** — works but monolithic prompt is maintenance-fragile |

### Tier 2 Cleanup Required Before Release

None blocking. `targeted_readouts` fragility is a maintenance concern, not a release blocker.

---

## Tier 3: Needs v7.0 Restructure (2)

| Template | Version | Issue | Cleanup needed |
|----------|:-------:|-------|:--------------|
| service_blueprint | v1.2 | Single-LLM blob, has consumes but no emits, no v7.0 structure | Low traffic. Not blocking release. |
| targeted_readouts | v4.1 | Monolithic prompt, 5+ format branches, no cascade wiring | Works. Refactor later. Not blocking release. |

---

## Tier 4: Data-Only Template (1)

| Template | Version | Purpose | AI? | Cleanup needed |
|----------|:-------:|---------|:---:|:--------------|
| participant_tracker | v1.1 | Recruitment tracking sheet | No (pure Handlebars) | No formal contract between template and handler. Not blocking release. |

---

## Summary

| Category | Count | Release blocking |
|----------|:-----:|:----------------:|
| v7.0 conformant | 17 | 2 minor cleanup items |
| Utility (non-conformant by design) | 7 | 0 |
| Needs v7.0 restructure | 2 | 0 |
| Data-only | 1 | 0 |
| **Total** | **27** | **2** |

### Minimum Template Cleanup for Release

1. **research_plan** — Add OUTPUT BOUNDARIES instruction to prompt
2. **usability_issues → research_readout** — Verify `prioritized_issues` emit exists and is reachable by research_readout consumes

Both are small, targeted fixes.

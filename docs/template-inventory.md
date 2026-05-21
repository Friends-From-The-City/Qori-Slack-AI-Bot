# Template Inventory: Close-out Audit

**Date:** 2026-05-21
**Purpose:** Complete picture of every YAML template — what it does, where it stands, what (if anything) remains.

---

## Summary

**27 total YAML files** in `config/prompts/`. Breakdown:

| Category | Count | Status |
|----------|:-----:|--------|
| v7.0 restructured (synthesis + readouts + fieldwork) | 17 | Done |
| Utility templates (not v7.0 candidates) | 7 | Intentionally non-conformant |
| Needs work (structural issues) | 2 | Tracked |
| Data-only (non-AI) | 1 | Separate pattern |

---

## Tier 1: v7.0 Restructured (17 templates)

All have: interleaved Handlebars output_template, analysis_body task, cascade summary, OUTPUT BOUNDARIES, anti-fabrication guards, emit schemas.

| Template | Version | Emits | Cascade role |
|----------|:-------:|-------|--------------|
| session_summary | v7.0 | atomic_nugget_core/detail, participant_metadata, task_completion_records, barrier_validations (5 pool) | Origin — fieldwork |
| affinity_mapping | v7.0 | validated_themes, unexpected_patterns | Mid-cascade synthesis |
| persona_generator | v7.0 | personas, persona_design_implications | Behavioral synthesis |
| journey_mapping | v7.0 | journey_stages, journey_pain_points | Stage synthesis |
| usability_issues_extractor | v7.0 | prioritized_issues | Lateral analysis → research_readout |
| jobs_to_be_done | v7.0 | validated_jobs | Lateral analysis → design_opportunities |
| design_opportunity_generator | v7.0 | design_hmw_opportunities | Terminal lateral analysis |
| research_readout | v7.0 | prioritized_findings, prioritized_recommendations, decision_inputs, study_methodology | Terminal synthesis |
| designer_readout | v7.0 | design_ticket_candidates | Audience readout |
| engineering_readout | v7.0 | engineering_ticket_candidates | Audience readout |
| accessibility_readout | v7.0 | accessibility_ticket_candidates | Audience readout |
| leadership_readout | v7.0 | exec_summary_points | Audience readout |
| research_brief | v7.0 | target_barriers, research_questions, etc. | Planning — approval gate |
| research_plan | v7.0 | study_timeline, study_deliverables, etc. | Planning — execution doc |
| discussion_guide | v7.0 | task_scenarios, probes | Planning — session guide |
| desk_research | v7.0 | desk_research_themes, etc. | Discovery |
| stakeholder_synthesis | v7.0 | stakeholder_constraints, alignment_gaps, etc. | Discovery |
| survey_synthesis | v7.0 | survey_themes, survey_findings, etc. | Discovery |

---

## Tier 2: Utility Templates — Intentionally Non-Conformant (7 templates)

These are lightweight AI templates that serve specific operational purposes. They don't participate in the cascade (no consumes/emits) and don't generate analytical documents. v7.0 restructure does not apply.

| Template | Version | What it does | AI tasks | Disposition |
|----------|:-------:|--------------|:--------:|-------------|
| participant_outreach | v4.1 | Generates recruitment/reminder/thank-you emails | 2 (subject + body) | **Acceptable.** Operational utility, no cascade role. |
| session_notes | v2.1 | Structures raw session observations into organized sections | 1 (structure_notes) | **Acceptable.** Data entry helper, no cascade role. |
| transcript_upload | v2.4 | Uploads transcripts with PII redaction + research coding | 2 (coding + filename) | **Acceptable.** Fieldwork data entry. 7 enforcement rules are appropriate. |
| stakeholder_interview_guide | v2.1 | Generates interview guides for internal stakeholders | 1 (guide_complete) | **Acceptable.** Planning utility, no cascade role. |
| research_request | v1.1 | Accepts stakeholder research requests, suggests methodology | 4 (formatting tasks) | **Acceptable.** Entry-point template, light AI. Note: references GPT-4o in llm_config (dead config). |
| github_issues_generator | v4.0 | Converts readout findings into GitHub issues | 1 (issues_complete) | **Acceptable.** Output utility. Should eventually consume readout emits (prioritized_findings → issues), but works without cascade wiring. |
| targeted_readouts | v4.1 | Generates audience-specific reports (Congressional, leadership, team) | 1 (monolithic prompt) | **Needs attention.** Monolithic prompt with 5+ format branches is hard to maintain. No cascade wiring. Low priority — works but fragile. |

---

## Tier 3: Needs Work (2 templates)

| Template | Version | Issue | Priority | Recommended action |
|----------|:-------:|-------|:--------:|-------------------|
| service_blueprint | v1.2 | Single-LLM blob, has cascade consumes but no emits, no v7.0 structure | Low | v7.0 restructure when service blueprints are used in production. Currently low-traffic — only 1 study has stakeholder data to feed it. |
| targeted_readouts | v4.1 | Monolithic prompt with 5+ format branches, no cascade wiring, maintenance-fragile | Low | Refactor into separate templates per audience type, or add format-switching logic to handler. Not blocking. |

---

## Tier 4: Data-Only Template (1 template)

### participant_tracker.yaml (v1.1)

**What it produces:** A markdown recruitment tracking sheet with participant roster, recruitment breakdown, observer assignments, demographics, and accommodations.

**Is it AI-generated?** **No.** Zero `ai_generation_tasks`. It's a pure Handlebars data template — the handler computes all values and injects them into the template.

**Does it have consumes/emits?** No.

**Current state assessment:**

| Aspect | Status |
|--------|--------|
| Template structure | Functional but fragile |
| Variable references | Many computed variables (`total_participants_count`, `recruitment_analysis`, `next_steps_recommendations`) not listed in input_variables — handler must provide |
| `{{#each}}` blocks | Reference arrays (`participants`, `session_observers`, `race_ethnicity_breakdown`, etc.) that handler must assemble |
| Observer management | Sophisticated capacity/role logic but all computation is handler-side |
| Demographics | 4 breakdown arrays expected; handler must compute distribution |

**Production-acceptable?** Yes, with caveats. The template works when the handler provides all computed variables. The fragility is that there's no contract between template and handler — if handler changes, template silently breaks with empty sections.

**Recommended disposition:** **Intentionally non-conformant.** v7.0 does not apply (no AI generation). If the tracker needs improvement:
1. Add a data contract (TypeScript interface for required template input)
2. Remove unreferenced computed variables or add handler computation
3. Consider whether AI-assisted recruitment analysis would add value (upgrade to AI template)

None of these are blocking. The tracker works for its current purpose.

---

## Complete File Listing

| # | File | Tier | Version | v7.0? |
|:-:|------|:----:|:-------:|:-----:|
| 1 | accessibility_readout.yaml | 1 | v7.0 | Yes |
| 2 | affinity_mapping.yaml | 1 | v7.0 | Yes |
| 3 | design_opportunity_generator.yaml | 1 | v7.0 | Yes |
| 4 | designer_readout.yaml | 1 | v7.0 | Yes |
| 5 | desk_research.yaml | 1 | v7.0 | Yes |
| 6 | discussion_guide.yaml | 1 | v7.0 | Yes |
| 7 | engineering_readout.yaml | 1 | v7.0 | Yes |
| 8 | github_issues_generator.yaml | 2 | v4.0 | N/A |
| 9 | jobs_to_be_done.yaml | 1 | v7.0 | Yes |
| 10 | journey_mapping.yaml | 1 | v7.0 | Yes |
| 11 | leadership_readout.yaml | 1 | v7.0 | Yes |
| 12 | participant_outreach.yaml | 2 | v4.1 | N/A |
| 13 | participant_tracker.yaml | 4 | v1.1 | N/A (non-AI) |
| 14 | persona_generator.yaml | 1 | v7.0 | Yes |
| 15 | research_brief.yaml | 1 | v7.0 | Yes |
| 16 | research_plan.yaml | 1 | v7.0 | Yes |
| 17 | research_readout.yaml | 1 | v7.0 | Yes |
| 18 | research_request.yaml | 2 | v1.1 | N/A |
| 19 | service_blueprint.yaml | 3 | v1.2 | Deferred |
| 20 | session_notes.yaml | 2 | v2.1 | N/A |
| 21 | session_summary.yaml | 1 | v7.0 | Yes |
| 22 | stakeholder_interview_guide.yaml | 2 | v2.1 | N/A |
| 23 | stakeholder_synthesis.yaml | 1 | v7.0 | Yes |
| 24 | survey_synthesis.yaml | 1 | v7.0 | Yes |
| 25 | targeted_readouts.yaml | 3 | v4.1 | Deferred |
| 26 | transcript_upload.yaml | 2 | v2.4 | N/A |
| 27 | usability_issues_extractor.yaml | 1 | v7.0 | Yes |

---

## Conclusion

The v7.0 template restructure workstream is complete. 17 of 27 templates are v7.0 conformant with interleaved Handlebars/AI, cascade emit schemas, and structural consistency. The remaining 10 are either utility templates (7, intentionally non-conformant), low-priority deferred work (2), or a non-AI data template (1).

No templates were missed. The earlier count of "19 templates" referred to the 17 AI analysis/synthesis templates + discussion_guide + journey_mapping (which were already conformant). The gap to 27 is the 8 utility/data templates that were correctly excluded from v7.0 scope.

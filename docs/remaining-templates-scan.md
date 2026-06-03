# Remaining Templates Scan

**Date:** 2026-05-21 (original) → **Updated:** 2026-06-03
**Purpose:** Lightweight structural audit before committing to v7.0 restructure sessions

---

## Summary (Updated 2026-06-03)

| Template | Version | v7.0 Pattern | Cascade Contract | Emits | Status |
|----------|---------|:------------:|:----------------:|:-----:|:------:|
| discussion_guide | v7.0 | Done | Clean | task_scenarios, probes | **Complete** |
| journey_mapping | v4.0 | Done | Clean | journey_stages, journey_pain_points | **Complete** |
| participant_tracker | v1.1 | N/A (data-only) | N/A | N/A | **Complete** (handler provides all vars) |
| jobs_to_be_done | v7.0 | Done | Clean | validated_jobs | **Complete** |
| usability_issues | v7.0 | Done | Clean | prioritized_issues | **Complete** |
| design_opportunities | v7.0 | Done | Clean | design_hmw_opportunities | **Complete** |

**All 6 templates complete.** The v7.0 restructure work was done on 2026-05-21 for JTBD, usability_issues, and design_opportunities. participant_tracker handler was updated to provide all required variables.

---

## Changelog

### 2026-06-03 Update

This document was stale — it captured the state *before* the v7.0 restructure work was completed on the same day (2026-05-21). Verified current state:

**jobs_to_be_done.yaml (v7.0)**
- ✅ Interleaved Handlebars/AI with single `analysis_body` task
- ✅ `emits:` section with `validated_jobs` schema
- ✅ `consumes:` 5 variables (fixed in Batch 1 ADR 0021)
- ✅ Cascade summary section
- ✅ OUTPUT BOUNDARIES instruction
- ✅ `{{focus_area}}` bug fixed (removed, was never provided)
- ✅ Footer bug fixed (malformed footer removed)

**usability_issues_extractor.yaml (v7.0)**
- ✅ Interleaved Handlebars/AI with single `analysis_body` task
- ✅ `emits:` section with `prioritized_issues` schema
- ✅ `consumes:` 5 variables (fixed in Batch 1 ADR 0021)
- ✅ Cascade summary section
- ✅ OUTPUT BOUNDARIES instruction

**design_opportunity_generator.yaml (v7.0)**
- ✅ Interleaved Handlebars/AI with single `analysis_body` task
- ✅ `emits:` section with `design_hmw_opportunities` schema
- ✅ `consumes:` 8 variables (fixed in Batch 1 ADR 0021, duplicate removed)
- ✅ Cascade summary section
- ✅ OUTPUT BOUNDARIES instruction

**participant_tracker.yaml (v1.1)**
- ✅ Data-only template (no AI tasks) — this is intentional
- ✅ Handler (`participantYamlProcessor.ts`) now provides all required variables:
  - `participants` array with mapped data
  - `recruitment_breakdown`
  - Demographic breakdowns (`race_ethnicity_breakdown`, `age_range_breakdown`, etc.)
  - `session_observers` with full observer data
  - `recruitment_analysis`
  - `next_steps_recommendations`
  - Role counts (`note_taker_count`, etc.)
  - `accommodations`
- ✅ Metadata sections (`observer_management`, `workflow_integration`, `capacity_management`) are config/documentation, not runtime — acceptable

---

## Original scan (2026-05-21, superseded)

<details>
<summary>Historical record — click to expand</summary>

The original scan documented these as needing work:

- jobs_to_be_done v3.5 — Single-LLM blob, no emits
- usability_issues v3.1 — Single-LLM blob, no emits
- design_opportunities v2.4 — Single-LLM blob, no emits
- participant_tracker v1.1 — Variables not provided by handler

All were addressed on 2026-05-21 (templates) and by subsequent handler updates.

</details>

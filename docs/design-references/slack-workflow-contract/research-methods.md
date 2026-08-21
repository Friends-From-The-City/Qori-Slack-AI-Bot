# Research Methods Inventory

Supported research methods and method-specific objects, verified against runtime code.

## Methodology Selection

Researchers choose a methodology during the research brief. The `methodology` field in the brief modal offers:

- Interviews
- Usability Testing
- Survey
- Mixed Methods
- Other

Source: `backend/src/helpers/slack/ui/researchBriefEntryModal.ts` (methodology_block radio_buttons)

This selection is stored as `methodology_selection` in cascade variables and pre-fills downstream modals (plan, discussion guide).

## Method → Workflow Mapping

### Interviews

**Status:** IMPLEMENTED

| Stage | Implementation |
|-------|---------------|
| Setup | `/qori-plan` — research plan with interview methodology |
| Preparation | `/qori-discuss` — discussion guide (session type, questions, participant description) |
| Recruitment | `/qori-fieldwork` → add participants, outreach (initial recruitment, confirmation, reminder) |
| Fieldwork | Observers assigned, observer guide DM sent |
| Data capture | `/qori-fieldwork` → upload transcript or enter manual observations |
| Privacy | PII review (auto-scrub + manual review → approve/reject/rescrub) |
| Per-session analysis | `/qori-analyze` → session_summary.yaml |
| Cross-session synthesis | `/qori-synthesis` → 6 methods |
| Reporting | `/qori-report` → research readout or targeted readouts |
| Handoff | `/qori-tickets` → GitHub Issues |

### Usability Testing

**Status:** IMPLEMENTED (shares interview pipeline with usability-specific synthesis)

| Stage | Implementation |
|-------|---------------|
| Setup | `/qori-plan` — research plan with usability testing methodology |
| Preparation | `/qori-discuss` — discussion guide with task-based session type |
| Recruitment | Same as interviews |
| Fieldwork | Same as interviews |
| Data capture | Same as interviews (transcripts + observations) |
| Privacy | Same as interviews |
| Per-session analysis | `/qori-analyze` → session_summary.yaml (emits task_completion_records) |
| Usability-specific analysis | `/qori-synthesis` → usability_issues_extractor.yaml (Nielsen severity) |
| Cross-session synthesis | `/qori-synthesis` → other 5 methods also available |
| Reporting | `/qori-report` |
| Handoff | `/qori-tickets` (accessibility audience available) |

**Usability-specific objects:**
- `task_completion_records` — per-task success/failure, timing, attempts, blockers
- `prioritized_issues` — Nielsen severity-rated usability findings
- `accessibility_ticket_candidate` — WCAG-linked issue tickets

### Surveys

**Status:** IMPLEMENTED (dedicated pipeline via discovery + survey handlers)

| Stage | Implementation |
|-------|---------------|
| Upload | `/qori-discover` → survey synthesis type (CSV upload) |
| Schema review | Auto-inferred field roles → researcher confirms (nominal/ordinal/continuous/etc.) |
| Privacy review | PII auto-detection → per-entry disposition (clear/redacted/restricted) |
| Codebook | AI generates draft codes → researcher reviews (keep/edit/remove) |
| Match review | AI assigns entries to codes → researcher reviews (accept/reject/uncodable) |
| Synthesis | `/qori-synthesis` with survey-derived variables |
| Deterministic stats | `computeSurveyComputedFacts()` — field distributions, cross-tabs, demographics |
| Qualitative synthesis | `survey_synthesis.yaml` — theme/finding/recommendation extraction |

**Survey-specific objects:**
- `SurveyField` — inferred role, sample values, distinct/present/missing counts
- `ConfirmedField` — researcher-confirmed role, ordinal order, demographic flag
- `SurveyCodebook` → `SurveyCode` — draft/accepted code groups
- `SurveyCodingRun` → `SurveyEntryAssignment` — entry-to-code matches
- `survey_themes`, `survey_findings`, `survey_recommendations` — cascade variables
- `sample_demographics` — respondent composition
- `dataset_summary`, `field_distribution`, `cross_tab` — deterministic evidence constructs

### Discovery (Pre-Study)

**Status:** IMPLEMENTED

| Type | Template | What It Produces |
|------|----------|-----------------|
| Desk Research | `desk_research.yaml` | Literature review, competitive analysis |
| Stakeholder Synthesis | `stakeholder_synthesis.yaml` | Stakeholder interview themes |
| Survey Synthesis | `survey_synthesis.yaml` | Survey response analysis |

Discovery is not a research method per se — it's a pre-study evidence-gathering phase that informs the brief. See `discovery.md` for full contract.

### Mixed Methods / Other

**Status:** PARTIALLY IMPLEMENTED

No dedicated mixed-methods workflow exists. Researchers who select "Mixed Methods" or "Other" use the same interview/usability pipeline. The methodology_selection value is stored but does not unlock method-specific templates or workflows.

## Method-Specific Objects Summary

| Object | Methods | Source | Persistence |
|--------|---------|--------|------------|
| Discussion guide | Interviews, Usability | `/qori-discuss` | Artifact (GitHub) |
| Participant record | Interviews, Usability | `/qori-fieldwork` | Canonical (study_participants) |
| Observer assignment | Interviews, Usability | `/qori-fieldwork` | Canonical (study_observers) |
| Outreach record | Interviews, Usability | `/qori-fieldwork` | Canonical (outreach tracking) |
| Transcript | Interviews, Usability | `/qori-fieldwork` | Canonical (study_notes) + GitHub |
| Manual observations | Interviews, Usability | `/qori-fieldwork` | Canonical (study_notes) |
| Task completion | Usability | `/qori-analyze` | Cascade (task_completion_records) |
| Barrier validation | Interviews, Usability | `/qori-analyze` | Cascade (barrier_validations) |
| Survey dataset | Surveys | `/qori-discover` | Canonical (evidence_source) + Redis cache |
| Survey schema | Surveys | Schema review | Canonical (evidence_construct) |
| Codebook | Surveys | Codebook handler | Canonical (survey_codebooks, survey_codes) |
| Code assignments | Surveys | Match review | Canonical (survey_entry_assignments) |
| Atomic nuggets | All | `/qori-analyze` | Cascade + Canonical (evidence_construct) |
| Themes | All | `/qori-synthesis` | Cascade + Canonical (evidence_construct) |
| Personas | All | `/qori-synthesis` | Cascade + Canonical (evidence_construct) |
| Journey stages | All | `/qori-synthesis` | Cascade + Canonical (evidence_construct) |
| Usability issues | Usability | `/qori-synthesis` | Cascade + Canonical (evidence_construct) |
| HMW opportunities | All | `/qori-synthesis` | Cascade (variable only) |
| Jobs | All | `/qori-synthesis` | Cascade (variable only) |

## Workspace Design Notes

- Method selection happens in the brief — Workspace should carry this through the study context
- Interview and usability share most of the pipeline — distinct only in usability-specific synthesis (usability_issues) and task completion tracking
- Surveys have a completely separate pipeline (upload → schema → privacy → codebook → match → synthesis)
- No method-specific Workspace screens are designed yet — the design package is method-agnostic
- CD decision: should method selection influence which synthesis options are highlighted/recommended?

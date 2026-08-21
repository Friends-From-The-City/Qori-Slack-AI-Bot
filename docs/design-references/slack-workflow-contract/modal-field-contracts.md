# Modal Field Contracts

Field tables for every researcher-facing modal in the current Slack surface. All tables verified against runtime modal code. Each table shows what the Workspace equivalent must collect, what can be inherited, and what authority the field has.

**All fields documented here reflect CURRENT runtime behavior.** Where a field is Slack-specific (no Workspace equivalent needed), it is noted.

## Authority Legend

| Code | Meaning |
|------|---------|
| CANONICAL | Authoritative DB record |
| CASCADE | study_variables projection |
| DERIVED | Computed from canonical state |
| AI PROPOSAL | Generated, not authoritative until accepted |
| ARTIFACT | Written into document, not canonical |
| EPHEMERAL | Slack/modal state only |

---

## /qori-start -- Project Creation

Source: `backend/src/helpers/slack/ui/projectCreateModal.ts`

| UI Label | block_id.action_id | Type | Req | Default | Authority | Workspace Derivable | Used By |
|----------|-------------------|------|-----|---------|-----------|--------------------|---------| 
| Project name | project_name.value | text | Yes | -- | CANONICAL (projects.name) | No | slug, GitHub path, all downstream |
| Description | project_description.value | text (multi) | No | -- | CANONICAL (projects.description) | No | display only |
| Problem statement | project_problem_statement.value | text (multi) | Yes | -- | CANONICAL (projects.problem_statement) | No | brief pre-fill, AI generation |
| Brief approver | project_stakeholder.stakeholder_select | users_select | No | Owner fallback | CANONICAL (project_members.is_stakeholder) | No | brief approval flow |
| Create channel | create_channel.value | checkboxes | No | ON | EPHEMERAL | Yes (drop for web) | Slack channel creation |

---

## /qori-brief -- Research Brief

Source: `backend/src/helpers/slack/ui/researchBriefModal.ts`

callback_id: `research_brief_modal`

| UI Label | block_id.action_id | Type | Req | Default/Inherited | Authority | Workspace Derivable | Used By |
|----------|-------------------|------|-----|-------------------|-----------|--------------------|---------| 
| Study name | study_name_block.study_name_input | plain_text_input | Yes | -- | CANONICAL (research_studies.name) | No | slug, GitHub path |
| Stakeholder | stakeholder_block.stakeholder_select | users_select | Yes | -- | CANONICAL (project_members.is_stakeholder) | No | approval routing |
| Problem statement | problem_statement_block.problem_statement_input | plain_text_input (multi) | Yes | project.problem_statement | CASCADE -> AI input | Partially (pre-fill from project) | AI brief generation |
| Learning objectives | learning_objectives_block.learning_objectives_input | plain_text_input (multi) | Yes | -- | CASCADE (research_objectives) | No | plan, synthesis, readout |
| Out of scope | out_of_scope_block.out_of_scope_input | plain_text_input (multi) | No (optional) | -- | CASCADE (out_of_scope) | No | brief boundary |
| Research method | research_method_block.research_method_select | static_select | Yes | -- | CASCADE (methodology_selection) | No | plan, discussion guide, synthesis |
| Custom method | method_override_block.method_override_input | plain_text_input | No (optional) | -- | CASCADE (methodology override) | No | combined/custom approaches |
| Participant approach | participant_approach_block.participant_approach_input | plain_text_input (multi) | Yes | -- | CASCADE (participant_approach) | No | plan |
| Recruitment sources | recruitment_sources_block.recruitment_sources_input | plain_text_input | No (optional) | -- | CASCADE (recruitment_sources) | No | brief |
| Start date | start_date_block.start_date_picker | datepicker | No (optional) | -- | CASCADE (start_date) | Yes (default: next Monday) | plan, timeline |
| Decision deadline | decision_deadline_block.decision_deadline_picker | datepicker | No (optional) | -- | CASCADE (decision_deadline) | Partially (start + timeline) | brief |
| Budget | budget_block.budget_input | plain_text_input | No (optional) | -- | CASCADE (budget) | No | brief |
| Discovery artifacts | (dynamic checkboxes) | checkboxes | No | All auto-selected | EPHEMERAL (selection) | No | AI brief generation (manual injection) |

**research_method_select options (static_select, NOT radio_buttons):**
- `usability_testing` -- Usability Testing
- `user_interviews` -- User Interviews
- `contextual_inquiry` -- Contextual Inquiry
- `concept_testing` -- Concept Testing
- `survey` -- Survey Research
- `card_sorting` -- Card Sorting
- `tree_testing` -- Tree Testing
- `mixed_methods` -- Mixed Methods

---

## /qori-plan -- Research Plan

Source: `backend/src/helpers/slack/ui/researchPlanGeneratorModal.ts`

callback_id: `research_plan_modal`

**Only 2 input fields.** Everything else consumed from cascade (brief variables). Study name displayed as non-editable context block set by `planModalOpener`.

| UI Label | block_id.action_id | Type | Req | Default/Inherited | Authority | Workspace Derivable | Used By |
|----------|-------------------|------|-----|-------------------|-----------|--------------------|---------| 
| Lead researcher | lead_researcher_block.lead_researcher_select | users_select | Yes | Current user (set by opener) | ARTIFACT | Yes (session auth user) | plan document |
| Operational risks | operational_risks_block.operational_risks_input | plain_text_input (multi) | No (optional) | -- | CASCADE (risks) | No | plan risk section |

**NOT in this modal (consumed from cascade):** research_method, num_participants, session_duration, start_date. These come from the approved brief via study_variables.

---

## /qori-discover -- Discovery Type Modals

### Desk Research / Stakeholder Synthesis

Source: `backend/src/helpers/slack/commands/discoverHandler.ts`

| UI Label | block_id.action_id | Type | Req | Authority | Used By |
|----------|-------------------|------|-----|-----------|---------|
| Topic | topic_block.topic | text | Yes | CASCADE (topic_slug derived) | artifact filename, variable key |
| Description | description_block.description | text (multi) | Yes | AI input | AI generation |
| Source files | files_block.files | file_input | Yes | EPHEMERAL -> AI input | AI generation |
| Question focus | question_focus_block.question_focus | text (multi) | No | AI input | AI generation focus |

### Survey Synthesis

| UI Label | block_id.action_id | Type | Req | Authority | Used By |
|----------|-------------------|------|-----|-----------|---------|
| Survey name | survey_name_block.survey_name | text | Yes | CASCADE | artifact filename |
| Description | description_block.description | text (multi) | Yes | AI input | AI generation |
| Source files | files_block.files | file_input | Yes | EPHEMERAL -> AI input | AI generation |
| Question focus | question_focus_block.question_focus | text (multi) | No | AI input | AI generation focus |

---

## /qori-discuss -- Discussion Guide

Source: `backend/src/helpers/slack/ui/discussionGuideModal.ts`

callback_id: `discussion_guide_modal`

Study name displayed as non-editable context block set by opener.

| UI Label | block_id.action_id | Type | Req | Default/Inherited | Authority | Workspace Derivable |
|----------|-------------------|------|-----|-------------------|-----------|---------------------|
| Research focus | research_focus_block.research_focus | plain_text_input (multi) | Yes | brief.research_objectives (pre-filled by opener) | AI input | Yes (cascade) |
| Research questions | research_questions_block.research_questions | plain_text_input (multi) | Yes | brief.research_questions (pre-filled by opener) | AI input | Yes (cascade) |
| Research method | research_method_block.research_method | static_select | Yes | brief.methodology_selection (pre-selected by opener) | AI input | Yes (cascade) |
| Session length | session_length_block.session_length | static_select | Yes | 60 minutes (initial_option) | AI input | No |
| Number of tasks / topics | task_count_block.task_count | static_select | Yes | 5 (initial_option) | AI input | No |
| Lead moderator | lead_moderator_block.lead_moderator_select | users_select | Yes | Current user (set by opener) | ARTIFACT | Yes (session auth user) |

**session_length options:** 30, 45, 60, 75, 90 (minutes)

**task_count options:** 1, 2, 3, 4, 5, 6, 7

**research_method options (matches brief):** usability_testing, user_interviews, card_sorting, concept_testing, contextual_inquiry, tree_testing, mixed_methods

**Cascade gate:** Opener hides form when required upstream variables are missing.

---

## /qori-analyze -- Session Analysis

Source: `backend/src/helpers/slack/commands/analyzeNotesHandler.ts`

callback_id: `analyze_notes_submit`

| UI Label | block_id.action_id | Type | Req | Dynamic | Authority |
|----------|-------------------|------|-----|---------|-----------|
| Study | study_select_block.study_select_test | static_select | Yes | From user's studies | EPHEMERAL (selection) |
| Session | session_select_block.analyze_notes_session_select | static_select | Yes | From study participants (after study) | EPHEMERAL (selection) |
| Session notes | notes_checkboxes_block.notes_checkboxes | checkboxes | Yes | From approved notes for session | EPHEMERAL (selection) |
| Context display | (read-only) | display | -- | Barrier/question counts from cascade | -- |

**Progressive disclosure:** Study -> Session -> Notes (each step populates the next via views.update).

---

## /qori-synthesis -- Research Synthesis

Source: `backend/src/helpers/slack/ui/researchSynthesisModal.ts`

callback_id: `research-synthesis-modal`

| UI Label | block_id.action_id | Type | Req | Dynamic | Authority |
|----------|-------------------|------|-----|---------|-----------|
| Study | study_select_block.study_select_synthesize | static_select | Yes | From user's studies | EPHEMERAL |
| Analysis method | analysis_method_block.analysis_method | static_select | Yes | -- | AI input (determines YAML template) |
| Session stats | (read-only) | display | -- | Participant/nugget breakdown | -- |
| Enrichments | enrichment_checkboxes | checkboxes | No | Auto-detected from existing variables | EPHEMERAL |

**Options for analysis_method:** affinity_mapping, journey_mapping, persona_generation, jobs_to_be_done, usability_issues, design_opportunities

Source of truth: `backend/src/helpers/slack/ui/researchSynthesisModal.ts:222-247` and `backend/src/application/synthesis.app-service.ts:64-71`.

**Enrichment checkboxes (dynamic):** themes, barriers, research_questions, personas, metadata, constraints, jobs -- shown only when corresponding cascade variables exist.

---

## /qori-report -- Research Readout

Source: `backend/src/helpers/slack/ui/readoutModal.ts`

callback_id: `readout_modal_submit`

| UI Label | block_id.action_id | Type | Req | Dynamic | Authority |
|----------|-------------------|------|-----|---------|-----------|
| Study | study_selection.study_selection_change | static_select | Yes | From user's studies | EPHEMERAL |
| Report type | report_type_selection | buttons (select_research_readout, select_targeted_readouts) | Yes | -- | Determines template |
| Audience | audience_selection.audience_checkboxes | checkboxes | Cond. | Only for targeted readouts when research readout exists | EPHEMERAL |

**Report types:** research_readout (full, single template), targeted_readouts (per-audience with per-audience findings).

**Targeted readout audience options (from modal):**
- `Design Team` -- design challenges + ticket candidates -> `designer_readout.yaml`
- `Engineering Team` -- technical challenges + ticket candidates -> `engineering_readout.yaml`
- `Accessibility Team` -- WCAG compliance + ticket candidates -> `accessibility_readout.yaml`
- `Executive Leadership` -- executive brief (BLUF style) -> `leadership_readout.yaml`

Note: `Product Leadership` exists as an alias in `readout.app-service.ts:380` mapping to `leadership_readout.yaml`, but is NOT shown as a modal option.

**Prerequisite gate:** Targeted readouts require an existing research readout. If none exists, modal shows error state and disables submit.

---

## /qori-tickets -- GitHub Issues

Source: `backend/src/helpers/slack/commands/ticketHandler.ts`

callback_ids: `tickets_step1_submit`, `tickets_step2_submit`

### Step 1

| UI Label | Type | Req | Authority |
|----------|------|-----|-----------|
| Study | static_select | Yes | EPHEMERAL |
| Audience | checkboxes | Yes | EPHEMERAL (designer/engineering/accessibility) |

### Step 2

| UI Label | Type | Req | Dynamic | Authority |
|----------|------|-----|---------|-----------|
| Ticket candidates | checkboxes | Yes | Filtered by audience from step 1 | CANONICAL (GitHub Issues created) |

**Runtime note:** ticketHandler reads ticket candidates from study_variables in Postgres (variable keys: `design_ticket_candidates`, `engineering_ticket_candidates`, `accessibility_ticket_candidates`). It does NOT use `github_issues_generator.yaml` at runtime. Each audience's candidates come from its corresponding targeted readout template.

**Idempotency:** Issues marked with `qori-action-id` for recovery.

---

## /qori-fieldwork -- Participant Addition

Source: `backend/src/helpers/slack/commands/participantHandler.ts`

callback_id: `add-participant-modal`

| UI Label | block_id.action_id | Type | Req | Authority |
|----------|-------------------|------|-----|-----------|
| Participant code | (read-only preview) | display | -- | DERIVED (next PT-NNN) |
| Participant name | participant_name | text | No | CANONICAL (study_participants) |
| Scheduled date | scheduled_date | date_picker | No | CANONICAL |
| Session time | session_time | time_picker | No | CANONICAL |
| Location/method | location | static_select | No | CANONICAL |
| Notes | notes | text (multi) | No | CANONICAL |

---

## Survey Pipeline Modals

The survey pipeline uses a multi-step review flow triggered from `/qori-discover` (survey). These are action-driven modals, not slash command modals.

### Schema Review

Source: `backend/src/helpers/slack/ui/surveySchemaReviewModal.ts`

callback_id: `survey_schema_review_modal`

Triggered by: `survey_review_schema` action (button in DM after CSV upload)

| UI Label | Type | Req | Dynamic | Authority |
|----------|------|-----|---------|-----------|
| Field role (per field) | static_select | Yes | One per CSV column | CANONICAL (survey_field_schemas) |
| Ordinal order (per ordinal field) | plain_text_input | Cond. | Only for ordinal fields | CANONICAL |
| Demographic flag (per field) | checkbox | No | Per field | CANONICAL |

**Pagination:** 20 fields per page, max 100 fields (5 pages). Fail-closed if field count exceeds limit.

### Privacy Review

Source: `backend/src/helpers/slack/commands/surveyPrivacyHandler.ts`

callback_id: `survey_privacy_review_modal`

Triggered by: `survey_privacy_review` action

Reviews PII-flagged fields before synthesis proceeds.

### Codebook / Grouping Review

Source: `backend/src/helpers/slack/commands/codebookHandler.ts`

Triggered by: `survey_generate_codebook` action, `survey_open_grouping_review` action

Researcher reviews AI-generated groupings (codes) for open-text fields. Accept or regenerate.

### Match Review

Source: `backend/src/helpers/slack/commands/matchReviewHandler.ts`

callback_id: `match_review_modal`

Triggered by: `survey_open_match_review` action, `survey_generate_assignments` action

Researcher reviews AI-generated response-to-code assignments.

### Synthesis Action

Source: `backend/src/helpers/slack/commands/surveySynthesisAction.ts`

Triggered by: `survey_run_synthesis` action

Runs final survey synthesis after all review steps complete.

---

## Repeated Fields Across Modals

| Field | Appears In | Collect Once? |
|-------|-----------|---------------|
| Study selection | analyze, synthesis, report, tickets, fieldwork | Yes -- from study context page |
| Research method | brief, discussion guide | Yes -- collect in brief, cascade to guide (plan consumes from cascade, not modal) |
| Problem statement | project creation, brief | Yes -- collect in project, pre-fill brief |
| Start date | brief | Yes -- plan consumes from cascade |
| Research questions | brief, discussion guide, analysis context | Yes -- collect in brief, cascade everywhere |

## Fields Only Required Because of Slack

| Field | Modal | Why Slack-Specific | Workspace Alternative |
|-------|-------|-------------------|----------------------|
| Create channel toggle | /qori-start | Slack channel creation | Drop entirely |
| Lead researcher (users_select) | /qori-plan | Slack user picker | Session auth user |
| Lead moderator (users_select) | /qori-discuss | Slack user picker | Session auth user |
| Stakeholder (users_select) | /qori-brief | Slack user picker | Session auth / team member selector |
| Study selection dropdowns | Multiple | No persistent context | Study context from URL/nav |

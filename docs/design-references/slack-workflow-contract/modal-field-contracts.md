# Modal Field Contracts

Field tables for every researcher-facing modal in the current Slack surface. Each table shows what the Workspace equivalent must collect, what can be inherited, and what authority the field has.

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

## /qori-start — Project Creation

| UI Label | block_id.action_id | Type | Req | Default | Authority | Workspace Derivable | Used By |
|----------|-------------------|------|-----|---------|-----------|--------------------|---------| 
| Project name | project_name.value | text | Yes | — | CANONICAL (projects.name) | No | slug, GitHub path, all downstream |
| Description | project_description.value | text (multi) | No | — | CANONICAL (projects.description) | No | display only |
| Problem statement | project_problem_statement.value | text (multi) | Yes | — | CANONICAL (projects.problem_statement) | No | brief pre-fill, AI generation |
| Brief approver | project_stakeholder.stakeholder_select | users_select | No | Owner fallback | CANONICAL (project_members.is_stakeholder) | No | brief approval flow |
| Create channel | create_channel.value | checkboxes | No | ON | EPHEMERAL | Yes (drop for web) | Slack channel creation |

---

## /qori-brief — Research Brief

| UI Label | block_id.action_id | Type | Req | Default/Inherited | Authority | Workspace Derivable | Used By |
|----------|-------------------|------|-----|-------------------|-----------|--------------------|---------| 
| Problem statement | problem_statement_block.problem_statement | text (multi) | Yes | project.problem_statement | CASCADE → AI input | Partially (pre-fill from project) | AI brief generation |
| Learning objectives | learning_objectives_block.learning_objectives | text (multi) | Yes | — | CASCADE (research_objectives) | No | plan, synthesis, readout |
| Out of scope | out_of_scope_block.out_of_scope | text (multi) | Yes | — | CASCADE (out_of_scope) | No | brief boundary |
| Methodology | methodology_block.methodology | radio_buttons | Yes | — | CASCADE (methodology_selection) | No | plan, discussion guide, synthesis |
| Participant approach | participant_approach_block.participant_approach | text (multi) | Yes | — | CASCADE (participant_approach) | No | plan |
| Timeline | timeline_block.timeline | radio_buttons | Yes | — | CASCADE (timeline_preference) | No | plan |
| Start date | start_date_block.start_date | date_picker | Yes | Next Monday | CASCADE (start_date) | Yes (default: next Monday) | plan, timeline |
| Decision deadline | decision_deadline_block.decision_deadline | date_picker | Yes | — | CASCADE (decision_deadline) | Partially (start + timeline) | brief |
| Budget | budget_block.budget | text | No | — | CASCADE (budget) | No | brief |
| Discovery artifacts | (dynamic checkboxes) | checkboxes | No | All auto-selected | EPHEMERAL (selection) | No | AI brief generation (manual injection) |

---

## /qori-plan — Research Plan

| UI Label | block_id.action_id | Type | Req | Default/Inherited | Authority | Workspace Derivable | Used By |
|----------|-------------------|------|-----|-------------------|-----------|--------------------|---------| 
| Lead researcher | lead_researcher_block.lead_researcher | users_select | Yes | Slack profile | ARTIFACT | Yes (session auth user) | plan document |
| Research method | research_method_block.research_method | static_select | Yes | brief.methodology_selection | CASCADE | Yes (from brief) | plan, AI tasks |
| Number of participants | num_participants_block.num_participants | text | Yes | — | ARTIFACT | No | plan document |
| Session duration | session_duration_block.session_duration | text | Yes | — | ARTIFACT | No | plan document |
| Start date | start_date_block.start_date | date_picker | Yes | Next Monday | ARTIFACT | Yes (from brief) | plan timeline |
| Operational risks | operational_risks_block.operational_risks | text (multi) | No | — | CASCADE (risks) | No | plan risk section |

---

## /qori-discover — Discovery Type Modals

### Desk Research / Stakeholder Synthesis

| UI Label | block_id.action_id | Type | Req | Authority | Used By |
|----------|-------------------|------|-----|-----------|---------|
| Topic | topic_block.topic | text | Yes | CASCADE (topic_slug derived) | artifact filename, variable key |
| Description | description_block.description | text (multi) | Yes | AI input | AI generation |
| Source files | files_block.files | file_input | Yes | EPHEMERAL → AI input | AI generation |
| Question focus | question_focus_block.question_focus | text (multi) | No | AI input | AI generation focus |

### Survey Synthesis

| UI Label | block_id.action_id | Type | Req | Authority | Used By |
|----------|-------------------|------|-----|-----------|---------|
| Survey name | survey_name_block.survey_name | text | Yes | CASCADE | artifact filename |
| Description | description_block.description | text (multi) | Yes | AI input | AI generation |
| Source files | files_block.files | file_input | Yes | EPHEMERAL → AI input | AI generation |
| Question focus | question_focus_block.question_focus | text (multi) | No | AI input | AI generation focus |

---

## /qori-discuss — Discussion Guide

| UI Label | block_id.action_id | Type | Req | Default/Inherited | Authority | Workspace Derivable |
|----------|-------------------|------|-----|-------------------|-----------|---------------------|
| Research focus | research_focus_block.research_focus | text (multi) | Yes | brief.research_objectives | AI input | Yes (cascade) |
| Research questions | research_questions_block.research_questions | text (multi) | Yes | brief.research_questions | AI input | Yes (cascade) |
| Research method | research_method_block.research_method | static_select | Yes | brief.methodology_selection | AI input | Yes (cascade) |
| Session type | session_type_block.session_type | static_select | Yes | — | AI input | No |
| Session duration | session_duration_block.session_duration | text | Yes | — | AI input | No |
| Participant description | participant_desc_block.participant_desc | text (multi) | No | — | AI input | No |

**Cascade gate:** Shows readiness blocks if required upstream variables missing.

---

## /qori-analyze — Session Analysis

| UI Label | block_id.action_id | Type | Req | Dynamic | Authority |
|----------|-------------------|------|-----|---------|-----------|
| Study | study_select_block.study_select_test | static_select | Yes | From user's studies | EPHEMERAL (selection) |
| Session | session_select_block.analyze_notes_session_select | static_select | Yes | From study participants (after study) | EPHEMERAL (selection) |
| Session notes | notes_checkboxes_block.notes_checkboxes | checkboxes | Yes | From approved notes for session | EPHEMERAL (selection) |
| Context display | (read-only) | display | — | Barrier/question counts from cascade | — |

**Progressive disclosure:** Study → Session → Notes (each step populates the next via views.update).

---

## /qori-synthesis — Research Synthesis

| UI Label | block_id.action_id | Type | Req | Dynamic | Authority |
|----------|-------------------|------|-----|---------|-----------|
| Study | study_select_block.study_select_synthesize | static_select | Yes | From user's studies | EPHEMERAL |
| Analysis method | analysis_method_block.analysis_method | static_select | Yes | — | AI input (determines YAML template) |
| Session stats | (read-only) | display | — | Participant/nugget breakdown | — |
| Enrichments | enrichment_checkboxes | checkboxes | No | Auto-detected from existing variables | EPHEMERAL |

**Options for analysis_method:** affinity_mapping, journey_mapping, persona_generation, jobs_to_be_done, usability_issues, design_opportunities

Source of truth: `backend/src/helpers/slack/ui/researchSynthesisModal.ts:222-247` and `backend/src/application/synthesis.app-service.ts:64-71`.

**Enrichment checkboxes (dynamic):** themes, barriers, research_questions, personas, metadata, constraints, jobs — shown only when corresponding cascade variables exist.

---

## /qori-report — Research Readout

| UI Label | block_id.action_id | Type | Req | Dynamic | Authority |
|----------|-------------------|------|-----|---------|-----------|
| Study | study_select | static_select | Yes | From user's studies | EPHEMERAL |
| Readout type | readout_type | radio_buttons | Yes | — | Determines template |
| Audience | audience_checkboxes | checkboxes | Cond. | Only for targeted readouts | EPHEMERAL |

**Types:** research_readout (full, single template), targeted_readouts (per-audience with per-audience findings).

---

## /qori-tickets — GitHub Issues

### Step 1

| UI Label | Type | Req | Authority |
|----------|------|-----|-----------|
| Study | static_select | Yes | EPHEMERAL |
| Audience | checkboxes | Yes | EPHEMERAL (designer/engineering/accessibility) |

### Step 2

| UI Label | Type | Req | Dynamic | Authority |
|----------|------|-----|---------|-----------|
| Ticket candidates | checkboxes | Yes | Filtered by audience from step 1 | CANONICAL (GitHub Issues created) |

**Idempotency:** Issues marked with `qori-action-id` for recovery.

---

## /qori-fieldwork — Participant Addition

| UI Label | block_id.action_id | Type | Req | Authority |
|----------|-------------------|------|-----|-----------|
| Participant code | (read-only preview) | display | — | DERIVED (next PT-NNN) |
| Participant name | participant_name | text | No | CANONICAL (study_participants) |
| Scheduled date | scheduled_date | date_picker | No | CANONICAL |
| Session time | session_time | time_picker | No | CANONICAL |
| Location/method | location | static_select | No | CANONICAL |
| Notes | notes | text (multi) | No | CANONICAL |

---

## Repeated Fields Across Modals

| Field | Appears In | Collect Once? |
|-------|-----------|---------------|
| Study selection | analyze, synthesis, report, tickets, fieldwork | Yes — from study context page |
| Research method | brief, plan, discussion guide | Yes — collect in brief, cascade to plan + guide |
| Problem statement | project creation, brief | Yes — collect in project, pre-fill brief |
| Start date | brief, plan | Yes — collect in brief, inherit in plan |
| Research questions | brief, discussion guide, analysis context | Yes — collect in brief, cascade everywhere |

## Fields Only Required Because of Slack

| Field | Modal | Why Slack-Specific | Workspace Alternative |
|-------|-------|-------------------|----------------------|
| Create channel toggle | /qori-start | Slack channel creation | Drop entirely |
| Lead researcher (users_select) | /qori-plan | Slack user picker | Session auth user |
| Study selection dropdowns | Multiple | No persistent context | Study context from URL/nav |

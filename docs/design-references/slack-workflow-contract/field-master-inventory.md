# Field Master Inventory

Every researcher-facing field across the Qori researcher journey, verified against runtime modal builders, handlers, and application services. Fields are classified by authority and reuse potential.

**Source of truth:** Modal builders in `backend/src/helpers/slack/ui/`, handlers in `backend/src/helpers/slack/commands/`, app services in `backend/src/application/`.

## Classification Legend

| Flag | Meaning |
|------|---------|
| MUST ASK | Researcher must provide this — cannot be derived or inherited |
| CAN PREFILL | Value can be pre-populated from upstream context but researcher may edit |
| CAN DERIVE | Value can be computed automatically — no researcher input needed |
| DUPLICATE ASK | Same information collected in multiple modals |
| HISTORICAL SLACK | Required only because of Slack UI constraints — Workspace can eliminate |

## Authority Legend

| Code | Meaning |
|------|---------|
| CANONICAL | Authoritative DB record |
| CASCADE | study_variables projection |
| DERIVED | Computed from canonical state |
| AI PROPOSAL | Generated but not authoritative until accepted |
| ARTIFACT | Written into document output, not canonical |
| EPHEMERAL | Slack/modal state only, not persisted |

---

## 1. Project Creation (`/qori-start`)

Source: `projectCreationModal.ts`, `projectStartHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Project name | `project_name.value` | text | Yes | — | CANONICAL (projects.name) | MUST ASK | slug, GitHub path, all downstream |
| Description | `project_description.value` | text (multi) | No | — | CANONICAL (projects.description) | MUST ASK | display only |
| What problem are you trying to solve? | `project_problem_statement.value` | text (multi) | Yes | — | CANONICAL (projects.problem_statement) | MUST ASK | brief pre-fill, AI generation |
| Brief approver | `project_stakeholder.stakeholder_select` | users_select | No | Owner fallback | CANONICAL (project_members.is_stakeholder) | MUST ASK | brief approval flow |
| Create dedicated channel | `create_channel.value` | checkboxes | No | ON | EPHEMERAL | HISTORICAL SLACK | Slack channel only |

---

## 2. Research Brief (`/qori-brief`)

Source: `researchBriefEntryModal.ts`, `briefHandler.ts`, `brief.app-service.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Lead researcher | `lead_researcher_block.lead_researcher_input` | text | Yes | Slack profile name | ARTIFACT | CAN DERIVE (session auth) | brief document |
| Problem statement | `problem_statement_block.problem_statement_input` | text (multi) | Yes | project.problem_statement | CASCADE | CAN PREFILL | AI brief generation |
| Learning objectives | `learning_objectives_block.learning_objectives_input` | text (multi) | Yes | cascade.research_objectives | CASCADE (research_objectives) | CAN PREFILL | plan, synthesis, readout |
| Out of scope | `out_of_scope_block.out_of_scope_input` | text (multi) | No | barrier coverage derivation | CASCADE (out_of_scope) | CAN PREFILL | brief boundary |
| Research method | `research_method_block.research_method_select` | static_select | Yes | cascade.methodology_recommendations | CASCADE (methodology_selection) | CAN PREFILL | plan, discussion guide, synthesis |
| Method override | `method_override_block.method_override_input` | text | No | — | CASCADE | MUST ASK (if Other) | methodology_selection |
| Participant approach | `participant_approach_block.participant_approach_input` | text (multi) | No | cascade.participant_hints | CASCADE (participant_approach) | CAN PREFILL | plan |
| Recruitment sources | `recruitment_sources_block.recruitment_sources_input` | text (multi) | No | cascade.recruitment_sources | CASCADE | CAN PREFILL | plan |
| Start date | `start_date_block.start_date_picker` | datepicker | Yes | Next Monday | CASCADE (start_date) | CAN DERIVE | plan, timeline |
| Decision deadline | `decision_deadline_block.decision_deadline_picker` | datepicker | Yes | — | CASCADE (decision_deadline) | MUST ASK | timeline inference |
| Budget | `budget_block.budget_input` | text | No | — | CASCADE (budget) | MUST ASK | plan |
| Stakeholder select | `stakeholder_block.stakeholder_select` | users_select | No | — | ARTIFACT | MUST ASK | requestor name in brief |
| Discovery artifacts | `discovery_selection_block.discovery_selection` | checkboxes | No | All selected | EPHEMERAL | CAN PREFILL | AI brief generation |

**Options for research_method_select:** usability_testing, user_interviews, contextual_inquiry, concept_testing, survey, card_sorting, tree_testing, mixed_methods

---

## 3. Research Plan (`/qori-plan`)

Source: `planHandler.ts`, `plan.app-service.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Lead researcher | `lead_researcher_block.lead_researcher_select` | users_select | Yes | Current user | ARTIFACT | CAN DERIVE (session auth) | plan document |
| Operational risks | `operational_risks_block.operational_risks_input` | text (multi) | No | — | CASCADE (risks) | MUST ASK | plan risk section |

**Note:** Plan has only 2 researcher-entered fields. All other plan content (methodology, timeline, participants, deliverables) is consumed from cascade variables set by the brief. The plan app service loads: research_objectives, research_questions, target_barriers, methodology_selection, timeline_preference, start_date, recruitment_sources, participant_approach.

---

## 4. Discussion Guide (`/qori-discuss`)

Source: `discussionGuideModal.ts`, `discussionGuideHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Research focus | `research_focus_block.research_focus_input` | text (multi) | Yes | cascade.research_objectives | AI input | CAN PREFILL | AI generation |
| Research questions | `research_questions_block.research_questions_input` | text (multi) | Yes | cascade.research_questions | AI input | CAN PREFILL | AI generation |
| Research method | `research_method_block.research_method_select` | static_select | Yes | cascade.methodology_selection | AI input | CAN PREFILL | AI generation |
| Session length | `session_length_block.session_length_select` | static_select | Yes | 60 min | AI input | MUST ASK | AI generation |
| Number of tasks | `task_count_block.task_count_select` | static_select | Yes | 5 | AI input | MUST ASK | AI generation |
| Lead moderator | `lead_moderator_block.lead_moderator_select` | users_select | Yes | Current user | ARTIFACT | CAN DERIVE (session auth) | guide document |

**Cascade gate:** Requires research_objectives + research_questions to exist (suggests `/qori-brief` first if missing).

---

## 5. Discovery (`/qori-discover`)

Source: `discoverTypeModals.ts`, `discoverHandler.ts`

### Desk Research / Stakeholder Synthesis

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Topic | `topic_block.topic` | text | Yes | — | CASCADE (topic_slug derived) | MUST ASK | artifact filename, variable key |
| Description | `description_block.description` | text (multi) | No | — | AI input | MUST ASK | AI generation |
| Source files | `file_upload_block.file_upload` | file_input | Yes | — | EPHEMERAL | MUST ASK | AI generation |

### Survey Synthesis

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Topic | `topic_block.topic` | text | Yes | — | CASCADE | MUST ASK | artifact filename |
| Description | `description_block.description` | text (multi) | No | — | AI input | MUST ASK | AI generation |
| Survey name | `survey_name_block.survey_name` | text | No | — | CASCADE | MUST ASK | artifact title |
| Question focus | `question_focus_block.question_focus` | text (multi) | No | — | AI input | MUST ASK | analysis focus |
| Source files | `file_upload_block.file_upload` | file_input (csv) | Yes | — | EPHEMERAL | MUST ASK | survey pipeline |

---

## 6. Fieldwork — Add Participant (`/qori-fieldwork`)

Source: `participantHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Study | `study_select_block.study_select` | static_select | Yes | Active study | EPHEMERAL | HISTORICAL SLACK (URL context) | scoping |
| Participant code | (read-only preview) | display | — | Next PT-NNN | DERIVED | CAN DERIVE | session identity |
| Participant name | `participant_name_input.participant_name` | text | No | — | CANONICAL (study_participants) | MUST ASK | alias display |
| Recruitment source | `recruitment_source_input.recruitment_source` | text | No | — | CANONICAL | MUST ASK | tracking |
| Scheduled date | `scheduled_date_input.scheduled_date` | datepicker | No | Today | CANONICAL | MUST ASK | scheduling |
| Scheduled time | `scheduled_time_input.scheduled_time` | timepicker | No | — | CANONICAL | MUST ASK | scheduling |
| Compensation | `compensation_input.compensation_amount` | text | No | — | CANONICAL (DECIMAL) | MUST ASK | tracking |
| Status | `status_select_block.status_select` | static_select | No | CONTACTED | CANONICAL | MUST ASK | tracking |

---

## 7. Fieldwork — Add Observer (`/qori-fieldwork`)

Source: `addObserverHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Study | `study_select_block.study_select` | static_select | Yes | Active study | EPHEMERAL | HISTORICAL SLACK | scoping |
| Observer(s) | `observer_people_block.observer_people` | multi_users_select | Yes | — | CANONICAL | MUST ASK | observer assignment |
| Sessions | `observer_sessions_block.observer_sessions` | multi_static_select | Yes | — | CANONICAL | MUST ASK | session assignment |
| Observer role | `observer_role_block.observer_role_select` | static_select | Yes | note_taker | CANONICAL | MUST ASK | capacity check |
| Post channel CTA | `observer_channel_cta_block.post_channel_cta` | checkboxes | No | — | EPHEMERAL | HISTORICAL SLACK | Slack self-join |

---

## 8. Session Notes (`/qori-fieldwork` → upload)

Source: `sessionNotesHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Sessions | `session_picker_block.session_select` | multi_static_select | Yes | — | EPHEMERAL | MUST ASK | session linkage |
| Tab selection | `tab_block.tab_select` | radio_buttons | Yes | manual | EPHEMERAL | HISTORICAL SLACK | modal layout |
| Observation notes (manual) | `observations_text.observations_input` | text (multi) | Yes (if manual) | — | CANONICAL (pending_content) | MUST ASK | quarantine → analysis |
| Participant real name (upload) | `pii_real_name.pii_real_name_input` | text | No | — | EPHEMERAL (never stored) | MUST ASK | PII scrubbing only |
| Transcript method | `transcript_method_block.transcript_method_select` | radio_buttons | Yes (if upload) | — | EPHEMERAL | HISTORICAL SLACK | paste vs file |
| Pasted transcript | `transcript_paste.transcript_paste_input` | text (multi) | Yes (if paste) | — | CANONICAL (quarantine) | MUST ASK | quarantine → analysis |
| Transcript file | `transcript_file.transcript_file_input` | file_input | Yes (if file) | — | EPHEMERAL | MUST ASK | quarantine → analysis |
| Transcript source | `transcript_source_dropdown.transcript_source_select` | static_select | Yes (if upload) | — | CANONICAL | MUST ASK | metadata |

---

## 9. Analyze Notes (`/qori-analyze`)

Source: `analyzeNotesHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Study | `study_select_block.study_select` | static_select | Yes | Active study | EPHEMERAL | HISTORICAL SLACK (URL context) | scoping |
| Session | `session_select_block.session_select_${studyId}` | static_select | Yes | — | EPHEMERAL | MUST ASK | session selection |
| Notes | `notes_select_block.notes_select` | static_select | Yes | — | EPHEMERAL | MUST ASK | notes selection |

**Note:** Progressive disclosure — session list loads after study selection, notes load after session selection.

---

## 10. Research Synthesis (`/qori-synthesis`)

Source: `researchSynthesisModal.ts`, `researchSynthesisHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Study | `study_select_block.study_select_synthesize` | static_select | Yes | Active study | EPHEMERAL | HISTORICAL SLACK (URL context) | scoping |
| Synthesis method | `analysis_method_selection.analysis_method` | radio_buttons | Yes | affinity_mapping | AI input | MUST ASK | template selection |
| Session stats | (read-only) | display | — | Auto-computed | DERIVED | CAN DERIVE | context display |
| Enrichments | enrichment checkboxes | checkboxes | No | Auto-detected | EPHEMERAL | CAN DERIVE (auto-detect) | AI generation |

**Methods:** affinity_mapping, journey_mapping, persona_generation, jobs_to_be_done, usability_issues, design_opportunities

---

## 11. Research Readout (`/qori-report`)

Source: `readoutHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Study | `study_selection.study_selection_change` | static_select | Yes | Active study | EPHEMERAL | HISTORICAL SLACK (URL context) | scoping |
| Readout type | `readout_type` (action_id varies) | radio_buttons | Yes | research_readout | AI input | MUST ASK | template selection |
| Audience | `audience_selection.audience_checkboxes` | checkboxes | Cond. | — | EPHEMERAL | MUST ASK (if targeted) | per-audience generation |
| Team members | `team_members.team_members_input` | multi_static_select | No | — | ARTIFACT | MUST ASK | readout document |

**Audiences (targeted):** Design Team, Engineering Team, Accessibility Team, Executive Leadership, Product Leadership

---

## 12. Tickets (`/qori-tickets`)

Source: `ticketHandler.ts`

### Step 1

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Study | study_select_action | static_select | Yes | Active study | EPHEMERAL | HISTORICAL SLACK | scoping |
| Audience | audience_select_action | static_select | Yes | — | EPHEMERAL | MUST ASK | ticket filtering |

### Step 2

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Ticket candidates | ticket_checkboxes | checkboxes | Yes | All selected | CANONICAL (GitHub Issues) | MUST ASK | issue creation |

---

## 13. Survey Schema Review

Source: `surveySubmissionHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Field role (per field) | `confirmed_role_${idx}.role_select` | static_select | Yes | Inferred role | CANONICAL (survey_field_schemas) | CAN PREFILL | statistics, analysis |
| Ordinal order (per ordinal field) | `order_metadata_${idx}.order_input` | text | No | — | CANONICAL | MUST ASK (if ordinal) | ordinal statistics |
| Demographic flag (per field) | `is_demographic_${idx}.demographic_checkbox` | checkboxes | No | — | CANONICAL | MUST ASK | sample demographics |

**Roles:** demographic, open_text, yes_no_binary, ordinal_scale, quantitative, other

---

## 14. Survey Privacy Review

Source: `surveyPrivacyHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Bulk approve unflagged | `bulk_clear_unflagged.bulk_clear_check` | checkboxes | No | — | CANONICAL | CAN PREFILL | batch approval |
| Per-entry disposition | `disposition_${eid}.disposition_select` | static_select | Yes (if flagged) | — | CANONICAL | MUST ASK (if flagged) | entry status |
| Edited safe text | `redact_text_${eid}.redact_input` | text (multi) | No | Suggested text | CANONICAL | CAN PREFILL | redacted content |

---

## 15. Codebook Review

Source: `codebookHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Code decision (per code) | `code_decision_${cid}.code_action` | static_select | Yes | Keep | CANONICAL | MUST ASK | codebook state |
| Edit label | `code_edit_label_${cid}.edit_label_input` | text | No | code.label | CANONICAL | CAN PREFILL | code name |
| Edit definition | `code_edit_def_${cid}.edit_def_input` | text (multi) | No | code.definition | CANONICAL | CAN PREFILL | code definition |
| Edit include criteria | `code_edit_include_${cid}.edit_include_input` | text (multi) | No | code.include_when | CANONICAL | CAN PREFILL | coding rules |
| Edit exclude criteria | `code_edit_exclude_${cid}.edit_exclude_input` | text (multi) | No | code.exclude_when | CANONICAL | CAN PREFILL | coding rules |
| Add new grouping label | `add_grouping_label.add_label_input` | text | No | — | CANONICAL | MUST ASK | new code |
| Add new grouping def | `add_grouping_def.add_def_input` | text (multi) | No | — | CANONICAL | MUST ASK | new code |

---

## 16. Match Review

Source: `matchReviewHandler.ts`

| UI Label | Internal Key | Type | Req | Default | Authority | Flag | Downstream |
|----------|-------------|------|-----|---------|-----------|------|------------|
| Bulk approve matches | `bulk_approve_matches.bulk_approve_check` | checkboxes | No | — | CANONICAL | CAN PREFILL | batch review |
| Per-entry codes | `match_codes_${rid}.match_codes_select` | checkboxes | No | Proposed (pre-checked) | CANONICAL | CAN PREFILL | code assignment |
| Per-entry status | `entry_status_${rid}.entry_status_select` | static_select | Cond. | Accept matches | CANONICAL | MUST ASK (if no proposals) | entry disposition |

---

## Duplicate Asks

Fields collected in multiple modals where Workspace should collect once:

| Field | Collected In | Opportunity |
|-------|-------------|-------------|
| Study selection | analyze, synthesis, readout, tickets, fieldwork, notes | Auto-resolve from study page context (URL) |
| Research method / methodology | brief (research_method_select), plan (inherited), discussion guide (research_method_select) | Collect once in brief, cascade everywhere |
| Problem statement | project creation (problem_statement), brief (problem_statement_block) | Collect once in project, pre-fill brief |
| Lead researcher / moderator | brief (lead_researcher_input), plan (lead_researcher_select), discussion guide (lead_moderator_select) | Derive from session auth; ask once if different person |
| Start date | brief (start_date_picker), plan (inherited) | Collect once in brief, inherit |
| Research questions | brief (learning_objectives_input), discussion guide (research_questions_input) | Cascade from brief automatically |
| Research focus / objectives | brief (learning_objectives_input), discussion guide (research_focus_input) | Cascade from brief automatically |

---

## Fields Workspace Can Derive

| Field | Currently Asked In | Derivation Source |
|-------|-------------------|-------------------|
| Study selection | 6 modals | URL routing / study context page |
| Lead researcher | brief, plan, discussion guide | Session-authenticated user |
| Start date | brief | Default: next Monday |
| Participant code | participant modal (preview) | Auto-computed (already derived) |
| Session stats | synthesis modal (display) | Auto-computed from study_variables |
| Enrichment availability | synthesis modal (checkboxes) | Auto-detected from existing variables |
| Create channel toggle | project creation | Not applicable in Workspace |
| Tab selection (manual/upload) | session notes | Single upload surface (no tabs) |
| Transcript method (paste/file) | session notes (upload tab) | Single upload surface |

---

## Fields That Are Historical Slack Requirements

| Field | Modal | Why Slack-Specific | Workspace Alternative |
|-------|-------|-------------------|----------------------|
| Create channel toggle | `/qori-start` | Slack channel creation | Drop entirely |
| Tab selection (manual/upload) | session notes | Slack multi-step modal limitation | Unified upload surface |
| Transcript method (paste/file) | session notes | Slack can't do both | Drag-and-drop + paste area |
| Post channel CTA | add observer | Slack self-join button | Not needed in Workspace |
| Study selection dropdowns | 6+ modals | No persistent context in Slack | URL/nav routing |

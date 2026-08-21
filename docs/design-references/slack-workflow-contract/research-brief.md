# Research Brief Contract

**Status:** CURRENT (implemented)
**Entry Point:** `/qori-brief`
**Handler:** `backend/src/helpers/slack/commands/briefHandler.ts`
**Modal Builder:** `backend/src/helpers/slack/ui/researchBriefEntryModal.ts`
**Static Modal:** `backend/src/helpers/slack/ui/researchBriefModal.ts`
**Application Service:** `backend/src/application/brief.app-service.ts` -> `executeBrief`
**YAML Template:** `config/prompts/research_brief.yaml` (v6.0, cascade-aware)
**Callback ID:** `research_brief_modal`

## Purpose

The research brief is the **approval gate** for a study. It defines what will be researched, why, and how. Brief approved -> plan elaborates. This is the FIRST document in a study lifecycle.

## Preconditions

**CURRENT — verified against handler code:**

- Project must exist (`projectId` from modal `private_metadata`, typed as `BriefEntryModalMetadata`)
- Actor must be project member (GOV-1 authorization via `assertProjectAccess` at submission boundary)
- `/qori-brief` must be run from a project-linked channel (channel -> project resolution)

## Researcher Input (Modal Fields)

**CURRENT — verified against `researchBriefModal.ts` (static definition) + `researchBriefEntryModal.ts` (dynamic modifications).**

The static modal in `researchBriefModal.ts` defines the base blocks. `buildBriefEntryModal` in `researchBriefEntryModal.ts` clones these blocks and modifies them dynamically (removing, replacing, and inserting blocks).

### Fields present in static modal (`researchBriefModal.ts`):

| # | UI Label | block_id.action_id | Type | Required | Placeholder | Notes |
|---|----------|-------------------|------|----------|-------------|-------|
| 1 | What's the study called? | `study_name_block.study_name_input` | plain_text_input | Yes | "e.g., va-mobile-nav-2026" | **REMOVED at runtime** by `buildBriefEntryModal` (Phase 2D: study inherits project slug) |
| 2 | Who's requesting this research? | `stakeholder_block.stakeholder_select` | users_select | Yes | "Select stakeholder..." | **REPLACED at runtime** with read-only context block showing approver name and role |
| 3 | What problem are you solving? | `problem_statement_block.problem_statement_input` | plain_text_input (multiline) | Yes | "e.g., 45% task abandonment rate..." | No max_length set in modal |
| 4 | What will this research answer? | `learning_objectives_block.learning_objectives_input` | plain_text_input (multiline) | Yes | "Where veterans expect to find X..." | Pre-filled from cascade `stakeholder_questions_for_users` |
| 5 | What's out of scope? | `out_of_scope_block.out_of_scope_input` | plain_text_input (multiline) | No (`optional: true`) | "e.g., Visual design, onboarding flow..." | Pre-filled from barrier coverage derivation |
| 6 | What method fits best? | `research_method_block.research_method_select` | static_select | Yes | "Select method..." | See methodology options below |
| 7 | Custom method | `method_override_block.method_override_input` | plain_text_input | No (`optional: true`) | "e.g., Card sorting + tree testing" | For combined/custom approaches not in dropdown |
| 8 | Who are you researching with? | `participant_approach_block.participant_approach_input` | plain_text_input (multiline) | Yes | "e.g., 8 Veterans, 50% using assistive technology..." | Pre-filled from barrier coverage participant hints |
| 9 | Recruitment sources | `recruitment_sources_block.recruitment_sources_input` | plain_text_input | No (`optional: true`) | "e.g., Perigean Recruiting, VA Section 508 Office..." | |
| 10 | When does research start? | `start_date_block.start_date_picker` | datepicker | No (`optional: true`) | "Select start date" | Default: next Monday (set dynamically) |
| 11 | When do stakeholders need findings? | `decision_deadline_block.decision_deadline_picker` | datepicker | No (`optional: true`) | "Select deadline" | |
| 12 | Budget | `budget_block.budget_input` | plain_text_input | No (`optional: true`) | "e.g., $800 participant incentives" | |

### Dynamically-injected blocks (by `buildBriefEntryModal`):

| # | UI Label | block_id.action_id | Type | Required | Notes |
|---|----------|-------------------|------|----------|-------|
| 13 | Project context | `project_context_block` | context (read-only) | — | Displays `*{projectName}*`, inserted after intro |
| 14 | Approver display | `stakeholder_display_block` | context (read-only) | — | Shows "Approver: {name} ({role})" — replaces the editable `stakeholder_block` |
| 15 | Discovery sources | `discovery_selection_block.discovery_selection` | checkboxes | No (`optional: true`) | Dynamic from `loadDiscoveryArtifacts(projectId)`. Format: `{type}::{slug}`. All auto-selected via `initial_options`. Only shown if artifacts exist. |

### NOT in the brief modal (contrary to user spec):

- **`lead_researcher_block.lead_researcher_input`** — The static modal (`researchBriefModal.ts`) does NOT contain a `lead_researcher_block`. The entry modal builder (`researchBriefEntryModal.ts` line 252) searches for it but finds nothing if it doesn't exist in the base blocks. The handler (`briefHandler.ts` line 121-123) extracts from both `lead_researcher_block` and `lead_researcher` with a fallback to `body.user.name`. **Net effect: lead researcher defaults to Slack user's name; there is no visible lead_researcher field in the brief modal.**
- **`stakeholder_block.stakeholder_select`** — Present in the static modal but **replaced** at runtime with a read-only context block. Stakeholder was already set during `/qori-start`. The users_select value from the static modal is never submitted.

### Methodology Options

**CURRENT — from `researchBriefModal.ts` `research_method_block` options array:**

| Display Text | Value |
|-------------|-------|
| Usability Testing | `usability_testing` |
| User Interviews | `user_interviews` |
| Contextual Inquiry | `contextual_inquiry` |
| Concept Testing | `concept_testing` |
| Survey Research | `survey` |
| Card Sorting | `card_sorting` |
| Tree Testing | `tree_testing` |
| Mixed Methods | `mixed_methods` |

There is no "Other" option in the dropdown. The `method_override_block` is always visible (optional) for custom/combined approaches. When `method_override_input` has a value, the handler uses `methodValue = 'custom'` and `methodLabel = overrideText`.

## What Qori Already Knows (Inherited)

**CURRENT — from `BriefEntryModalMetadata` in `private_metadata`:**

| Field | Source | How Used |
|-------|--------|----------|
| `projectId` | Modal metadata (`BriefEntryModalMetadata`) | FK for study creation, discovery artifact loading |
| `projectSlug` | Modal metadata | Study name = project slug (Phase 2D) |
| `projectName` | Modal metadata | Display in project context block |
| `channelId` | Modal metadata | Post-submission messaging |
| `source` | Modal metadata | `'qori_brief_command'` or `'project_next_steps'` |
| Lead researcher | `buildBriefEntryModal` `options.leadResearcher` | Pre-fill attempt (but block may not exist — see note above) |
| Start date | Computed in `buildBriefEntryModal` | Next Monday default (`initial_date`) |
| Discovery artifacts | `loadDiscoveryArtifacts(projectId)` | Populate discovery checkboxes |
| Approver info | `getProjectApprover(projectId)` | Display read-only approver context |

## Cascade Pre-fill Sources

**CURRENT — verified against `synthesizeCascadeFields()` and `buildBriefEntryModal()` in `researchBriefEntryModal.ts`:**

The pre-fill logic aggregates all discovery variables via `aggregateDiscoveryVariables(artifacts)` then derives fields:

| Cascade Source | Pre-fills | Mechanism |
|----------------|-----------|-----------|
| `upstream_methodology_recommendations` | `research_method_block` initial_option | Inline `radioOptions` mapping (longest-match, combined-method detection -> `mixed_methods`). NOT `METHODOLOGY_LABEL_TO_VALUE` (that's discussion guide). |
| `upstream_stakeholder_questions_for_users` | `learning_objectives_block` initial_value | Extracts `research_question:` or `question:` lines, takes first 3, numbered list |
| Barrier coverage derivation | `out_of_scope_block` initial_value | `deriveBarrierCoverage(barriers, methodKey)` -> `formatOutOfScopeSuggestions(outOfScope, methodLabel)` |
| Barrier coverage derivation | `participant_approach_block` initial_value | `formatParticipantHints(participantHints)` — vague category-level hints only, NO fabricated numbers/orgs/specifics |
| `upstream_methodology_recommendations` (no radio match) | `method_override_block` initial_value | Only if method text doesn't match any known radio option |

**NOT pre-filled** (contrary to user spec):
- `formatObjectivesForPrefill()` — this function exists in `discussionGuideHandler.ts`, NOT in the brief flow
- `METHODOLOGY_LABEL_TO_VALUE` — this constant exists in `discussionGuideModal.ts`, NOT in the brief flow

## What Qori Generates

**CURRENT — verified against `handleBriefSubmission` and `executeBrief`:**

| Output | Type | Authority | Details |
|--------|------|-----------|---------|
| ResearchStudy record | CANONICAL | `research_studies` table | `study_name = projectSlug` (Phase 2D), `project_id` FK |
| Brief artifact (Markdown) | ARTIFACT | GitHub `{slug}/{slug}/research-brief.md` | AI-generated from template |
| Cascade variables | CASCADE PROJECTION | `study_variables` table | Extracted from AI-generated brief body |
| `brief_status` = `pending_approval` | CANONICAL | `research_studies` table | Set after `executeBrief` completes |
| `brief_reviewer_id` | CANONICAL | `research_studies` table | From `getProjectApprover(projectId).userId` |
| Confirmation DM | EPHEMERAL | Slack DM to researcher | "Research Brief Created" with GitHub link, approver info, and next step |

## AI Generation (from YAML template)

**CURRENT — from `research_brief.yaml` v6.0:**

Single `brief_body` AI task generates all 7 prose sections in one pass for citation consistency:
- Descriptive title
- Display date
- Summary
- Problem synthesis (from discovery sources)
- Formatted learning objectives
- Timeline
- Risks

Discovery variables injected manually by handler based on researcher's checkbox selection.

## Approval Flow

**CURRENT — verified against `requestChangesHandler.ts`, `resubmitBriefHandler.ts`, `studyResultBlocks.ts`:**

### `brief_status` values (verified from handler code):

- `pending_approval` — set by `handleBriefSubmission` and `handleBriefResubmit`
- `approved` — set by `executeDocumentApproval` (via `handleApproveSubmission`)
- `changes_requested` — set by `executeDocumentApproval` (via `handleRequestChangesSubmission`)

### Flow:

1. Brief submitted -> `brief_status = 'pending_approval'`, `brief_reviewer_id` set
2. `generateStudyResultBlocks(studyName, study, url, channelId, 'brief')` produces Approve / Request Changes buttons
3. `sendStudyResultMessage` posts to project channel with approval buttons

### Approve path (`handleApprove` -> `handleApproveSubmission`):
- GOV-1: `assertApproverAccess` — must be project member AND designated approver (`getProjectApprover`)
- Stale button guards: already approved -> "No action needed"; changes_requested -> "Wait for researcher to resubmit"
- Opens confirmation modal -> on submit, calls `executeDocumentApproval(ctx, { action: 'approve' })`
- DM to researcher with header "Research Brief Approved", approved-by mention, GitHub link, and **"Create Research Plan" CTA button** (`action_id: 'create_research_plan_from_brief'`)

### Request Changes path (`handleRequestChanges` -> `handleRequestChangesSubmission`):
- Same GOV-1 + stale button guards as approve
- Opens `requestStudyChangesModal` with fields: change feedback, files to update, priority level, deadline
- On submit, calls `executeDocumentApproval(ctx, { action: 'request_changes', comment })`
- DM to researcher with feedback, priority, files, deadline, GitHub link, and **"Resubmit for Approval" button** (`action_id: 'brief_resubmit'`)
- Includes instruction: "Edit the brief directly in GitHub, then click Resubmit when ready for re-review."

### Resubmit path (`handleBriefResubmit`):
- Stale button guards: already approved -> "No resubmission needed"; pending_approval -> "Already pending"; not changes_requested -> "Not in a state that requires resubmission"
- Flips `brief_status` back to `pending_approval`
- DMs approver with prior feedback context (`study.brief_change_feedback`) + Approve/Request Changes buttons
- Confirms to researcher: "Brief resubmitted for *{studyName}*. *{approverDisplay}* has been notified for re-review."

### Approver resolution (`getProjectApprover`):
- Returns stakeholder (`is_stakeholder=true`) if set, otherwise owner as fallback
- Display resolves Slack user ID to real_name via `client.users.info`

## Known Limitations

**CURRENT:**

- Study name = project slug (Phase 2D) — produces doubled GitHub path `{slug}/{slug}`
- Single study per project architecture (Phase 2D)
- Discovery variable injection is manual (handler code), not YAML `consumes:` block
- `lead_researcher_block` does not exist in the brief modal's static definition — the pre-fill code searches for it but finds nothing; researcher name falls back to Slack user name
- No `max_length` constraints on problem_statement or learning_objectives inputs (unlike project creation modal which has explicit limits)

## Workspace Design Notes

**INTENDED — not implemented, design direction only:**

- Problem statement can be pre-filled from project context
- Discovery artifact selection via checkboxes -> could become a file/artifact picker
- Approval flow -> approval banner on brief detail page + notification
- Fields that could be derived: start_date (next Monday), decision_deadline (start_date + timeline)

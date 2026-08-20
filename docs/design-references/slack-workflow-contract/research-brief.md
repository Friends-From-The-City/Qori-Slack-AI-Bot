# Research Brief Contract

**Status:** IMPLEMENTED
**Entry Point:** `/qori-brief`
**Handler:** `backend/src/helpers/slack/commands/briefHandler.ts`
**Modal Builder:** `backend/src/helpers/slack/ui/researchBriefEntryModal.ts`
**Application Service:** `backend/src/application/brief.app-service.ts` → `executeBrief`
**YAML Template:** `config/prompts/research_brief.yaml` (v6.0, cascade-aware)
**Callback ID:** `research_brief_modal`

## Purpose

The research brief is the **approval gate** for a study. It defines what will be researched, why, and how. Brief approved → plan elaborates. This is the FIRST document in a study lifecycle.

## Preconditions

- Project must exist (project_id from modal metadata)
- Actor must be project member (GOV-1 authorization at submission boundary)

## Researcher Input (Modal Fields)

| UI Label | block_id | action_id | Type | Required | Default/Inherited | Placeholder |
|----------|----------|-----------|------|----------|-------------------|-------------|
| What's the problem? | `problem_statement_block` | `problem_statement` | plain_text_input (multiline) | Yes | Pre-filled from project.problem_statement | "What problem are you investigating?" |
| What do you want to learn? | `learning_objectives_block` | `learning_objectives` | plain_text_input (multiline) | Yes | — | "What questions need to be answered?" |
| What's out of scope? | `out_of_scope_block` | `out_of_scope` | plain_text_input (multiline) | Yes | — | "What will this study NOT cover?" |
| Methodology | `methodology_block` | `methodology` | radio_buttons | Yes | — | Options: Interviews, Usability Testing, Survey, Mixed Methods, Other |
| Participant approach | `participant_approach_block` | `participant_approach` | plain_text_input (multiline) | Yes | — | "Who are you recruiting and how?" |
| Timeline | `timeline_block` | `timeline` | radio_buttons | Yes | — | Options: 2 weeks, 4 weeks, 6 weeks, 8+ weeks |
| Start date | `start_date_block` | `start_date` | date_picker | Yes | Next Monday | — |
| Decision deadline | `decision_deadline_block` | `decision_deadline` | date_picker | Yes | — | — |
| Budget | `budget_block` | `budget` | plain_text_input | No | — | "e.g., $5,000" |
| Discovery artifacts | (dynamic checkboxes) | (dynamic) | checkboxes | No | All auto-selected | Shows available discovery artifacts with sparkle markers |

## What Qori Already Knows (Inherited)

| Field | Source | How Used |
|-------|--------|----------|
| Project ID | Modal metadata | FK for study creation |
| Project slug | Modal metadata | Study name = project slug (Phase 2D) |
| Project name | Modal metadata | Display in modal header |
| Problem statement | project.problem_statement | Pre-fills problem_statement_block |
| Discovery variables | study_variables (discovery scope) | Populates discovery checkboxes |

## What Qori Generates

| Output | Type | Authority | Details |
|--------|------|-----------|---------|
| ResearchStudy record | CANONICAL | research_studies table | study_name = project_slug, status='active', project_id FK |
| Brief artifact (Markdown) | ARTIFACT | GitHub `{slug}/{slug}/research-brief.md` | AI-generated from template |
| `research_questions` | CASCADE PROJECTION | study_variables | Extracted from AI-generated brief body |
| `target_barriers` | CASCADE PROJECTION | study_variables | Extracted from AI-generated brief body |
| `methodology_selection` | CASCADE PROJECTION | study_variables | From modal input |
| `brief_status` = `pending_approval` | CANONICAL | research_studies table | Triggers approval flow |
| `brief_reviewer_id` | CANONICAL | research_studies table | From getProjectApprover() |
| Approval DM | EPHEMERAL | Slack DM to stakeholder/owner | Contains Approve/Request Changes buttons |

## AI Generation (from YAML template)

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

1. Brief submitted → `brief_status = pending_approval`
2. Stakeholder (or owner fallback) receives DM with Approve / Request Changes buttons
3. **Approve** → `brief_status = approved`, researcher notified, Plan creation unlocked
4. **Request Changes** → modal for change description, researcher notified, Resubmit button appears
5. **Resubmit** → re-triggers approval flow

## Known Limitations

- Study name = project slug (Phase 2D) — produces doubled GitHub path `{slug}/{slug}`
- Single study per project architecture
- Discovery variable injection is manual (handler code), not YAML `consumes:` block

## Workspace Design Notes

- Problem statement can be pre-filled from project context
- Discovery artifact selection via checkboxes → could become a file/artifact picker
- Approval flow → approval banner on brief detail page + notification
- Fields that could be derived: start_date (next Monday), decision_deadline (start_date + timeline)

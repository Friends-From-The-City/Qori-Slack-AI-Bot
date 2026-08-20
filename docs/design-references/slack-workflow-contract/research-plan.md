# Research Plan Contract

**Status:** IMPLEMENTED
**Entry Point:** `/qori-plan`
**Handler:** `backend/src/helpers/slack/commands/planHandler.ts`
**Modal Builder:** `backend/src/helpers/slack/ui/studySetupModal.ts` (via planModalOpener)
**Application Service:** `backend/src/application/plan.app-service.ts` → `executePlan`
**YAML Template:** `config/prompts/research_plan.yaml` (v4.7)
**Callback ID:** `research_plan_modal`

## Purpose

The research plan is the **execution document** — it elaborates on an approved brief with operational detail. Brief approved → plan elaborates.

## Preconditions

- Project must exist
- Study must exist with `brief_status = approved`
- Actor must have project access (GOV-1)

## Researcher Input (Modal Fields)

| UI Label | block_id | action_id | Type | Required | Default/Inherited |
|----------|----------|-----------|------|----------|-------------------|
| Lead researcher | `lead_researcher_block` | `lead_researcher` | users_select | Yes | Auto-fills from Slack profile |
| Research method | `research_method_block` | `research_method` | static_select | Yes | Inherited from brief methodology_selection |
| Number of participants | `num_participants_block` | `num_participants` | plain_text_input | Yes | — |
| Session duration | `session_duration_block` | `session_duration` | plain_text_input | Yes | — |
| Start date | `start_date_block` | `start_date` | date_picker | Yes | Next Monday |
| Operational risks | `operational_risks_block` | `operational_risks` | plain_text_input (multiline) | No | — |

## What Qori Generates

| Output | Type | Authority |
|--------|------|-----------|
| Plan artifact (Markdown) | ARTIFACT | GitHub |
| Methodology-driven deliverables | AI PROPOSAL | LLM selects based on methodology |
| Plan variables | CASCADE PROJECTION | study_variables |

## Cascade Pre-fill

- `methodology_selection` from brief → pre-selects research method
- `research_questions` from brief → feeds AI task context
- `target_barriers` from brief → feeds AI task context

## Workspace Design Notes

- Lead researcher → user picker (not Slack users_select)
- 8 fields (down from 15 in early versions) — already simplified for modal
- Start date defaults to next Monday — Workspace can auto-compute

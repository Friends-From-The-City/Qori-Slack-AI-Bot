# Research Plan Contract

**Status:** IMPLEMENTED
**Entry Point:** `/qori-plan`
**Handler:** `backend/src/helpers/slack/commands/planHandler.ts`
**Modal Builder:** `backend/src/helpers/slack/ui/researchPlanGeneratorModal.ts`
**Modal Opener (action):** `backend/src/helpers/slack/commands/modal-openers/planModalOpener.ts`
**Modal Opener (command):** `backend/src/helpers/slack/commands/modal-openers/planCommandOpener.ts`
**Study Picker:** `backend/src/helpers/slack/ui/studySetupModal.ts` (shared with discussion guide)
**Application Service:** `backend/src/application/plan.app-service.ts` -> `executePlan`
**YAML Template:** `config/prompts/research_plan.yaml`
**Callback ID:** `research_plan_modal`

## Purpose

The research plan is the execution document. It elaborates on an approved brief with operational detail.

## CURRENT: Preconditions (runtime-verified)

- Study must exist (fetched by ID via `getStudyById`)
- Study must belong to a project (`study.project_id` must be non-null; planModalOpener guard rail #3)
- Actor must have project access (`assertProjectAccess` in opener, `assertStudyAccess` in handler)
- Cascade readiness check: required upstream variables must exist (`buildCascadeReadiness` in opener). If missing, form is replaced with warning-only view (no submit button, no form fields).

**Note on brief_status:** The existing docs claim `brief_status=approved` is a precondition. This is NOT enforced at runtime. Neither `planModalOpener.ts`, `planCommandOpener.ts`, `planHandler.ts`, nor `plan.app-service.ts` check `brief_status`. The effective gate is the cascade readiness check: if the brief has not been approved and its variables have not been extracted, the cascade variables (research_objectives, research_questions, target_barriers) will be missing and the plan modal will show a warning-only view instead of the form.

## CURRENT: Researcher Input (Modal Fields) -- 2 fields only

The plan modal (`researchPlanGeneratorModal.ts`) has exactly 2 input fields. All other content comes from cascade variables.

| UI Label | block_id | action_id | Type | Required | Notes |
|----------|----------|-----------|------|----------|-------|
| Who's leading this study? | `lead_researcher_block` | `lead_researcher_select` | `users_select` | Yes | Pre-filled with `study.created_by` or opener's user ID. Handler resolves to display name via `client.users.info()` with fallback chain: `real_name` -> `profile.display_name` -> `name` -> raw user ID. |
| Anything that could go wrong? | `operational_risks_block` | `operational_risks_input` | `plain_text_input` (multiline) | No (optional) | No max_length constraint in the modal definition. |

The study name is displayed as a non-editable context block (`study_display_block`), set by `planModalOpener.ts`. It is not a form input.

## CURRENT: What the Plan App Service Consumes

`plan.app-service.ts` loads upstream cascade variables via `readUpstreamVariablesByContext`:

| Variable | Required | Source |
|----------|----------|--------|
| `research_objectives` | Yes (throws `TemplateContractError` if missing/empty) | Brief extraction |
| `research_questions` | Yes (requested as required) | Brief extraction |
| `target_barriers` | Yes (requested as required) | Brief extraction |
| `methodology_selection` | No | Brief extraction |
| `timeline_preference` | No (defaults to `'standard'`) | Brief extraction |
| `start_date` | No (defaults to `''`) | Brief extraction |
| `recruitment_sources` | No (defaults to `''`) | Brief extraction |
| `participant_approach` | No (defaults to `''`) | Brief extraction |

Additionally the app service:

- Resolves per-participant compensation from `study.parsed_budget_amount` via `calculatePerPersonCompensation(study)`
- Reads `study.target_participants` as fallback when `participant_approach` cascade var is empty
- Builds timeline phases from `start_date` + `timeline_preference` via `buildTimelinePhases` / `buildTimelineSummary`
- Runs cascade extraction on the generated plan artifact (via `processYamlTemplate` + `renderedYaml.extractionPromise`)

## CURRENT: What the Plan App Service Generates

| Output | Type | Storage |
|--------|------|---------|
| Plan artifact (Markdown) | Generated document | GitHub (via `processYamlTemplate`) |
| Plan database record | DB record | `research_plans` table (via `research_planService.createResearchPlan`) |
| Study status entry | Status tracking | `study_statuses` table (via `addStudyStatus`, status: `'created'`) |
| Cascade variables | Extracted variables | `study_variables` table (via extraction promise from YAML processor) |

## CURRENT: Plan Approval Flow -- REMOVED

There is no plan approval flow. This is explicitly documented in three places in the runtime code:

- `events.ts:462`: `// Plan approval removed -- brief (scope) is the only approval gate.`
- `events.ts:59`: `// Approval flows (plan approval removed -- brief is the only gate)`
- `studyResultBlocks.ts:29`: `// Plan approval removed per user request -- brief (scope) is the only approval gate.`

The brief is the only document that goes through stakeholder approval.

## CURRENT: Entry Flow

1. `/qori-plan` command -> `planCommandOpener.ts` -> fetches user's studies -> opens study picker modal (`studySetupModalPlanStudy`)
2. User selects study, clicks "Open" next to "Research plan" -> `planModalOpener.ts` (action: `create_research_plan`)
3. Opener fetches study by ID, validates project access, checks cascade readiness
4. If cascade ready: shows plan form (2 fields + study name display). If not ready: shows warning-only view (no submit).
5. User submits -> `planHandler.ts` -> `handlePlanSubmission` -> validates metadata, re-authorizes, resolves lead researcher name, delegates to `executePlan`
6. App service runs -> DM sent to researcher with plan URL and next-step prompt (`/qori-fieldwork`)

Alternative entry: `create_research_plan_from_brief` action (registered in `events.ts:459`) opens the plan modal directly from a brief approval button via `briefToStudyHandler.ts`.

## NOT IMPLEMENTED

- Plan approval flow (explicitly removed; brief is the only approval gate)
- `brief_status` enforcement (cascade readiness is the effective gate, not a status check)
- Plan editing or versioning after initial generation

## INTENDED (architectural direction, not yet in code)

- Workspace (web) surface for plan viewing and editing

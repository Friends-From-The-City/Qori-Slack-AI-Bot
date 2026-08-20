# Discovery Contract

**Status:** IMPLEMENTED
**Entry Point:** `/qori-discover`
**Handler:** `backend/src/helpers/slack/commands/discoverHandler.ts`
**Callback IDs:** `discover_desk_research_modal`, `discover_stakeholder_modal`, `discover_survey_modal`

## Purpose

Discovery is pre-study research that informs briefs and accumulates as organizational memory across studies. It covers:

1. **Desk Research** — literature review, competitive analysis, existing research
2. **Stakeholder Synthesis** — stakeholder interview summaries and themes
3. **Survey Synthesis** — survey response analysis and patterns

Discovery is team-scoped (not study-scoped). Discovery artifacts live at `{team}/_discovery/{type}/` in the content repo.

## How Discovery Begins

1. Researcher types `/qori-discover` in any channel
2. **Discovery Hub modal** opens showing:
   - Existing discovery artifacts (if any) grouped by type
   - Three action buttons: "Desk Research", "Stakeholder Synthesis", "Survey Synthesis"
3. Clicking a type opens the type-specific modal

## Discovery Hub (First Modal)

The hub is a read + dispatch surface:
- Lists existing artifacts by type (fetched from study variables with discovery scope)
- Each type button dispatches to `openDiscoverTypeModal` with the action_id determining type

## Type-Specific Modals

### Desk Research

| UI Label | block_id | action_id | Type | Required | Placeholder |
|----------|----------|-----------|------|----------|-------------|
| Topic | `topic_block` | `topic` | plain_text_input | Yes | "e.g., VA mobile appointment scheduling" |
| Description | `description_block` | `description` | plain_text_input (multiline) | Yes | "What are you investigating?" |
| Source files | `files_block` | `files` | file_input | Yes | — |
| Question focus | `question_focus_block` | `question_focus` | plain_text_input (multiline) | No | "What questions should the analysis focus on?" |

### Stakeholder Synthesis

| UI Label | block_id | action_id | Type | Required | Placeholder |
|----------|----------|-----------|------|----------|-------------|
| Topic | `topic_block` | `topic` | plain_text_input | Yes | "e.g., Claims modernization stakeholder views" |
| Description | `description_block` | `description` | plain_text_input (multiline) | Yes | "What stakeholder context are you synthesizing?" |
| Source files | `files_block` | `files` | file_input | Yes | — |
| Question focus | `question_focus_block` | `question_focus` | plain_text_input (multiline) | No | — |

### Survey Synthesis

| UI Label | block_id | action_id | Type | Required | Placeholder |
|----------|----------|-----------|------|----------|-------------|
| Survey name | `survey_name_block` | `survey_name` | plain_text_input | Yes | "e.g., Q3 2026 Veteran Experience Survey" |
| Description | `description_block` | `description` | plain_text_input (multiline) | Yes | — |
| Source files | `files_block` | `files` | file_input | Yes | — |
| Question focus | `question_focus_block` | `question_focus` | plain_text_input (multiline) | No | — |

## What Qori Generates

| Output | Authority | Downstream |
|--------|-----------|------------|
| Discovery variables | CASCADE PROJECTION (study_variables with discovery synthetic ID `discovery:{team}:{type}`) | Brief modal discovery checkboxes |
| Discovery artifact (Markdown) | ARTIFACT (GitHub at `{team}/_discovery/{type}/{topic_slug}.md`) | Read by researchers; referenced in briefs |
| Evidence sources | CANONICAL (evidence_sources table) | Traceability |
| Evidence constructs | CANONICAL (evidence_constructs table) | Traceability |

## YAML Templates

- `desk_research.yaml` — `discovery_scope: true`, outputs to `{{team}}/_discovery/desk-research/`
- `stakeholder_synthesis.yaml` — `discovery_scope: true`, outputs to `{{team}}/_discovery/stakeholder-interviews/`
- `survey_synthesis.yaml` — `discovery_scope: true`, outputs to `{{team}}/_discovery/survey-synthesis/`

## Variable Store

Discovery variables use synthetic study_id pattern: `discovery:{team}:{type}`.
Postgres is authoritative. GitHub JSON files retained as non-authoritative debugging artifacts.
Pool merges use database transactions.

## Downstream Consumption

The research brief modal offers checkboxes to select which discovery artifacts should inform the brief. The handler manually injects selected discovery variables (NOT via YAML `consumes:` block) — researcher controls which sources inform each brief.

## What Researcher Can Revisit/Edit

- Researcher can re-run `/qori-discover` at any time to add more artifacts
- Existing artifacts are listed in the hub
- Re-running with the same topic slug overwrites (semantic_key dedup)
- No inline editing of generated discovery artifacts from Slack

## Workspace Design Notes

- Discovery hub → full page with type tabs or cards
- Type modals → forms within the discovery page
- File upload → drag-and-drop or file picker (not Slack file_input)
- Existing artifacts → browsable list with previews
- Missing from current design package — needs screen spec

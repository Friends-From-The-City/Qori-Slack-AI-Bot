# Discovery Contract

**Status:** CURRENT (implemented)
**Entry Point:** `/qori-discover`
**Handler:** `backend/src/helpers/slack/commands/discoverHandler.ts`
**Hub Modal:** `backend/src/helpers/slack/ui/discoverHubModal.ts`
**Type Modals:** `backend/src/helpers/slack/ui/discoverTypeModals.ts`
**Callback IDs:** `discover_hub_modal` (hub), `discover_desk_research_modal`, `discover_stakeholder_modal`, `discover_survey_modal`

## Purpose

Discovery is pre-study research that informs briefs and accumulates as organizational memory across studies. It covers:

1. **Desk Research** — literature review, competitive analysis, existing research
2. **Stakeholder Synthesis** — stakeholder interview summaries and themes
3. **Survey Synthesis** — survey response analysis and patterns

Discovery is team-scoped (not study-scoped). Discovery artifacts live at `{team}/_discovery/{type}/` in the content repo.

## How Discovery Begins

**CURRENT — verified against `discoverHandler` and `discoverHubModal.ts`:**

1. Researcher types `/qori-discover` in a project-linked channel
2. Handler resolves project from channel binding via `getProjectByChannelId(channelId)` — if no project bound, posts ephemeral with guidance to run `/qori-start` first
3. GOV-1 authorization check via `assertProjectAccess(userId, project.id, client)`
4. **Discovery Hub modal** opens showing:
   - Context text: "Pre-study research that informs your brief..."
   - Three section-with-accessory rows: "Desk research", "Stakeholder synthesis", "Survey synthesis" — each with an "Open" button
   - Existing discovery artifacts section (dynamically injected)
5. Clicking a type button triggers `openDiscoverTypeModal` which calls `views.update` to replace the hub with the type-specific modal

## Discovery Hub (First Modal)

**CURRENT — `discoverHubModal.ts` + `discoverHandler.ts`:**

The hub is a read + dispatch surface (no input blocks, no submit button):
- Dynamic artifact visibility injected into `discovery_artifacts_block` by `buildArtifactDisplayText(artifacts)`
- `buildArtifactDisplayText` shows up to 5 artifacts with icon, slug, label, date; if >5, shows "...and N more. These all feed into /qori-brief automatically."
- If no artifacts: "No discovery research yet. Start with desk research to build your team's knowledge base."
- Three "Open" buttons dispatch to type-specific modals via action handlers with `value` = discovery type key

## Type-Specific Modals

**CURRENT — verified against `discoverTypeModals.ts`:**

### Desk Research (`discover_desk_research_modal`)

| UI Label | block_id | action_id | Type | Required | Hint | Placeholder |
|----------|----------|-----------|------|----------|------|-------------|
| What topic are you exploring? | `topic_block` | `topic` | plain_text_input | Yes | "Used as the artifact name" | "e.g., Veteran telehealth adoption barriers" |
| What do you need this source to tell you? | `description_block` | `description` | plain_text_input (multiline) | Yes | "How this source relates to the project problem. Gaps are derived against this." | "e.g., What barriers do Veterans face with claim status tracking?" |
| Upload files | `file_upload_block` | `file_upload` | file_input | Yes | "PDF, Word, text, or markdown — up to 10 files" | — |

**File types:** `["pdf", "docx", "doc", "txt", "md"]`
**Max files:** `10`

### Stakeholder Synthesis (`discover_stakeholder_modal`)

| UI Label | block_id | action_id | Type | Required | Hint | Placeholder |
|----------|----------|-----------|------|----------|------|-------------|
| What topic are you exploring? | `topic_block` | `topic` | plain_text_input | Yes | "Used as the artifact name" | "e.g., Claims process stakeholder interviews" |
| What do you need this source to tell you? | `description_block` | `description` | plain_text_input (multiline) | Yes | "How this source relates to the project problem. Gaps are derived against this." | "e.g., What constraints do internal teams face with claims processing?" |
| Upload files | `file_upload_block` | `file_upload` | file_input | Yes | "PDF, Word, text, or markdown — up to 10 files" | — |

**File types:** `["pdf", "docx", "doc", "txt", "md"]`
**Max files:** `10`

### Survey Synthesis (`discover_survey_modal`)

| UI Label | block_id | action_id | Type | Required | Hint | Placeholder |
|----------|----------|-----------|------|----------|------|-------------|
| What topic are you exploring? | `topic_block` | `topic` | plain_text_input | Yes | "Used as the artifact name" | "e.g., Post-launch user satisfaction" |
| What do you need this source to tell you? | `description_block` | `description` | plain_text_input (multiline) | Yes | "How this source relates to the project problem. Gaps are derived against this." | "e.g., What satisfaction levels exist post-launch?" |
| What's the survey called? | `survey_name_block` | `survey_name` | plain_text_input | Yes | — | "e.g., Post-launch satisfaction survey" |
| Which questions should Qori focus on? | `question_focus_block` | `question_focus` | plain_text_input (multiline) | No (`optional: true`) | — | "e.g., Q5: What was most frustrating? Q8: Any other feedback?" |
| Upload survey data | `file_upload_block` | `file_upload` | file_input | Yes | "CSV format only — up to 10 files" | — |

**File types:** `["csv"]`
**Max files:** `10`

**Note:** Desk research and stakeholder synthesis modals do NOT have `question_focus_block` or `survey_name_block`. Only survey synthesis has those additional fields.

## Submission Validation

**CURRENT — verified against `handleDiscoverSubmission`:**

- Topic is required (returns error DM if missing)
- Topic must contain alphanumeric characters: `slugifyTopic(topic)` must be non-empty after lowercasing, replacing non-alphanumeric with hyphens, and trimming
- At least one file must be uploaded (returns error DM if empty)
- File type filtering is enforced by Slack's `file_input` element (filetypes array), not by handler code

## Processing Paths

**CURRENT — verified against `handleDiscoverSubmission`:**

- **Desk research / Stakeholder synthesis:** Files processed via `processSlackFiles`, then delegated to `executeDiscovery` application service
- **Survey synthesis:** Forks to `handleSurveyUploadPhase` which triggers the full survey pipeline (schema review, privacy scan, codebook, match, synthesis) — NOT the same code path as desk/stakeholder

## What Qori Generates

**CURRENT:**

| Output | Authority | Downstream |
|--------|-----------|------------|
| Discovery variables | CASCADE PROJECTION (`study_variables` with discovery synthetic ID `discovery:{team}:{type}`) | Brief modal discovery checkboxes |
| Discovery artifact (Markdown) | ARTIFACT (GitHub at `{projectSlug}/00-discovery/`) | Read by researchers; referenced in briefs |
| Evidence sources | CANONICAL (`evidence_sources` table) | Traceability |
| Evidence constructs | CANONICAL (`evidence_constructs` table) | Traceability |

## Emitted Variable Keys (from YAML `emits:` blocks)

**CURRENT — verified against YAML template files:**

### `desk_research.yaml`

| Key | Pool Strategy |
|-----|--------------|
| `discovered_barriers` | append (sonnet) |
| `discovered_metrics` | append |
| `discovered_journeys` | append |
| `methodology_recommendations` | append |
| `knowledge_gaps` | append |
| `source_artifacts` | append |

### `stakeholder_synthesis.yaml`

| Key | Pool Strategy |
|-----|--------------|
| `discovered_barriers` | append |
| `knowledge_gaps` | append |
| `stakeholder_constraints` | replace (sonnet) |
| `stakeholder_priorities` | replace (sonnet) |
| `alignment_gaps` | replace (sonnet) |
| `stakeholder_questions_for_users` | replace (sonnet) |
| `backstage_observations` | replace (sonnet) |
| `system_failure_modes` | replace (sonnet) |

### `survey_synthesis.yaml`

| Key | Pool Strategy |
|-----|--------------|
| `survey_findings` | append |
| `knowledge_gaps` | append |

**NOT EMITTED** (per explicit comments in `survey_synthesis.yaml`):
- `survey_themes` — "themes" terminology retired (Slice 2B decision)
- `survey_recommendations` — not present in emits
- `sample_demographics` — "no confirmed demographic fields"

## YAML Templates

**CURRENT:**

- `desk_research.yaml` — `discovery_scope: true`, outputs to `{{team}}/_discovery/desk-research/`
- `stakeholder_synthesis.yaml` — `discovery_scope: true`, outputs to `{{team}}/_discovery/stakeholder-interviews/`
- `survey_synthesis.yaml` — `discovery_scope: true`, outputs to `{{team}}/_discovery/survey-synthesis/`

## Variable Store

**CURRENT:**

Discovery variables use synthetic study_id pattern: `discovery:{team}:{type}`.
Postgres is authoritative. GitHub JSON files retained as non-authoritative debugging artifacts.
Pool merges use database transactions.

## Downstream Consumption

**CURRENT:**

The research brief modal offers checkboxes to select which discovery artifacts should inform the brief. The handler manually injects selected discovery variables (NOT via YAML `consumes:` block) — researcher controls which sources inform each brief. See `researchBriefEntryModal.ts` for checkbox construction and `briefHandler.ts` for extraction.

## What Researcher Can Revisit/Edit

**CURRENT:**

- Researcher can re-run `/qori-discover` at any time to add more artifacts
- Existing artifacts are listed in the hub via `buildArtifactDisplayText`
- Re-running with the same topic slug overwrites (semantic_key dedup)
- No inline editing of generated discovery artifacts from Slack

## Workspace Design Notes

**INTENDED — not implemented, design direction only:**

- Discovery hub -> full page with type tabs or cards
- Type modals -> forms within the discovery page
- File upload -> drag-and-drop or file picker (not Slack file_input)
- Existing artifacts -> browsable list with previews
- Missing from current design package — needs screen spec

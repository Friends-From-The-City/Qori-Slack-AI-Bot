# /qori-discover Full Surface Audit

**Date:** 2026-05-21
**Status:** Phase 1 audit — no solutions proposed
**Scope:** Everything triggered by `/qori-discover`, plus the legacy study-scoped discovery handlers

---

## 1. Current state inventory

### 1.1 Entry point

`/qori-discover` is registered in `events.ts:203` and routes to `discoverHandler` in `backend/src/helpers/slack/commands/discoverHandler.ts`.

The command opens the discovery modal **directly** — no study selector, no hub. Discovery is pre-study work: artifacts are stored in `{team}/_discovery/`, not in any study folder. The `QORI_TEAM_SLUG` env var (default: `friends-lab`) scopes the workspace.

### 1.2 The discovery modal

**File:** `backend/src/helpers/slack/ui/discoverModal.ts`
**Callback ID:** `discover_modal`

```
┌─────────────────────────────────────────────────────────┐
│  Discovery research                          [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  Pre-study discovery research. Upload documents for     │
│  analysis — results are stored in the _discovery/       │
│  workspace, not tied to a specific study.               │
│ ─────────────────────────────────────────────────────── │
│  *Discovery type*                                       │
│                                                         │
│  What kind of discovery?                                │
│  ┌───────────────────────────────────┐                  │
│  │ Select discovery type...       ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Topic                                                  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Veteran telehealth          │                  │
│  │ adoption barriers                 │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name and filename slug            │
│                                                         │
│  Description                                (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ Optional context about the        │                  │
│  │ uploaded documents                │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  *Documents*                                            │
│                                                         │
│  Upload files                                           │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  Desk research: PDF, DOCX, TXT, MD. Stakeholder: PDF,  │
│  DOCX, TXT, MD. Survey: CSV, XLSX, XLS.                │
│                                                         │
│  Survey name (survey only, required)        (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Post-launch satisfaction    │                  │
│  │ survey                            │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Questions to focus on (survey only)        (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Q5: What was most          │                  │
│  │ frustrating? Q8: Any feedback?    │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Field inventory

| # | Block ID | Label | Type | Required | Conditional? | Notes |
|---|----------|-------|------|----------|--------------|-------|
| 1 | — | (context) | context | — | — | Explains pre-study scope |
| 2 | — | *Discovery type* | section header | — | — | |
| 3 | `discovery_type_block` | What kind of discovery? | static_select | Yes | No | 3 options: desk, stakeholder, survey |
| 4 | `topic_block` | Topic | plain_text_input | Yes | No | Becomes artifact name + filename slug |
| 5 | `description_block` | Description | plain_text_input (multiline) | No | No | Context about uploaded documents |
| 6 | — | *Documents* | section header | — | — | |
| 7 | `file_upload_block` | Upload files | file_input | Yes | No | Max 10, accepts all file types regardless of discovery type |
| 8 | `survey_name_block` | Survey name (survey only, required) | plain_text_input | No* | **Should be** | Label says required for survey but Slack marks it optional |
| 9 | `question_focus_block` | Questions to focus on (survey only) | plain_text_input (multiline) | No | **Should be** | Only relevant for survey synthesis |

### 1.4 Handler routing

```
/qori-discover
    ↓
discoverHandler() — events.ts:203
    ├─ ack()
    └─ client.views.open(discoverModal, { channelId })

User submits discover_modal
    ↓
handleDiscoverSubmission() — events.ts:276
    ├─ Extract: discoveryType, topic, description, files, surveyName, questionFocus
    ├─ Validate (discoveryType valid, topic non-empty, files ≥ 1, surveyName if survey)
    ├─ processSlackFiles() → extract text content
    ├─ parseDocuments() → structured content
    ├─ Assemble DiscoveryTemplateInput
    ├─ scaffoldDiscoveryFolders() → ensure _discovery/ structure exists
    ├─ Check for duplicate output files
    ├─ Fetch YAML template (desk_research.yaml | stakeholder_synthesis.yaml | survey_synthesis.yaml)
    ├─ processYamlTemplate() → render + emit variables
    └─ Post success message to channel with GitHub link
```

**No study context passed.** The handler creates a synthetic `selected_study: 'discovery-{topicSlug}'` for variable store keying. Output goes to `{team}/_discovery/{type}/{topicSlug}-{fileSlug}-{date}.md`.

### 1.5 Legacy study-scoped discovery handlers

Before `/qori-discover` existed, discovery was done through the study setup hub modal (`/qori-plan`). Three upload buttons existed:

- **Desk research** — action `upload_desk_research` → `deskResearchHandler.ts` → `uploadDeskResearchModal.ts`
- **Stakeholder notes** — action `upload_stakeholder_notes` → `stakeholderHandler.ts` → `uploadStakeholderNotesModal.ts`
- **Survey data** — action `upload_survey_data` → `surveyHandler.ts` → `uploadSurveyDataModal.ts`

**Current status: orphaned.** The upload buttons were removed from the study setup modal in PR #156 (modal polish). The action registrations in `events.ts:267-275` still exist. The handlers and modals still exist. But no UI triggers them.

These handlers are **study-scoped** — they require a study selection, store output in the study folder, and register status in the study_status table. They use the same YAML templates as `/qori-discover` but with different data assembly (study path vs. discovery path).

---

## 2. Researcher workflow today

### 2.1 Desk research: happy path

1. Researcher runs `/qori-discover`
2. Modal opens — selects "Desk research" from dropdown
3. Types a topic: "veteran telehealth barriers"
4. Optionally adds a description
5. Uploads 1-10 PDF/DOCX/TXT/MD files (reports, competitive analysis, etc.)
6. Survey name and question focus fields are visible but irrelevant — researcher ignores them
7. Clicks "Analyze"
8. **No progress notification.** Researcher sees nothing.
9. After 20-60 seconds, a channel message appears with a GitHub link to the synthesis
10. Synthesis is stored at `friends-lab/_discovery/desk-research/{slug}-desk-research-{date}.md`
11. Variables emitted: `discovered_barriers`, `discovered_metrics`, `discovered_journeys`, `methodology_recommendations`, `knowledge_gaps`, `source_artifacts`

**Friction points:**
- Survey-specific fields visible but irrelevant for desk research
- No "Generating..." feedback
- File type hint lists all types for all discovery types — researcher must mentally filter

### 2.2 Stakeholder synthesis: happy path

1. Researcher runs `/qori-discover`
2. Selects "Stakeholder interviews"
3. Types topic, uploads interview transcripts/notes
4. Survey fields irrelevant — ignores them
5. Clicks "Analyze"
6. Same silent wait, then channel message
7. Stored at `friends-lab/_discovery/stakeholder-interviews/{slug}-stakeholder-synthesis-{date}.md`
8. Variables emitted: `stakeholder_constraints`, `stakeholder_priorities`, `alignment_gaps`, `stakeholder_questions_for_users`, `backstage_observations`, `system_failure_modes`

**Friction points:**
- Same as desk research: irrelevant survey fields, no progress notification
- The stakeholder synthesis YAML consumes `discovered_barriers` and `knowledge_gaps` from desk research. But the handler doesn't load these — the `yamlProcessor` does automatically via the `consumes` block. The researcher has no visibility into whether desk research exists and will be used.

### 2.3 Survey synthesis: happy path

1. Researcher runs `/qori-discover`
2. Selects "Survey synthesis"
3. Types topic, adds survey name (required but marked optional in modal — validated in handler)
4. Optionally specifies which questions to focus on
5. Uploads CSV/XLSX/XLS files
6. "Upload files" accepts all file types — researcher can accidentally upload PDFs here
7. Clicks "Analyze"
8. Same silent wait, then channel message
9. Stored at `friends-lab/_discovery/survey-synthesis/{slug}-survey-synthesis-{date}.md`
10. Variables emitted: `survey_themes`, `survey_findings`, `discovered_barriers`, `discovered_metrics`, `sample_demographics`, `knowledge_gaps`

**Friction points:**
- Survey name is optional in modal but required in handler validation — researcher gets a cryptic error if they skip it
- File type filtering doesn't narrow to CSV/XLSX/XLS when survey is selected
- No progress notification

---

## 3. Cascade integration assessment

### 3.1 Where /qori-discover sits in the cascade chain

```
/qori-discover (desk research)
    ↓ emits: discovered_barriers, discovered_metrics, knowledge_gaps, ...
/qori-discover (stakeholder synthesis)
    ↓ consumes: discovered_barriers, knowledge_gaps (from desk research)
    ↓ emits: stakeholder_constraints, stakeholder_priorities, ...
/qori-discover (survey synthesis)
    ↓ emits: survey_themes, survey_findings, discovered_barriers, ...
        ↓ ↓ ↓
/qori-brief (research brief)
    ↓ consumes: all discovery variables via manual handler selection
    ↓ emits: research_objectives, research_questions, methodology_selection, ...
        ↓
/qori-plan (research plan, discussion guide, stakeholder interview guide)
```

Discovery is the **upstream source** for the entire cascade. Brief manually loads discovery artifacts via `loadDiscoveryArtifacts()` and presents them as checkboxes for the researcher to select.

### 3.2 What /qori-discover consumes

| Template | Consumes | From |
|---|---|---|
| `desk_research.yaml` | Nothing | It's the root source |
| `stakeholder_synthesis.yaml` | `discovered_barriers`, `knowledge_gaps` | desk_research (optional) |
| `survey_synthesis.yaml` | Nothing | Independent source |

### 3.3 What /qori-discover emits

| Template | Emits | Pool strategy | Consumed by |
|---|---|---|---|
| desk_research | `discovered_barriers` | append | stakeholder_synthesis, research_brief |
| desk_research | `discovered_metrics` | append | research_brief |
| desk_research | `discovered_journeys` | append | research_brief |
| desk_research | `methodology_recommendations` | append | research_brief |
| desk_research | `knowledge_gaps` | append | stakeholder_synthesis, stakeholder_interview_guide |
| desk_research | `source_artifacts` | — | research_brief |
| stakeholder_synthesis | `stakeholder_constraints` | replace | design_opportunities, service_blueprint, research_brief |
| stakeholder_synthesis | `stakeholder_priorities` | replace | research_brief |
| stakeholder_synthesis | `alignment_gaps` | replace | research_brief |
| stakeholder_synthesis | `stakeholder_questions_for_users` | replace | research_brief |
| stakeholder_synthesis | `backstage_observations` | replace | service_blueprint |
| stakeholder_synthesis | `system_failure_modes` | replace | service_blueprint |
| survey_synthesis | `survey_themes` | append | research_brief |
| survey_synthesis | `survey_findings` | append | research_brief |
| survey_synthesis | `discovered_barriers` | append | research_brief |
| survey_synthesis | `discovered_metrics` | append | research_brief |
| survey_synthesis | `sample_demographics` | replace | research_brief |
| survey_synthesis | `knowledge_gaps` | append | stakeholder_interview_guide |

### 3.4 Cascade pre-fill opportunities not being used

| Opportunity | Detail |
|---|---|
| **Stakeholder synthesis → show desk research context** | When the researcher selects "Stakeholder interviews", the modal could show which desk research artifacts exist and which variables they produced. Currently invisible — the researcher doesn't know if desk research has been done. |
| **Recommended discovery order** | The cascade has a natural order: desk research → stakeholder → survey (stakeholder synthesis consumes desk research output). The modal doesn't surface this. |
| **Previous discovery for same topic** | If the researcher runs desk research for "telehealth barriers" and later runs it again, the modal doesn't warn about the existing artifact or offer to append. The handler checks for filename duplicates and appends a timestamp, but the researcher doesn't see the existing work. |

---

## 4. Anti-pattern detection

### 4.1 Form ID fields

**None.** The `/qori-discover` modal doesn't have study selection — it's pre-study. No form ID anti-pattern.

### 4.2 Cascade-blank inputs

| Field | Assessment |
|---|---|
| Topic | **No cascade source.** Discovery topics are genuinely new. |
| Description | **No cascade source.** Context about uploaded documents. |
| Research questions / focus | **Partial.** If previous desk research exists, `knowledge_gaps` could suggest what stakeholder interviews should explore. Not pre-filled. |

### 4.3 Formal labels

| Current | Assessment |
|---|---|
| "What kind of discovery?" | Already conversational — good. |
| "Topic" | Terse. Could be "What topic are you exploring?" |
| "Description" | Generic. Could be "What are these documents about?" |
| "Upload files" | Functional. Acceptable for a file input. |
| "Survey name (survey only, required)" | Confusing — label explains conditionality in parentheses. Should be hidden unless survey type selected. |
| "Questions to focus on (survey only)" | Same — parenthetical conditionality. |

### 4.4 Missing cascade gates

**Not applicable.** Discovery is the cascade root — nothing upstream to gate on. The stakeholder synthesis template consumes desk research output, but it's optional (the synthesis works without it, just less grounded).

### 4.5 Manual file selection when cascade knows which files are relevant

**Not applicable for /qori-discover itself** — researchers are uploading new external documents. However, this anti-pattern exists in downstream modals (e.g., `/qori-analyze` session summary modal asks researchers to select session files when the system could infer them from participant tracker data).

---

## 5. Conceptual confusion to flag

### 5.1 "Discovery research" = synthesis only (today)

The modal says "Upload documents for analysis" and the submit button says "Analyze." The entire flow assumes the researcher has documents to upload. Every path requires file upload.

The discovery surface redesign plans to add **generation** of discovery artifacts — starting with the stakeholder interview guide (currently misplaced under `/qori-plan`). The interview guide doesn't upload files; it generates a document from modal inputs. The current modal architecture assumes upload → synthesis, which doesn't accommodate generation flows.

**Places assuming synthesis only:**
- Context text: "Upload documents for analysis"
- Submit button: "Analyze" (should be "Generate" for the interview guide)
- File upload block is required
- Handler validates at least 1 file is uploaded
- Template input assumes `document_content` and `combined_file_content` exist

### 5.2 "Pre-study" vs. "study-scoped" confusion

The `/qori-discover` modal says "not tied to a specific study." But researchers doing discovery work often know which study it's for — they may have already created the study via `/qori-brief`. The discovery surface stores artifacts in `_discovery/` (team-scoped), not in the study folder. The brief handler then loads discovery artifacts from `_discovery/` and lets the researcher select which ones to include.

This is architecturally correct (discovery is organizational memory, not study-specific) but can confuse researchers: "I just ran desk research for my study, why isn't it in my study folder?"

### 5.3 Two discovery surfaces coexist

The `/qori-discover` command (pre-study, team-scoped) and the old study-scoped upload handlers (orphaned since PR #156) both exist in the codebase. They use the same YAML templates but different data assembly paths. The old handlers are unreachable from the UI but still registered in `events.ts`.

This creates maintenance burden and confusion: changes to the YAML templates affect both paths, but only the `/qori-discover` path is tested.

### 5.4 Discovery type determines everything but changes nothing in the modal

When the researcher selects "Desk research" vs. "Stakeholder interviews" vs. "Survey synthesis," the modal doesn't change. All fields stay visible. Survey-specific fields (survey name, question focus) are shown for all types. File type filtering doesn't narrow. The discovery type only matters at submission time.

This violates Principle 4 (conditional fields appear conditionally): "When a field is only relevant in certain contexts, hide it until that context exists."

---

## 6. Pain points only researchers know

### 6.1 No progress notification

After clicking "Analyze," the modal closes and nothing happens. The researcher has to watch the channel for 20-60 seconds. If they switch channels, they miss the result. Every other Qori modal has this same gap (except the discussion guide, which was just fixed in PR #160).

### 6.2 Survey name required but marked optional

The `survey_name_block` is `optional: true` in the modal but the handler validates it's present when discovery type is "survey_synthesis." The researcher gets a generic error message posted to the channel instead of a field-level validation error. This is a known Slack limitation — conditional field validation can't be done via `ack()` response_action errors on fields that are marked optional.

### 6.3 File type mismatch not caught early

The file upload accepts all file types regardless of discovery type. A researcher can upload CSV files for desk research (handler will fail during content extraction) or PDFs for survey synthesis (handler will try to parse tabular data and produce garbage). The file type hint text lists valid types per discovery type, but it's a lot of text in a small hint — easy to miss.

### 6.4 No way to see what discovery exists

Before running `/qori-discover`, a researcher can't see what discovery has already been done for their topic or team. No listing, no search, no "recent discoveries" block. They'd have to browse the GitHub repo or run `/qori-brief` (which shows discovery checkboxes).

### 6.5 Single-pass synthesis (no iteration)

Running `/qori-discover` again for the same topic creates a new artifact with a timestamp suffix — it doesn't update or append to the existing one. If a researcher gets new desk research documents after the initial synthesis, they must re-upload everything and run a fresh synthesis. The pool-append strategy on emit variables means cascade data accumulates across runs, but the document artifacts don't consolidate.

### 6.6 No "next step" guidance

After a successful desk research synthesis, the result message says "Run `/qori-brief` to initiate a study." But if the researcher plans to also do stakeholder interviews (which the cascade flow recommends after desk research), they'd benefit from knowing: "Run `/qori-discover` again with Stakeholder interviews to add stakeholder context before starting the brief."

---

## 7. Constraints to design within

### 7.1 Slack platform constraints

| Constraint | Impact |
|---|---|
| **Modal height limit** | Slack modals have a practical limit of ~50 blocks before they become unwieldy to scroll. The current modal has 9 blocks — plenty of room. |
| **No dynamic block visibility** | Slack can't show/hide blocks based on a select value within a single `views.open` call. Conditional fields require a `views.update` triggered by an action on the select element. This means the discovery type selector needs an action registration to dynamically show/hide survey-specific fields. |
| **`file_input` can't filter dynamically** | The `filetypes` parameter on `file_input` is set at modal open time. It can't change based on the discovery type selection without a `views.update`. |
| **`views.push` stack limit** | Slack allows 3 modal layers (root + 2 pushes). The study setup hub is the root, and the current discovery modals push one layer. That leaves one more push available for confirmation or progressive disclosure. |
| **`input` blocks require `submit`** | As discovered in the plan modal (PR #158), modals with `input` blocks must have a `submit` property. Any modal restructure must preserve this. |

### 7.2 Handler dependencies

| Handler | Shared with | Breaking change risk |
|---|---|---|
| `processSlackFiles()` | Used by all upload handlers (outreach, session summary, etc.) | Low — utility function, not discovery-specific |
| `parseDocuments()` / `validateDocuments()` | Same | Low |
| `processYamlTemplate()` | All YAML-based handlers | Low — template processor is generic |
| `readDiscoveryVariables()` | Brief handler (`loadDiscoveryArtifacts`), cascade readiness | Medium — discovery variable store schema must stay stable |
| `scaffoldDiscoveryFolders()` | Only discovery handler | Low — isolated |

### 7.3 YAML template contracts

The three discovery YAML templates define emit schemas that downstream templates consume. Changing emit keys or schemas would break the cascade chain. The templates themselves can be restructured internally (AI tasks, output format) without breaking downstream consumers — only the `emits` block is contractual.

### 7.4 Discovery variable store schema

Discovery variables use synthetic study_id patterns (`discovery:{team}:{type}`) and are stored in Postgres. The `readDiscoveryVariables()` function in `studyVariables.ts` handles this mapping. Any restructure of how discovery stores variables must maintain backward compatibility with existing artifacts — or include a migration.

### 7.5 GitHub output path contract

Discovery artifacts are stored at `{team}/_discovery/{type}/{slug}.md`. The brief handler's `loadDiscoveryArtifacts()` scans this path structure. Changing the folder layout requires updating the loader.

### 7.6 Orphaned handlers

The old study-scoped discovery handlers (`deskResearchHandler.ts`, `stakeholderHandler.ts` upload flow, `surveyHandler.ts`) are registered in `events.ts:267-275` but have no UI trigger. They can be removed in a cleanup pass, but should be verified as truly orphaned first — no other slash command or button triggers them.

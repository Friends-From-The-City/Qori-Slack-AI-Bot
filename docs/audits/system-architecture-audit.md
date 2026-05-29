# System Architecture Audit

**Date:** 2026-05-21
**Purpose:** Pre-design state-of-the-world audit before project restructure
**Scope:** Data model, cascade store, folder conventions, handler patterns, routing, modals, YAML resolution, channel storage

---

## 1. Data Model (Sequelize/PostgreSQL)

### 1.1 Model Inventory (13 Active)

| Model | Table | Purpose |
|-------|-------|---------|
| **ResearchStudy** | `research_studies` | Core study container |
| **ResearchPlan** | `research_plans` | Plan file metadata |
| **StudyNotes** | `study_notes` | Uploaded transcript/notes metadata |
| **SessionSummary** | `session_summaries` | AI-generated summary metadata |
| **StudyParticipant** | `study_participants` | Participant records |
| **SessionObserver** | `session_observers` | Observer assignments |
| **ResearchStudyUserRole** | `research_study_user_roles` | Role-based access |
| **StudyVariable** | `study_variables` | Cascade variable store (authoritative) |
| **StudyStatus** | `research_status` | Approval workflow state |
| **ChannelConfig** | `channel_config` | Slack channel → GitHub mapping |
| **CreatedIssue** | `created_issues` | GitHub issue audit trail |
| **SlackUserState** | `slack_user_state` | User context/active study |
| **User** | `users` | Legacy auth model (unused) |

### 1.2 Relationship Graph

```
ResearchStudy (root)
├─→ ResearchPlan (1:N, CASCADE)
├─→ StudyNotes (1:N, CASCADE)
├─→ SessionSummary (1:N, CASCADE)
├─→ StudyParticipant (1:N, CASCADE)
│   └─→ SessionObserver (N:1, optional, CASCADE)
├─→ SessionObserver (1:N, CASCADE, optional participant)
├─→ ResearchStudyUserRole (1:N, CASCADE)
└─→ SlackUserState (optional, SET NULL on delete)

StudyVariable (standalone, references study_name as string)
ChannelConfig (standalone)
CreatedIssue (standalone)
StudyStatus (standalone)
User (legacy)
```

### 1.3 ResearchStudy Schema

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| name | STRING | Unique study identifier |
| channel_name | STRING | Slack channel name |
| description | TEXT | Study description |
| link | STRING | External link |
| path | STRING | GitHub folder path |
| sha4 | STRING | Git SHA reference |
| created_by | STRING | Slack user ID |
| researcher_name | STRING | Lead researcher display name |
| researcher_email | STRING | Lead researcher email |
| total_participants | INTEGER | Running count |
| parsed_budget_amount | DECIMAL(10,2) | Budget for compensation calc |
| target_participants | INTEGER | Expected participant count |
| created_at | DATE | Timestamp |
| updated_at | DATE | Timestamp |

### 1.4 StudyVariable Schema (Cascade Store)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| study_name | STRING | **No FK** — denormalized reference |
| variable_key | STRING | e.g., "target_barriers", "research_questions" |
| variable_type | STRING | "pool" or "singleton" |
| item_key | STRING | For pool items |
| value | JSONB | Actual variable data |
| participant_id | VARCHAR(50) | For per-participant variables |
| source_template | STRING | Which YAML produced this |
| source_version | STRING | Template version |
| source_date | DATE | When extracted |
| value_hash | STRING | Deduplication hash |
| entry_count | INTEGER | For pool aggregates |
| is_pool | BOOLEAN | Pool vs singleton |
| confidence | VARCHAR(50) | AI confidence level |
| scope | STRING | "study" or "discovery" (default: study) |
| discovery_artifact_id | STRING | For discovery-scoped variables |
| stale | BOOLEAN | Staleness flag |
| extracted_at | DATE | Extraction timestamp |
| created_at | DATE | Row creation |
| updated_at | DATE | Row update |

### 1.5 Key Schema Observations

**Denormalization risk:**
- `study_variables`, `created_issues`, `study_status` reference studies by `study_name` (string), not `study_id` (FK)
- No referential integrity — study rename/delete orphans these rows

**DECIMAL coercion:**
- `parsed_budget_amount` and `compensation_amount` use DECIMAL(10,2)
- Model getters coerce string → number (Sequelize returns strings for DECIMAL)

**Migrations:** 33 total (first: 20250114, latest: 20260516)

---

## 2. Cascade Variable Store

### 2.1 Architecture

**Service:** `studyVariables.ts` (940 lines)

**Strategy:**
- **Postgres as authoritative** (since 2026-05-01)
- **GitHub JSON as fallback/artifact** (migration period)
- **Field normalization** for version-tolerant schema upgrades

### 2.2 Data Structures

**Study-scoped:**
```typescript
StudyVariablesStructure {
  schema_version: "2.0"
  study: string
  last_updated: ISO timestamp
  variables: {
    [variableKey]: {
      value: unknown
      source: { template, version, date }
      pool?: boolean
      confidence?: string
    }
  }
  generation_snapshots: {
    [templateId]: { last_generated, variable_hash }
  }
}
```

**Discovery-scoped:**
```typescript
DiscoveryVariablesStructure {
  schema_version: "2.0"
  scope: "discovery"
  team: string
  discovery_type: string
  last_updated: ISO timestamp
  artifacts: {
    [artifactId]: {
      [variableKey]: { value, source, discovery_artifact_id }
    }
  }
}
```

### 2.3 Key Functions

| Function | Purpose |
|----------|---------|
| `readStudyVariables(studyBasePath)` | Postgres first, GitHub fallback |
| `writeStudyVariables(studyBasePath, data)` | Postgres + GitHub artifact |
| `mergeVariables(existing, extracted, template, version)` | Atomic transaction |
| `readUpstreamVariables(studyBasePath, consumesSpec[])` | Fetch for template consumption |
| `readDiscoveryVariables(team, discoveryType)` | Discovery-scoped read |
| `writeDiscoveryVariables(team, discoveryType, data)` | Discovery-scoped write |
| `searchVariablesAcrossStudies(keys[], terms[], options)` | Cross-study search for `/qori-ask` |

### 2.4 Pool Strategies

| Strategy | Behavior |
|----------|----------|
| `replace` | Overwrite all items for this key |
| `append` | Add to existing items |
| `append_or_replace_per_participant` | Atomic DELETE+INSERT per participant_id |

### 2.5 Field Normalization

Handles schema evolution without migrations:

```typescript
FIELD_RENAMES: {
  validated_themes: { label → theme_name, description → summary }
  personas: { archetype_name → persona_name }
  prioritized_findings: { finding_number → id, title → finding }
}

FLAT_TO_OBJECT_UPGRADES: {
  target_barriers: string[] → [{ id, barrier, source }]
  research_questions: string[] → [{ id, question, priority }]
}
```

### 2.6 GitHub Paths

- Study variables: `{studyBasePath}/primary-research/.variables/study-variables.json`
- Discovery variables: `{team}/_discovery/{discoveryType}/.variables/discovery-variables.json`

---

## 3. Folder Conventions (GitHub)

### 3.1 Study Folder Structure

```
{study_name}/
├── primary-research/
│   ├── 01-planning/
│   │   ├── research-brief.md
│   │   └── research-plan.md
│   ├── 02-participants/
│   │   └── participant-tracker.md
│   ├── 03-fieldwork/
│   │   ├── session-notes/
│   │   └── discussion-guide.md
│   ├── 04-analysis/
│   │   └── session-summaries/
│   ├── 05-findings/
│   │   └── research-readout.md
│   ├── 06-assets/
│   │   └── personas.md, journey-maps.md
│   ├── 07-implementation/
│   │   └── github-issues.md
│   └── .variables/
│       └── study-variables.json (debug artifact)
```

### 3.2 Discovery Folder Structure

```
{team}/_discovery/
├── README.md
├── desk-research/
│   ├── artifacts/
│   └── .variables/discovery-variables.json
├── stakeholder-interviews/
│   └── .variables/discovery-variables.json
└── survey-synthesis/
    └── .variables/discovery-variables.json
```

### 3.3 Config Paths

```
config/
├── prompts/                    # YAML_TEMPLATE_PATH
│   └── (25 YAML templates)
├── templates/                  # Study scaffolding
│   └── primary-research/
└── command-mapping.json        # NOT used at runtime
```

### 3.4 Two-Repo Architecture

| Repo | Purpose | Env Var |
|------|---------|---------|
| Config repo | Templates, YAML (read-only) | `GITHUB_CONFIG_REPO` |
| Content repo | Studies, issues (read-write) | `GITHUB_REPO` |

Fallback: If `GITHUB_CONFIG_REPO` unset, both use `GITHUB_REPO`.

---

## 4. Handler Patterns

### 4.1 Standard Architecture

```
src/helpers/slack/commands/{featureName}Handler.ts
├── Data Assembly Layer
│   └── Extract form values
│   └── Compute dates, timelines, compensation
│   └── Resolve Slack user IDs to display names
│   └── Load cascade variables
├── Template Input Contract (interface)
├── LLM Task Layer (optional structured extraction)
├── YAML Processing
│   └── processYamlTemplate(yamlId, inputData, options)
├── Database Writes
└── Messaging
    └── sendStudyResultMessage()
```

### 4.2 Handler Signature (Bolt Native Types)

```typescript
async function handleXyzSubmission(
  { ack, body, view, client, logger }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs
) {
  await ack();
  const meta = JSON.parse(view.private_metadata || '{}');
  const values = view.state.values;
  // ...
}
```

### 4.3 Form Extraction Helper (Common Pattern)

```typescript
const extract = (blockId: string, actionId: string): string | null => {
  const action = values[blockId]?.[actionId];
  return action?.value?.trim() ||
         action?.selected_option?.value ||
         action?.selected_date ||
         null;
};
```

### 4.4 Error Handling

- `TemplateContractError` caught globally in `events.ts` error middleware
- DM sent to user with userMessage
- Generic errors → DM with "Something went wrong"

### 4.5 Handler Count

~65 handlers registered in events.ts (commands, actions, views, options)

---

## 5. Slash Command Routing

### 5.1 events.ts Structure (365 lines)

**Role:** Registration manifest only — no business logic

**Route Types:**

| Type | Pattern | Count |
|------|---------|-------|
| Slash commands | `slackApp.command('/qori-*', handler)` | 17 |
| Modal actions | `slackApp.action('action_id', handler)` | ~40 |
| Modal submissions | `slackApp.view('callback_id', handler)` | ~25 |
| Options | `slackApp.options('action_id', handler)` | 6 |
| Events | `slackApp.event('message', handler)` | 2 |

### 5.2 Command Inventory

| Command | Handler |
|---------|---------|
| `/qori` | `qoriMainCommand` |
| `/qori-start` | `startResearchHandler` |
| `/qori-brief` | inline modal open |
| `/qori-plan` | `studySetupModalPlanStudy` |
| `/qori-discover` | `discoverHandler` |
| `/qori-fieldwork` | `fieldworkHandler` |
| `/qori-analyze` | `analyzeNotesHandler` |
| `/qori-synthesis` | `researchSynthesisHandler` |
| `/qori-report` | `openReadoutModal` |
| `/qori-tickets` | `ticketHandler` |
| `/qori-ask` | `askHandler` |
| `/qori-learn` | `learnCommand` |
| `/qori-repo` | `repoCommand` |
| `/qori-sync` | `syncCommand` |
| `/qori-delete` | `deleteStudyCommand` |
| `/ask-study` | `askStudyCommand` |
| `/run-template` | `runTemplateCommand` |

### 5.3 Global Error Middleware

```typescript
slackApp.error(({ error, body, logger }) => {
  if (error.original?.name === 'TemplateContractError') {
    // Send DM with userMessage
  } else {
    // Send generic error DM
  }
});
```

---

## 6. Modal Callback Flows

### 6.1 private_metadata Pattern

**Purpose:** Preserve context across modal chain (2-3 interactions)

**Common keys:**
```typescript
{
  studyName: string,
  channelId: string,
  userId: string,
  templateId: string,
  selectedNoteFiles?: string[],
  scope?: string,
  rootViewId?: string,  // For dashboard refresh
}
```

### 6.2 Modal Chains (Examples)

**Research Brief → Plan/Study:**
```
/qori-brief → research_brief_modal
           → handleBriefSubmission
           → create_research_plan_from_brief action
           → openPlanFromBrief
```

**Fieldwork Dashboard:**
```
/qori-fieldwork → fieldwork dashboard
               → action button
               → views.push(sub-modal)
               → handleSubModalSubmission
               → refreshDashboardAfterAction (if rootViewId)
```

**Approval Flow:**
```
approve_plan action → confirmation modal
                   → confirm_approve_plan submission
                   → handleConfirmApprovePlan
```

### 6.3 Metadata Threading Risk

5+ serialization/deserialization points per flow — fragile JSON contracts with no validation.

---

## 7. YAML Template Path Resolution

### 7.1 Path Constants

```typescript
// github.ts
export const YAML_TEMPLATE_PATH = 'config/prompts';

export function getConfigRepo(): string {
  return process.env.GITHUB_CONFIG_REPO || process.env.GITHUB_REPO;
}

export function getContentRepo(): string {
  return process.env.GITHUB_REPO;
}
```

### 7.2 Fetch Flow

```typescript
const yamlFile = await fetchFileFromRepo(
  getConfigRepo(),
  YAML_TEMPLATE_PATH,
  'research_plan.yaml'
);
// Expands to: config/prompts/research_plan.yaml in GITHUB_CONFIG_REPO
```

### 7.3 Processing Pipeline (yamlProcessor.ts)

1. Load YAML from GitHub
2. Read upstream cascade variables via `consumes` spec
3. Validate required variables (throw `TemplateContractError` if missing)
4. Execute AI generation tasks
5. Extract variables via `emits` spec
6. Merge extracted into cascade store
7. Render output template (Handlebars)
8. Build traceability footer
9. Write to GitHub
10. Return result for messaging

### 7.4 YAML Template Structure

```yaml
id: research_plan
version: v4.7

consumes:
  - key: research_brief
    required: true
    source: research_brief

emits:
  - key: research_objectives
    pool_strategy: replace

ai_generation_tasks:
  - task_id: elaborate_objectives
    prompt: |
      Based on the research brief...

output_options:
  filename: research-plan.md
  path: primary-research/01-planning/

output_template: |
  # {{ selected_study }} Research Plan
  ...
```

### 7.5 Template Inventory

25 YAML templates in `config/prompts/`:
- Planning: `research_brief`, `research_plan`, `discussion_guide`
- Discovery: `desk_research`, `stakeholder_synthesis`, `survey_synthesis`
- Analysis: `session_summary`, `affinity_mapping`, `journey_mapping`, `persona_generator`
- Findings: `research_readout`, `designer_readout`, `engineering_readout`, `accessibility_readout`, `leadership_readout`
- Extraction: `usability_issues_extractor`, `design_opportunity_generator`, `jobs_to_be_done`
- Operations: `participant_outreach`, `participant_tracker`, `session_notes`
- Tickets: `github_issues_generator`, `targeted_readouts`
- Legacy: `transcript_upload`, `research_request`, `service_blueprint`

---

## 8. Slack Channel Storage

### 8.1 ChannelConfig Model

| Column | Purpose |
|--------|---------|
| channel_id | Slack channel ID |
| github_id | GitHub user/org ID (optional) |
| repo_id | GitHub repo ID (optional) |
| repo | Repo name |
| product_folder_name | Top-level folder |
| sub_folder_name | Second-level folder |

### 8.2 Lookup Flow

```typescript
const channelConfig = await getChannelConfigByChannelId(command.channel_id);

if (channelConfig?.repo) {
  const baseFolder = channelConfig.product_folder_name || 'studies';
} else {
  // Fallback to GITHUB_REPO
}
```

### 8.3 Current Usage

- Used by `/qori-repo` and `/qori-sync` for configuration
- Brief/Plan handlers infer repo from `study.path` or use default
- ChannelConfig is optional — missing channel → defaults to `GITHUB_REPO`

### 8.4 Multi-Tenant Potential (Not Implemented)

Could enable different channels → different repos. Currently flat: one channel → one repo mapping.

---

## 9. Summary: What the Restructure Will Touch

| Area | Current State | Restructure Impact |
|------|---------------|-------------------|
| **Data Model** | 13 models, `study_name` denormalization | High — need project FK |
| **Cascade Store** | Postgres authoritative, study_name key | High — need project scope |
| **Folder Conventions** | Study-centric paths | High — project/study nesting |
| **Handler Patterns** | Study assumed as container | Medium — add project context |
| **Command Routing** | Study selection in modals | Medium — add project selector |
| **Modal Flows** | Study in private_metadata | Medium — add project threading |
| **YAML Resolution** | Study path based | Medium — project path wrapper |
| **Channel Storage** | Channel → repo mapping | Low — may need channel → project |

# /qori-discover Redesign Spec (Phase 3)

**Date:** 2026-05-21
**Status:** Detailed design — approved for implementation
**Approach:** B — Sections-with-accessories hub (confirmed)
**Prerequisites:** Phase 1 audit, Phase 2 exploration, PR #161 (orphaned cleanup), PR #162 (interview guide removal)

---

## Decision log

### D1: Discovery visibility section behavior

**Decision:** Concrete categories, recent 5, static.

- **Empty state:** `"_No discovery research yet. Start with desk research to build your team's knowledge base._"`
- **Artifact display:** `📄 veteran-telehealth-barriers · May 15 · barriers, metrics, gaps` — concrete variable categories, not raw counts. Categories derived from emitted variable keys: `discovered_barriers` → "barriers", `discovered_metrics` → "metrics", `knowledge_gaps` → "gaps", `stakeholder_constraints` → "constraints", `survey_themes` → "themes", etc.
- **Truncation:** Show most recent 5 artifacts. If more exist, append `"_...and N more. These all feed into /qori-brief automatically._"`
- **Interactivity:** Static context blocks. Not clickable. Clickable artifact links deferred to post-launch if researchers request them.
- **Grouping:** Flat chronological list, type indicated by emoji prefix. No grouping by type — researchers run discovery in mixed order, chronological matches their mental model.

### D2: Next-step guidance logic

**Decision:** Both hub and success message.

**Hub guidance** — soft suggestion context block above the action sections, based on what types of artifacts exist:

| Has desk | Has stakeholder | Has survey | Guidance |
|:---:|:---:|:---:|---|
| — | — | — | `"_Start with desk research — reports and background docs build the foundation._"` |
| ✓ | — | — | `"_Desk research done. Stakeholder interviews add constraints and priorities._"` |
| — | ✓ | — | `"_Stakeholder context captured. Add desk research for broader grounding._"` |
| — | — | ✓ | `"_Survey data captured. Add desk research or stakeholder context to round out discovery._"` |
| ✓ | ✓ | — | `"_Ready for /qori-brief, or add survey data first._"` |
| ✓ | — | ✓ | `"_Ready for /qori-brief, or add stakeholder interviews for constraints._"` |
| — | ✓ | ✓ | `"_Ready for /qori-brief, or add desk research for broader grounding._"` |
| ✓ | ✓ | ✓ | `"_Discovery complete. Run /qori-brief to start your study._"` |

Implementation: check which types have ≥1 artifact via `loadDiscoveryArtifacts()`. Three booleans → 8 states. Each state maps to a guidance string. No `if/else` chain — use a lookup keyed on `${hasDesk}-${hasStakeholder}-${hasSurvey}`.

**Success message guidance** — the existing handler already posts next-step guidance (line 410: "Run `/qori-brief` to initiate a study"). Update to be type-aware:

| After | Guidance |
|---|---|
| Desk research | `"Next: run /qori-discover again for stakeholder interviews, or /qori-brief to start your study."` |
| Stakeholder synthesis | `"Next: run /qori-discover for survey data, or /qori-brief to start your study."` |
| Survey synthesis | `"Next: run /qori-brief to start your study — all discovery feeds in automatically."` |

### D3: Submission handler architecture

**Decision:** Single handler, type from `private_metadata`.

Rationale: The handler body is 90% shared (file processing, slug generation, duplicate check, scaffold, YAML fetch, template rendering, success message). The type-specific code is 3 conditional blocks (lines 349-361) totaling ~15 lines. Three separate handlers would duplicate ~200 lines of shared logic for ~15 lines of divergence. Not worth the split.

The current handler already branches on `discoveryType` extracted from form values. The only change: read `discoveryType` from `private_metadata` (set by the type-specific modal opener) instead of from a form `static_select`.

Each type-specific modal still has its own `callback_id` for clarity (`discover_desk_research_modal`, `discover_stakeholder_modal`, `discover_survey_modal`), but all three route to the same submission handler via three `slackApp.view()` registrations.

### D4: Type indicator visuals

**Decision:** Text emoji. `📄` desk research, `🎙` stakeholder, `📊` survey.

Slack-native, no asset hosting, consistent with the rest of Qori's modals. Image blocks deferred.

### D5: Out-of-scope pain points

- **Pain point 5 (iteration/append):** Filed for later. Variable store handles pool-append across runs, but document artifacts don't consolidate. This is a handler/variable-store concern, not a modal concern. The hub doesn't change this — running desk research twice still creates two artifacts.
- **Pain point 6 (next-step guidance):** Partially addressed by D2. Full guidance system (smart recommendations based on study lifecycle state) filed for post-launch if researchers request more context.

### D6: Discovery is optional but absence is surfaced

**Decision:** Cascade visibility principle — researchers and downstream consumers always know what informed any generated artifact.

Discovery is optional. Running `/qori-brief` without discovery produces a brief from researcher inputs alone. That's correct (follow-up studies, new users trying the system). But absence should be visible, not silent.

Three applications:

**a. Discovery hub visibility section** — already in scope (D1). Shows what exists before the researcher acts.

**b. Brief modal discovery indicator** — separate follow-on PR after the discovery hub ships. Soft signal at top of `/qori-brief` modal:
- When artifacts exist: `"📋 Discovery available: 2 artifacts will inform this brief"` (or the existing discovery checkbox section, enhanced with this framing)
- When no artifacts: `"_No discovery yet — brief will be generated from your inputs alone. Run /qori-discover first for stronger grounding._"` Information, not a gate.
- Must cohere with the existing discovery checkbox section in the brief modal — enhance, not duplicate.

**c. Generated artifact cascade-depth signal** — separate workstream (filed in backlog). Every rendered document shows what informed it in a "Generated from" block. Touches every cascade-emitting template's output structure. Not in this PR.

### Implementation notes

1. **Brief modal indicator is a follow-on, not this PR.** The discovery hub + 3 type modals are this PR. The brief modal indicator is `/qori-brief` work and ships separately after the discovery hub lands.
2. **Variable category mapping lives in code, not just spec.** Place `VARIABLE_CATEGORIES` in a shared registry file (`backend/src/helpers/cascadeVariableCategories.ts`), not inline in a modal builder. When new templates emit new variables, the mapping stays in sync.
3. **D2 guidance uses a fallback for unrecognized combinations.** The state machine covers the natural flow (desk → stakeholder → survey), but researchers can run types in any order. Unrecognized combinations fall back to: `"_Discovery in progress. Run /qori-brief when you're ready to start your study._"`

---

## Detailed block structure

### Hub modal (`discover_hub_modal`)

Opened by `/qori-discover` command handler via `views.open`.

```
┌─────────────────────────────────────────────────────────┐
│  Discovery research                          [Close]    │
├─────────────────────────────────────────────────────────┤
│  Pre-study research that informs your brief. Upload     │
│  documents and Qori synthesizes themes, barriers, and   │
│  recommendations.                                       │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  [D2 guidance: context block, varies by state]          │
│  e.g., "_Start with desk research — reports and         │
│  background docs build the foundation._"                │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  📄 *Desk research*                          [Start]    │
│  Reports, competitive analysis, background docs         │
│                                                         │
│  🎙 *Stakeholder synthesis*                  [Start]    │
│  Interview transcripts and stakeholder notes            │
│                                                         │
│  📊 *Survey synthesis*                       [Start]    │
│  Survey exports (CSV, Excel)                            │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│  *Your team's discovery so far*                         │
│                                                         │
│  📄 veteran-telehealth-barriers · May 15 ·              │
│     barriers, metrics, gaps                             │
│  🎙 claims-process-stakeholders · May 18 ·              │
│     constraints, priorities                             │
│  📊 post-launch-survey · May 20 ·                       │
│     themes, findings                                    │
│                                                         │
│  _These feed into /qori-brief automatically._           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**No `submit` property.** No `input` blocks in the hub — the action sections use `button` accessories. Close button only.

**Block inventory:**

| # | Block type | Block ID | Purpose |
|---|---|---|---|
| 1 | context | — | Intro copy |
| 2 | divider | — | — |
| 3 | context | `discovery_guidance_block` | D2 next-step guidance (dynamic, set by command handler) |
| 4 | divider | — | — |
| 5 | section + button | — | Desk research action (action_id: `discover_desk_research`) |
| 6 | section + button | — | Stakeholder synthesis action (action_id: `discover_stakeholder_synthesis`) |
| 7 | section + button | — | Survey synthesis action (action_id: `discover_survey_synthesis`) |
| 8 | divider | — | — |
| 9 | section | — | "Your team's discovery so far" header |
| 10+ | context | `discovery_artifacts_block` | Artifact list (dynamic, set by command handler) |

### Desk research modal (`discover_desk_research_modal`)

Opened by `discover_desk_research` action via `views.update` (replaces the hub).

```
┌─────────────────────────────────────────────────────────┐
│  Desk research                               [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📄 Upload reports, competitive analysis, or background  │
│  docs. Qori extracts barriers, metrics, and knowledge   │
│  gaps.                                                  │
│ ─────────────────────────────────────────────────────── │
│  What topic are you exploring?                          │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Veteran telehealth barriers │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name                              │
│                                                         │
│  What are these documents about?            (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Upload files                                           │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  PDF, Word, text, or markdown — up to 10 files          │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

**Field inventory:**

| # | Block ID | Label | Type | Required |
|---|----------|-------|------|----------|
| 1 | — | (context) | context | — |
| 2 | `topic_block` | What topic are you exploring? | plain_text_input | Yes |
| 3 | `description_block` | What are these documents about? | plain_text_input (multiline) | No |
| 4 | `file_upload_block` | Upload files | file_input | Yes |

`file_input` filetypes: `["pdf", "docx", "doc", "txt", "md"]`

### Stakeholder synthesis modal (`discover_stakeholder_modal`)

Same structure as desk research. Different context copy, same file types.

```
┌─────────────────────────────────────────────────────────┐
│  Stakeholder synthesis                       [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  🎙 Upload interview transcripts or stakeholder notes.   │
│  Qori extracts constraints, priorities, and alignment   │
│  gaps.                                                  │
│ ─────────────────────────────────────────────────────── │
│  What topic are you exploring?                          │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Claims process stakeholders │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name                              │
│                                                         │
│  What are these documents about?            (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Upload files                                           │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  PDF, Word, text, or markdown — up to 10 files          │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

`file_input` filetypes: `["pdf", "docx", "doc", "txt", "md"]`

### Survey synthesis modal (`discover_survey_modal`)

Different fields: adds survey name (required) and question focus. Different file types.

```
┌─────────────────────────────────────────────────────────┐
│  Survey synthesis                            [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📊 Upload survey exports. Qori identifies themes,       │
│  findings, and demographic patterns.                    │
│ ─────────────────────────────────────────────────────── │
│  What topic are you exploring?                          │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Post-launch user feedback   │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name                              │
│                                                         │
│  What's the survey called?                              │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Post-launch satisfaction    │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Which questions should Qori focus on?      (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Q5, Q8, open-ended         │                  │
│  │ responses                         │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Upload survey data                                     │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  CSV or Excel — up to 10 files                          │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

**Field inventory:**

| # | Block ID | Label | Type | Required |
|---|----------|-------|------|----------|
| 1 | — | (context) | context | — |
| 2 | `topic_block` | What topic are you exploring? | plain_text_input | Yes |
| 3 | `survey_name_block` | What's the survey called? | plain_text_input | **Yes** (required, not optional) |
| 4 | `question_focus_block` | Which questions should Qori focus on? | plain_text_input (multiline) | No |
| 5 | `file_upload_block` | Upload survey data | file_input | Yes |

`file_input` filetypes: `["csv", "xlsx", "xls"]`

---

## Handler architecture

### Command handler (modified)

```
/qori-discover
    ↓
discoverHandler()
    ├─ ack()
    ├─ loadDiscoveryArtifacts(team) → artifact list
    ├─ buildGuidanceBlock(artifacts) → D2 next-step suggestion
    ├─ buildArtifactBlocks(artifacts) → D1 visibility section
    ├─ Assemble hub modal with dynamic blocks
    └─ client.views.open(hubModal)
```

### Action handlers (new, 3 registrations)

```
discover_desk_research       → openDiscoverTypeModal('desk_research')
discover_stakeholder_synthesis → openDiscoverTypeModal('stakeholder_synthesis')
discover_survey_synthesis     → openDiscoverTypeModal('survey_synthesis')
```

Single factory function `openDiscoverTypeModal(type)` that:
1. Reads `channelId` from the hub's `private_metadata`
2. Selects the type-specific modal definition
3. Sets `private_metadata: { channelId, discoveryType: type }`
4. Calls `client.views.update()` (replaces hub with type-specific modal)

**Why `views.update` not `views.push`:** The hub has no `input` blocks and no submit — it's purely navigational. Pushing a modal on top would leave a dead hub underneath that the researcher could swipe back to. Updating replaces cleanly. Cancel on the type-specific modal closes everything.

### Submission handler (modified)

```
discover_desk_research_modal    ─┐
discover_stakeholder_modal      ─┼─→ handleDiscoverSubmission()
discover_survey_modal           ─┘
    ↓
    Read discoveryType from private_metadata (not from form select)
    Rest of handler unchanged — branches on type for:
      - Survey-specific fields (surveyName, questionFocus)
      - Stakeholder-specific fields (study_channel, researcher_contact)
      - Type-specific success message guidance (D2)
```

Three `slackApp.view()` registrations pointing to the same handler. The handler reads `discoveryType` from `private_metadata` instead of `values.discovery_type_block`.

### Event registrations (new state)

```typescript
// ─── Discovery ──────────────────────────────────────────────────

// Hub actions → type-specific modals
slackApp.action('discover_desk_research', openDiscoverTypeModal);
slackApp.action('discover_stakeholder_synthesis', openDiscoverTypeModal);
slackApp.action('discover_survey_synthesis', openDiscoverTypeModal);

// Type-specific modal submissions → shared handler
slackApp.view('discover_desk_research_modal', handleDiscoverSubmission);
slackApp.view('discover_stakeholder_modal', handleDiscoverSubmission);
slackApp.view('discover_survey_modal', handleDiscoverSubmission);
```

The old `slackApp.view('discover_modal', handleDiscoverSubmission)` is removed — the single-modal flow is replaced entirely.

---

## Variable category mapping (for D1 artifact display)

```typescript
const VARIABLE_CATEGORIES: Record<string, string> = {
  discovered_barriers: 'barriers',
  discovered_metrics: 'metrics',
  discovered_journeys: 'journeys',
  methodology_recommendations: 'method recs',
  knowledge_gaps: 'gaps',
  source_artifacts: 'sources',
  stakeholder_constraints: 'constraints',
  stakeholder_priorities: 'priorities',
  alignment_gaps: 'alignment gaps',
  stakeholder_questions_for_users: 'user questions',
  backstage_observations: 'backstage',
  system_failure_modes: 'failure modes',
  survey_themes: 'themes',
  survey_findings: 'findings',
  sample_demographics: 'demographics',
};
```

An artifact with variables `discovered_barriers`, `discovered_metrics`, `knowledge_gaps` displays as:
`📄 veteran-telehealth-barriers · May 15 · barriers, metrics, gaps`

---

## Implementation sequence

1. **Hub modal + command handler** — new `discoverHubModal.ts`, modify `discoverHandler.ts` to load artifacts and open hub. New action registrations. Delete old `discoverModal.ts`.
2. **Type-specific modals** — 3 new modal files (or 1 factory). Static definitions, type-appropriate file types and fields.
3. **Action handlers** — factory function `openDiscoverTypeModal` that reads type from action value, selects modal, calls `views.update`.
4. **Submission handler update** — read `discoveryType` from `private_metadata` instead of form values. Update success message with type-aware next-step guidance (D2).
5. **Discovery visibility helpers** — `buildGuidanceBlock()` and `buildArtifactBlocks()` functions using `loadDiscoveryArtifacts()`.

Each step builds on the previous. Steps 1-3 can be tested with the hub opening and type modals rendering. Step 4 makes submission work. Step 5 adds the visibility and guidance polish.

---

## Files to create/modify/delete

| Action | File | Purpose |
|---|---|---|
| **Create** | `backend/src/helpers/slack/ui/discoverHubModal.ts` | Hub modal definition |
| **Create** | `backend/src/helpers/slack/ui/discoverTypeModals.ts` | 3 type-specific modal definitions (or factory) |
| **Modify** | `backend/src/helpers/slack/commands/discoverHandler.ts` | Command handler opens hub, new action handler, submission reads from metadata |
| **Modify** | `backend/src/helpers/slack/events.ts` | 3 new action registrations, 3 new view registrations, remove old `discover_modal` registration |
| **Delete** | `backend/src/helpers/slack/ui/discoverModal.ts` | Replaced by hub + type-specific modals |

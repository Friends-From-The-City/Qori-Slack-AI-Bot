# Research Project Restructure — Phase 1 Spec

**Date:** 2026-05-21
**Status:** Phase 1 design spec, ready for review
**Approach:** Clean break, no production data preserved, no feature flags
**Prerequisites:** Four audit documents in `docs/audits/`, prebriefing in `docs/initiative-restructure-prebriefing.md`

This spec consolidates eight resolved design decisions, integrates findings from the four current-state audits, and defines the architecture for Phase 2 implementation.

---

## Resolved decisions

The eight decisions from the design conversation, recorded here as the foundation for the spec:

| # | Decision | Value |
|---|----------|-------|
| 1 | Primary container naming | **Project** |
| 2 | Data model relationship | **Project contains one or more Studies** (Option B) with strong single-study UX accommodation |
| 3 | Current-project concept | **Channel-anchored** with explicit override |
| 4 | /qori-start as explicit creation gate | **Yes** — replaces implicit container creation in /qori-brief |
| 5 | Folder structure | **Numbered prefixes** (00-discovery, 01-brief, etc.) |
| 6 | /qori-ask default scope | **Project** with explicit team-wide flag |
| 7 | Library promotion UX | **Manual** with clear surface |
| 8 | Migration approach | **Clean break** (no production data exists) |

---

## Architecture overview

### The new model in one sentence

A **project** is a research initiative; it contains **one or more studies**, and groups together all discovery, brief, plan, fieldwork, synthesis, and readout artifacts produced during that initiative. Cross-initiative knowledge sharing happens through an explicit **team library**.

### Spatial structure (GitHub)

```
{team}/
├── _library/                        # Team-promoted shared discovery
│   ├── discovery/
│   │   ├── desk-research-{topic}-{date}.md
│   │   ├── stakeholder-synthesis-{topic}-{date}.md
│   │   ├── survey-synthesis-{topic}-{date}.md
│   │   └── .variables/
│   └── README.md
│
└── {project-slug}/                  # One research project
    ├── README.md                    # Project dashboard (auto-generated)
    ├── 00-discovery/                # Project-scoped discovery
    │   ├── desk-research-{topic}-{date}.md
    │   ├── stakeholder-synthesis-{topic}-{date}.md
    │   ├── survey-synthesis-{topic}-{date}.md
    │   ├── imported-from-library/   # Library artifacts pulled in
    │   └── .variables/
    │
    └── {study-slug}/                # Study within project (typically one)
        ├── 01-brief/
        │   └── research-brief.md
        ├── 02-plan/
        │   ├── research-plan.md
        │   └── discussion-guide.md
        ├── 03-fieldwork/
        │   ├── participant-tracker.md
        │   ├── sessions/
        │   ├── transcripts/
        │   └── outreach/
        ├── 04-synthesis/
        │   ├── affinity-mapping.md
        │   ├── personas.md
        │   ├── jobs-to-be-done.md
        │   └── design-opportunities.md
        ├── 05-readouts/
        │   ├── research-readout.md
        │   ├── designer-readout.md
        │   ├── engineering-readout.md
        │   ├── accessibility-readout.md
        │   └── leadership-readout.md
        ├── 06-tickets/
        │   └── github-issues.md
        └── .variables/
```

### Why discovery sits at the project level, not the study level

Discovery informs the whole project. A single project might contain multiple studies all drawing from the same discovery foundation. Nesting discovery inside a study would scope it too narrowly.

Single-study projects (the common case): the study contains everything from brief through tickets; discovery lives one level up at the project root.

Multi-study projects: each study has its own 01-brief through 06-tickets; discovery at the project root serves all of them.

### Cascade flow with numbered prefixes

The numbered prefixes (00 through 06) make the cascade visible spatially:

- **00-discovery** → produces variables consumed by 01-brief
- **01-brief** → produces variables consumed by 02-plan, 04-synthesis, 05-readouts
- **02-plan** → produces the execution roadmap consumed by 03-fieldwork
- **03-fieldwork** → produces session summaries consumed by 04-synthesis
- **04-synthesis** → produces personas, findings, JTBD consumed by 05-readouts
- **05-readouts** → produces communications and tickets in 06-tickets

A federal demo can walk this sequence visually: 00 to 06, beginning to end, with provenance at every step.

---

## Data model

### New tables

**`projects` table** (new primary container)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| name | STRING | Display name |
| slug | STRING UNIQUE | URL-safe identifier, used in folder paths |
| description | TEXT | Project overview |
| status | STRING | 'active', 'completed', 'archived' |
| created_by | STRING | Slack user ID |
| channel_id | STRING | Bound Slack channel (one-to-one) |
| team_slug | STRING | For multi-tenant scoping |
| created_at | DATE | |
| updated_at | DATE | |

**`research_studies` table** (modified — becomes child of project)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Unchanged |
| project_id | INTEGER FK NOT NULL | **NEW** — required parent |
| name | STRING | Display name (e.g., "Mobile navigation primary study") |
| slug | STRING | URL-safe within project (e.g., "mobile-nav") |
| path | STRING | `{project-slug}/{study-slug}` — derived |
| (existing columns) | ... | All other columns unchanged |

### Modified tables (drop denormalization)

**`study_variables`:** Drop `study_name` STRING column. Add `project_id` INTEGER FK NOT NULL, `study_id` INTEGER FK NULL (null for project-scoped variables like discovery).

**`created_issues`:** Drop `study_name` STRING. Add `study_id` INTEGER FK NOT NULL.

**`study_status`:** Drop `study_name` STRING. Add `study_id` INTEGER FK NOT NULL.

### Modified tables (add project context)

**`slack_user_state`:** Add `active_project_id` INTEGER FK NULL. Keep `active_study_id` (which study within the active project).

**`channel_config`:** Add `project_id` INTEGER FK NULL. The relationship is one channel → one project; some channels may not be project-bound.

### Dropped columns

**`study_participants.contact_details`:** Dead PII column, never used. Dropped during restructure.

### Cascade variable scope model

The `study_variables` table now supports two scopes:

| Scope | project_id | study_id | Example |
|-------|------------|----------|---------|
| Project-scoped | required | null | `discovered_barriers` from desk_research |
| Study-scoped | required | required | `research_objectives` from research_brief |

Discovery emits project-scoped variables. Brief, plan, synthesis, readout emit study-scoped variables.

Cross-study consumption within a project: study A's session summaries can be read by study B's synthesis if it's the same project and the team chooses to pull from both. This unlocks multi-study analysis without changing the data model.

### What goes away

- Synthetic study IDs like `discovery:{team}:{type}` — no longer needed; discovery has real project_id
- `study_name` string foreign keys in three tables — replaced with real FKs
- The conceptual confusion of "team-scoped discovery used by study-scoped briefs" — discovery is project-scoped, library is team-scoped, the bridge is explicit

---

## Channel-anchored project context

### The current-project concept

When a researcher runs any slash command, the system needs to know which project they mean. Channel-anchoring is the answer.

### How it works

1. **Project channels:** Each project has a bound Slack channel. The binding is one-to-one.
2. **Command in project channel:** Operates on that project automatically. No selector needed.
3. **Command in non-project channel** (general, DM, or unbound channel): Either prompts for project selection (if multiple projects accessible) or operates on the user's `active_project_id` from `slack_user_state`.
4. **Explicit override:** All commands accept a `project:` argument that overrides channel-binding.

### Channel binding lifecycle

**At project creation:**
- `/qori-start` flow asks: "Create new channel #project-slug?" or "Bind to existing channel?"
- Default: create new channel, invite the creator
- Channel binding stored in `projects.channel_id` and `channel_config.project_id`

**At channel archive/delete:**
- Project is *not* automatically archived (decoupled lifecycle)
- Channel reference becomes orphaned (channel_id still in `projects` but channel doesn't exist)
- Researcher can rebind in `/qori-fieldwork` settings

**At project archive:**
- Channel is *not* automatically archived (researcher's choice)
- Project status → 'archived', commands gracefully refuse

### DM behavior

When a researcher DMs Qori or runs a command in an unbound channel:
- If they have `active_project_id` set: operate on that project
- Otherwise: prompt to pick from their accessible projects
- Setting `active_project_id` is implicit (last command run sets it) or explicit (`/qori-fieldwork` lets them switch)

### What changes vs today

Today: `active_study_id` exists in `slack_user_state`. Channel→project binding doesn't exist. Most modals include a study selector.

After: Channel→project binding is primary. `active_project_id` is the fallback. Most modals drop the project selector (channel implies it) and only need study selector if the project has multiple studies.

---

## Slash command vocabulary

The full command set in the new model. Aggregates audits and design decisions.

### Commands in the new model

| Command | Purpose | Scope | Notes |
|---------|---------|-------|-------|
| `/qori-start` | Create new project, open "what's next" modal | Creates project | **Revived** — explicit creation gate |
| `/qori-discover` | Run discovery within current project | Project | Was team-scoped, now project-scoped with library import option |
| `/qori-brief` | Create/edit brief within current project | Project | **No longer creates containers** — project must exist |
| `/qori-plan` | Create/edit plan within current study | Study | Mostly unchanged |
| `/qori-analyze` | Upload session materials, generate summaries | Study | Unchanged |
| `/qori-synthesis` | Generate synthesis artifacts | Study | Unchanged |
| `/qori-report` | Generate readouts | Study | Unchanged |
| `/qori-fieldwork` | Status dashboard + 5 sub-actions | Project/Study | **Major refactor** — see Fieldwork section |
| `/qori-tickets` | Generate GitHub issues | Study | Unchanged |
| `/qori-ask` | Free-text query | Project (default) + flags for team-wide / library-only | **Reshaped** — see /qori-ask section |
| `/qori-library` | Browse/promote/import library discovery | Team | **New** |
| `/qori-learn` | Learning resources | Global | Unchanged |
| `/qori-repo` | Repo config | Global | Unchanged |
| `/qori-sync` | Sync repo state | Global | Unchanged |
| `/qori-delete` | Delete project/study | Project/Study | Updated for project semantics |

### Commands removed or consolidated

- `/ask-study` — removed (replaced by `/qori-ask project:` flag)
- `/run-template` — removed (developer-only, not needed in new model)

### Command count

16 commands today → 13 commands in the new model. Two removed (`/ask-study`, `/run-template`), one new (`/qori-library`). The previous /qori-fieldwork consolidation (5 commands → 1) stays.

### `/qori-start` flow

The new entry point. Replaces the implicit container-creation that /qori-brief does today.

**Flow:**

1. User runs `/qori-start`
2. Modal opens: "What are you researching?"
   - Project name input
   - Optional description
   - "Create dedicated Slack channel?" toggle (default on)
3. On submit:
   - Creates `projects` row
   - Creates Slack channel (if toggled) and binds it
   - Posts welcome message in channel
   - Opens "what's next" modal
4. "What's next" modal offers three paths:
   - "Run discovery first" → opens /qori-discover hub within new project
   - "Skip to brief" → opens /qori-brief within new project
   - "Import from team library" → opens /qori-library import flow

### /qori-brief behavior change

**Today:** /qori-brief creates a study record as a side effect. The researcher names the study, fills the brief, and the study folder gets created on submit.

**After:** /qori-brief operates on an existing project. If no project context (no channel binding, no active_project_id), it prompts to run /qori-start first. The brief is the *first artifact* of the study, not the *creator* of the container.

This is the most behaviorally significant change to existing flows. Worth flagging in researcher onboarding when launch happens.

### Multi-study project UX

For single-study projects (the common case):
- /qori-plan, /qori-analyze, /qori-synthesis operate on the project's single study without prompting
- Researcher experience: as if project and study are one thing

For multi-study projects:
- These commands prompt: "Which study?" with the project's studies as options
- Adding a second study: explicit `/qori-fieldwork` action ("Add another study to this project")

The data model supports multi-study from day one. The UX defaults to single-study and reveals hierarchy only when researchers opt in.

---

## /qori-fieldwork in the new model

### Current state (from audit)

Consolidated dashboard for 5 sub-actions: add participant, update status, observe, outreach, upload notes. Heavy private_metadata threading. Button values pack JSON. Study selector pattern is inconsistent across sub-modals.

### Changes in the new model

**Scope shift:**
- Operates on current project (channel-anchored)
- If project has multiple studies, study selector appears at the top of the dashboard
- Otherwise, study is implicit

**Architecture cleanup (taking advantage of restructure):**

The audit found significant pattern issues we should clean up rather than perpetuate:

1. **Replace JSON-packed button values with simple action IDs + database lookups.** Button `value` carries study/project ID only; handlers fetch full context server-side.
2. **Standardize study dropdown injection.** One pattern across all sub-modals, defined in a shared builder.
3. **Type the WebClient parameter in `refreshDashboardAfterAction`.** Removes the surviving `any` from the TypeScript migration.
4. **Make parent refresh errors visible.** Today they're silent ("non-fatal"). After: log the error and DM the user with "Dashboard may be stale — run /qori-fieldwork to refresh." Notifications stay in DM, per the cross-cutting notification standard (no separate ops channel, no third-party error monitoring).

**New affordances in the new model:**

- **Project switcher** at the top: shows current project, dropdown to switch (limited to projects user has access to)
- **Add another study** action: explicitly creates a second study within the project (the common case stays single-study, but the affordance exists)
- **Project archive/complete** action: marks project status, removes from active project list

### Block structure (sketch)

```
┌─────────────────────────────────────────────────────────┐
│  Project: VA Mobile Navigation 2026          [Switch]   │
├─────────────────────────────────────────────────────────┤
│  Last updated: 2026-05-21 14:32                          │
│                                                          │
│  📂 Study: Primary research                              │
│     (or [Select study ▾] if multiple)                   │
│                                                          │
│  ─────────────────────────────────────────────────       │
│                                                          │
│  📊 Outreach              4 sent, 6 pending  [Open]      │
│  👥 Participants          8 of 8 confirmed   [Open]      │
│  👁  Observers             3 of 5 assigned    [Open]      │
│  📝 Notes & transcripts   2 uploaded         [Open]      │
│  📅 Status                Fieldwork in progress           │
│                                                          │
│  ─────────────────────────────────────────────────       │
│                                                          │
│  [Add another study]  [Complete project]                 │
└─────────────────────────────────────────────────────────┘
```

---

## Outreach in the new model

### Current state (from audit)

8 submission handlers, 10 modal files, 1 YAML template. Produces participant_id and demographics_info cascade variables. Heavy PII surface area.

### Changes in the new model

**Scope:**
- Outreach is study-scoped (participants belong to a specific study)
- Compensation flows from the study's budget
- Participant records carry `study_id` FK (already do)

**PII findings to address during restructure:**

1. **`contact_details` column dropped.** Dead PII capacity removed during schema migration.
2. **`notes_field` content validation pattern.** Add a soft warning in the participant notes modal: "Don't paste PII (full name, email, phone) — use participant alias instead." Not enforced (researchers sometimes have legitimate need to capture context), but visible.
3. **`demographics_info` re-identification risk documented.** Add to security audit scope (filed for federal go-to-market) but don't change schema. The risk is inherent to demographic capture; mitigation is access control, not data avoidance.

**Cascade variable handling:**

- `participant_id` and `demographics_info` continue to be study-scoped (correct — participants belong to studies)
- These become consumable by project-level synthesis (multi-study projects can analyze participants across their studies)

**Compensation flow improvements (filed but not blocking):**

- Per-participant compensation override (deferred feature, not restructure-blocking)
- Compensation tracking (payment status) (deferred, not restructure-blocking)

### What stays the same

- 8 submission handlers, 10 modals — structurally unchanged
- YAML template path updates (`02-participants/outreach/` → `03-fieldwork/outreach/` to align with new numbered prefixes)
- Status enum lifecycle unchanged

---

## Notifications policy

All Qori notifications go through DMs. No separate ops channels, no third-party error monitoring services, no channel posts for actionable items.

This is a cross-cutting standard the restructure formalizes:

- **Success notifications** (artifact generated, action completed): DM to the user who triggered the action
- **Error notifications** (validation failures, generation errors, cascade contract errors): DM to the user
- **Approval requests** (brief approval, plan approval): DM to the approver
- **System errors** (dashboard refresh failed, generation timeout): DM to the user with a recovery action
- **Channel posts**: only for shared artifacts (the brief landed in the project channel, the readout is available) — informational, not actionable

The previously-filed notification workstream (approval flow notifications, generic error notifications, channel_not_found error handling, cross-cutting notification standards) folds into the restructure implementation. All notification routing changes happen in the new model from day one.

This also clarifies what we're *not* doing: no Sentry or third-party error monitoring integration as part of this restructure. Server-side errors log to Railway's standard logging. User-facing errors DM the user. If observability needs grow later (real production usage, multiple teams), error monitoring becomes a separate workstream.

---

## /qori-ask in the new model

### Current state (inferred from architecture audit + Lapedra's flag)

Open to all users including stakeholders. Free-text queries. Implicitly team-wide scope via `searchVariablesAcrossStudies()`. Per-study access control filed as deferred.

### Changes in the new model

**Default scope: project (channel-anchored).**

Asked in #va-mobile-nav-2026: scopes to that project's cascade variables. Returns answers drawing from the project's discovery, brief, sessions, synthesis, readouts.

**Explicit scope flags:**

| Flag | Behavior |
|------|----------|
| (default) | Current project |
| `/qori-ask team` | Across all projects user has access to |
| `/qori-ask library` | Team library only |
| `/qori-ask project:other-slug` | Specified project (with permission) |

**Provenance always shown:**

Every answer cites sources. Sources are clickable, point to artifact paths in the project folder. The "decision-supporting, not decision-making" framing holds because evidence is always present.

### Why this matters more in the new model

The project folder structure means sources have a natural home. Citing `02-plan/research-plan.md` is a real file path the asker can click to verify. Citing `04-synthesis/personas.md` traces back through the cascade chain. The patent story becomes interactive.

### Stakeholder access

Stakeholders in a project's Slack channel can ask questions, get answers scoped to that project's evidence. Sources are inspectable. Cross-project queries require explicit intent (`team` flag), which protects sensitive data from accidental exposure.

### HITL framing

`/qori-ask` becomes more defensibly decision-supporting because:
- Answers cite sources (not standalone confident assertions)
- Sources are in the same folder as the question
- The asker can verify before acting
- Cross-project queries require explicit intent

This matters for the NIST AI RMF compliance crosswalk (HITL design workstream).

---

## Library promotion model

### Concept

Default: discovery is project-scoped (lives in the project folder).

Promotion: researchers can promote discovery to `_library/` for cross-project reuse.

Import: new projects can pull library discovery into their `00-discovery/imported-from-library/` folder.

This matches design system / component library patterns — local by default, global with intent.

### Promotion UX

**Where it happens:**

In `/qori-fieldwork` (or eventually a `/qori-library` command), a "Discovery" panel lists the project's discovery artifacts. Each has a "Promote to library" action.

**What promotion does:**

1. Copies the artifact file from `{project}/00-discovery/` to `{team}/_library/discovery/`
2. Copies the cascade variables to library-scoped storage
3. Marks the project's discovery as "promoted" (visible badge)
4. The library version is the canonical source; the project version becomes a snapshot

**What it doesn't do:**

- Doesn't automatically sync the library version back to projects that imported it (one-way promotion)
- Doesn't remove the project version (researcher might still reference it)

### Import UX

**Where it happens:**

In `/qori-start` "what's next" modal ("Import from team library" path), or later via `/qori-discover` hub which gains an "Import library" action.

**What import does:**

1. Lists library discovery artifacts with metadata (date promoted, by whom, variable categories)
2. Researcher selects which to import
3. Copies the file to `{project}/00-discovery/imported-from-library/`
4. Cascade variables become available for the project's brief and downstream

**What it doesn't do:**

- Doesn't symlink (imports are real copies — projects can be self-contained for portability)
- Doesn't automatically update if the library artifact is updated later (one-way snapshot)

### Library structure

```
{team}/_library/
├── discovery/
│   ├── desk-research-{topic}-{date}.md
│   ├── stakeholder-synthesis-{topic}-{date}.md
│   ├── survey-synthesis-{topic}-{date}.md
│   └── .variables/
│       └── library-discovery-variables.json
└── README.md   # What's in the library, how it's used
```

The library is intentionally flat. No nested folders, no projects inside library. The library is a curated knowledge store, separate from the active project workflow.

### Why promotion is manual, not automatic

Automatic promotion (every discovery becomes library content) would defeat the purpose. The library is curated knowledge — discovery that proved valuable across projects, that the team explicitly decided is worth preserving.

Manual promotion forces the team to make the value judgment. The library stays small and high-quality. Cross-project queries return signal, not noise.

---

## Test coverage as restructure-blocking work

The audit identified critical test gaps. The Phase 1 spec treats these as a precondition for cutover, not a follow-on workstream.

### Test work required before cutover

**1. Cascade variable store tests (7 tests):**
- Read/write roundtrip for study-scoped variables
- Read/write roundtrip for project-scoped variables
- Pool merge strategy: replace
- Pool merge strategy: append
- Pool merge strategy: append_or_replace_per_participant
- Scope isolation: study variables don't leak into project queries
- Postgres → GitHub fallback path

**2. YAML template tests (5 representative templates):**
- `research_brief`: cascade emission, no upstream consumption
- `research_plan`: cascade consumption from brief, emission to plan variables
- `session_summary`: per-participant variables, pool merge
- `research_readout`: multi-source consumption, ticket generation
- `desk_research`: project-scoped variable emission

Each test provides known input data + mocked LLM responses, asserts output Markdown structure and cascade variables emitted.

**3. Modal callback flow tests (3 representative chains):**
- Brief entry → submission → result (single modal, cascade emission, GitHub write)
- Fieldwork dashboard → add participant → refresh (multi-modal, rootViewId threading, parent refresh)
- Plan entry → submission → approval (multi-modal, approval state machine)

Each test mocks Slack client, simulates view submissions with realistic state, asserts private_metadata preserved through chain.

**4. Pattern enforcement test additions:**
- No `study_name` string lookups in services (grep)
- No `study_name` in handler metadata (grep)
- No `|| study_name` fallback expressions (grep)
- No `if (project_id)` conditional paths (grep)
- All handlers receive project context (positive assertion)

### Effort estimate

Probably 2 weeks of focused test-writing work. Cascade store tests are the most involved (database fixtures, scope isolation, pool merge edge cases). Template tests need LLM mock harness setup (one-time cost, reusable for other templates later). Modal flow tests build on existing partial Slack client mocking.

### Why this gates cutover

The cascade store is the backbone of cascade chaining. The schema changes meaningfully in the restructure (drop `study_name`, add `project_id` + `study_id` FKs). Without tests, we'd be making the largest change to the most critical component with zero safety net.

Templates produce all artifacts researchers see. Modal flows are the entire UX. Untested changes in any of these surfaces invite silent regressions.

### Sequencing implication

Phase 2 implementation has two parallel tracks:

- **Track A:** Test coverage work (2 weeks)
- **Track B:** New code in feature branch (project model, project-aware handlers, updated YAML templates, updated modals) — happens concurrent with Track A

Cutover can't happen until Track A is green AND Track B is merged-ready.

---

## Cutover sequence

The order of operations for the clean-break cutover.

### Phase 2.1: Preparation (1-2 weeks)

Concurrent work:

- Test coverage work (Track A above)
- New code in feature branch (Track B above)
- Documentation updates (modal design principles, cascade architecture doc deferred until after cutover so it reflects final state)

Exit criteria:
- All Track A tests green in CI
- Track B feature branch reviewed and merge-ready
- Pattern enforcement tests added and passing

### Phase 2.2: Maintenance window (single deploy)

The cutover itself. Worth being explicit about Slack app behavior during the window.

1. **Announce maintenance** — post in #qori-internal: "Maintenance in 10 minutes, ~20 min duration"
2. **Pause Slack app** — set Railway env var or deploy a maintenance handler that responds "Qori is maintenance, back shortly" to all commands
3. **Wipe state:**
   - TRUNCATE all relevant tables (research_studies CASCADE, study_variables, study_status, created_issues, slack_user_state, channel_config)
   - Delete all study folders and discovery folders from GitHub content repo
4. **Run schema migrations:**
   - Create `projects` table
   - Add FKs to research_studies, study_variables, created_issues, study_status
   - Add `active_project_id` to slack_user_state
   - Add `project_id` to channel_config
   - Drop `study_name` from study_variables, created_issues, study_status
   - Drop `contact_details` from study_participants
5. **Deploy new code** — merge feature branch to main, Railway auto-deploys
6. **Verification:**
   - Smoke test: `/qori-start` creates a project
   - Smoke test: `/qori-discover` runs against new project
   - Smoke test: `/qori-brief` creates brief in project context
   - Smoke test: cascade variable emission and consumption works
   - Smoke test: `/qori-fieldwork` dashboard renders
7. **Resume Slack app** — remove maintenance handler
8. **Announce complete** — post in #qori-internal

Estimated window: 20-30 minutes. Worth a Sunday or weekday evening when no one is using Qori.

### Phase 2.3: Post-cutover (1 day)

- Monitor Railway logs for unexpected errors
- Re-run smoke tests after each major workflow (one full end-to-end run: project creation → discovery → brief → plan → analyze → synthesis → readout)
- If issues surface: redeploy previous commit (rollback path), investigate, fix forward
- Update internal documentation (`README.md`, onboarding docs) to reflect new model

### Phase 3: Documentation (post-cutover)

After cutover succeeds:
- Update `docs/cascade-architecture.md` with the GET pattern in the new model
- Update `docs/modal-design-principles.md` with project context patterns
- Write `docs/project-architecture.md` describing project as primary container
- Update federal demo walkthrough using the new model
- Refresh ADR archive with project restructure ADR

---

## What changes for existing workstreams

### Modal cascade-driven UX

**Continues but pauses synthesis modals.** Plan, discussion guide, discovery hub, brief modal are done. Synthesis modals (affinity_mapping, persona_generator, jobs_to_be_done, design_opportunities) get cascade-UX work *after* the restructure — they'd re-anchor to project context anyway, so doing them now means doing them twice.

### Cascade visibility

**Surface 1 (discovery hub) done.** **Surface 2 (brief modal indicator) done.** **Surface 3 (generated artifact cascade-depth signal) waits for restructure** — the signal will reference project-scoped sources rather than team-scoped discovery, so the design changes meaningfully.

### Cascade architecture documentation

**Defer until after restructure.** Documentation should reflect the final architecture, not an intermediate state.

### Modal visual design pass

**Defer until after restructure.** Visual work applies to final modal structure. Doing it now means doing it twice.

### Notifications

**Folds into restructure implementation.** The cross-cutting notification standard (all notifications via DM, no ops channels, no third-party error monitoring) is documented in the Notifications policy section above. The previously-filed items (approval flow notifications, channel_not_found fallback, generic error notifications) all implement in the new model from day one.

### HITL oversight design

**Wait until after restructure.** Approval gates anchor on project-level decisions in the new model. Designing HITL before restructure means designing for the wrong unit.

### Security audit

**Wait until after restructure.** Audit reflects final data model. Doing it now means re-auditing later.

### Federal go-to-market

**Strengthened by restructure.** The folder structure becomes the demo. Sequence as final workstream after all prerequisites land.

---

## Open implementation questions (deferred to Phase 2)

Questions that don't need design decisions but will surface during implementation:

1. Project slug uniqueness scope — per team or globally? Default per team (most teams won't have conflicts).
2. Project name vs slug separation — name for display, slug for paths. Auto-generate slug from name, allow override.
3. Channel naming convention — `#project-{slug}` default, allow custom.
4. README.md auto-generation — at project creation, after every major artifact? On every command? Probably on artifact creation, not on every command (too noisy).
5. Multi-study UI in /qori-fieldwork — collapse vs always-show study selector. Default: collapsed if one study, expanded if multiple.
6. Library promotion permissions — who can promote? Initially: anyone in the team. Later: configurable.
7. Project deletion semantics — soft delete (status='deleted') or hard delete? Soft delete for safety, hard delete option for testing.

These are real questions but they don't block the Phase 1 spec from being complete. CC decides during implementation, surfaces architectural choices for review.

---

## Phase 1 spec verification

Before approval for Phase 2 implementation, verify the spec addresses:

- [x] All eight resolved design decisions
- [x] Data model (new tables, modified tables, dropped columns)
- [x] Cascade variable scope model (project-scoped vs study-scoped)
- [x] Channel-anchored project context
- [x] Full slash command vocabulary in new model
- [x] /qori-start flow
- [x] /qori-fieldwork in new model with audit findings addressed
- [x] Outreach in new model with PII findings addressed
- [x] /qori-ask in new model with HITL framing
- [x] Library promotion model
- [x] Test coverage as restructure-blocking work
- [x] Cutover sequence
- [x] Impact on existing workstreams

---

## Decision authority

This spec captures the Phase 1 design. Lapedra reviews and approves before Phase 2 implementation begins. Major architectural decisions captured as ADRs once Phase 2 is in flight.

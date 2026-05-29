# Clean-Break Execution Risk Audit

**Date:** 2026-05-21
**Purpose:** Pre-design risk assessment for project restructure
**Approach:** Clean break — no production data to preserve, no dual-write migration

---

## Context

All current studies, discovery artifacts, and cascade variables are Lapedra's disposable test data. A clean break is appropriate:

- Wipe state
- Deploy new schema
- Ship new code

No feature flags. No `PROJECTS_ENABLED` env var. No 5-phase migration. Single model from day one.

---

## 1. What Needs to Be Deleted

### 1.1 Database Tables (Truncate or Drop Rows)

| Table | Action | Notes |
|-------|--------|-------|
| `research_studies` | TRUNCATE CASCADE | Cascades to plans, notes, summaries, participants, observers, roles |
| `study_variables` | TRUNCATE | All cascade variables (study and discovery scoped) |
| `study_status` | TRUNCATE | Approval workflow state |
| `created_issues` | TRUNCATE | GitHub issue audit trail |
| `slack_user_state` | TRUNCATE | Active study references will be invalid |
| `channel_config` | TRUNCATE | Channel→repo mappings (rebuild as channel→project) |

**Tables to preserve (schema only, rows cleared):**
- All of the above — empty slate

**Tables unchanged:**
- `users` — Legacy, unused, irrelevant to restructure

### 1.2 GitHub Folders (Delete from Content Repo)

| Path | Action | Notes |
|------|--------|-------|
| `*/` (all study folders) | Delete | All test studies at root level |
| `*/_discovery/` | Delete | All discovery artifacts |
| `.variables/` in any path | Delete | Cascade variable JSON artifacts |

**Preserve:**
- `config/prompts/` — YAML templates (will be modified, not deleted)
- `config/templates/` — Study scaffold templates (may need project wrapper)

### 1.3 Specific Deletions

**Dead PII column:**
- `study_participants.contact_details` — Column exists but unused. DROP COLUMN during restructure, don't preserve dead PII capacity.

**Denormalized string columns (replaced by FK):**
- `study_variables.study_name` — Replace with `study_id` FK + `project_id` FK
- `created_issues.study_name` — Replace with `study_id` FK
- `study_status.study_name` — Replace with `study_id` FK

---

## 2. What Can Be Reset

### 2.1 Cascade Variable Store

**Current state:** `study_variables` table with `study_name` string key, Postgres authoritative, GitHub JSON as artifact.

**Reset action:**
- TRUNCATE `study_variables`
- Delete all `.variables/` folders from GitHub
- New schema: `project_id` FK, `study_id` FK, no `study_name` column

**No migration needed:** Empty table, new schema from day one.

### 2.2 Study Records

**Current state:** `research_studies` table with string-based references elsewhere.

**Reset action:**
- TRUNCATE CASCADE (clears all dependent tables)
- New schema: `project_id` FK (NOT NULL)
- All new studies created under a project

### 2.3 Slack User State

**Current state:** `slack_user_state` with `active_study_id` FK.

**Reset action:**
- TRUNCATE (clears active study references)
- New schema: Add `active_project_id` FK
- Users re-select project/study on first use

### 2.4 Channel Config

**Current state:** Maps channel → repo/folder.

**Reset action:**
- TRUNCATE (clears all mappings)
- New schema: Add `project_id` FK
- Channels re-configured on first use

---

## 3. What Can't Be Reset

### 3.1 Template Files (Must Be Modified)

**YAML templates (25 files in `config/prompts/`):**
- `output_options.path` patterns assume `{study}/primary-research/...`
- Must be updated to `{{project}}/{{study}}/primary-research/...`
- `consumes` and `emits` specs reference study-scoped variables
- Discovery templates (`desk_research`, `stakeholder_synthesis`, `survey_synthesis`) reference team-scoped paths

**Study scaffold templates (`config/templates/`):**
- May need project-level README or structure
- Current templates are study-scoped

### 3.2 Handler Code (Must Be Modified)

**65+ handlers must be updated:**
- Extract `projectId` from private_metadata (not just `studyName`)
- Pass project context to `processYamlTemplate()`
- Update cascade variable read/write calls
- Update GitHub path construction
- Update result messaging (include project context)

**High-risk handlers (most complex metadata threading):**
- `fieldworkHandler.ts` — 5+ serialization points, rootViewId threading
- `briefHandler.ts` — Discovery variable injection, cascade emission
- `planHandler.ts` — Cascade consumption from brief
- `discoverHandler.ts` — Team-scoped discovery paths

### 3.3 Modal Builders (Must Be Modified)

**Modal builders must be updated:**
- Add project context to private_metadata
- Add project selector where study selector exists
- Update button values (currently JSON-packed with studyId/studyName)

**High-risk modals:**
- `fieldworkDashboardModal.ts` — Complex metadata, multiple action buttons
- `studySetupModal.ts` — Entry point for plan creation
- `briefEntryModal.ts` — Entry point for brief creation
- All outreach modals — Participant dropdown injection patterns

### 3.4 Integration Tests (Must Be Extended)

**Existing tests (must pass post-restructure):**
- `compensation-flow.test.ts` — DECIMAL coercion
- `outreach-flow.test.ts` — Status transitions
- `pattern-enforcement.test.ts` — Type patterns

**These test against models and services, not handlers. They'll need updates to use project-scoped fixtures.**

### 3.5 Services (Must Be Modified)

**Services with study_name dependencies:**
- `studyVariables.ts` — Primary cascade store, `study_name` throughout
- `research_study.service.ts` — Study CRUD, add project association
- `study_participant.service.ts` — Participant queries by study
- `study_status.service.ts` — Approval by study_name

---

## 4. Order of Operations for Cutover

### Phase 1: Pre-Cutover (Before Any Wipe)

**Test coverage gates (must complete before proceeding):**
1. Cascade variable store tests (see Section 6)
2. Representative YAML template tests (see Section 6)
3. Modal callback flow tests (see Section 6)

**Code preparation (can happen in parallel):**
1. Write new Project model
2. Write project-aware services
3. Write project-aware handlers (feature branch)
4. Update YAML templates (feature branch)
5. Update modal builders (feature branch)

### Phase 2: Wipe

**Database (Railway Postgres):**
```sql
TRUNCATE research_studies CASCADE;
TRUNCATE study_variables;
TRUNCATE study_status;
TRUNCATE created_issues;
TRUNCATE slack_user_state;
TRUNCATE channel_config;
```

**GitHub (Content Repo):**
- Delete all study folders
- Delete all `_discovery/` folders
- Delete all `.variables/` folders

### Phase 3: Migrate Schema

**Run new migrations:**
1. Create `projects` table
2. Add `project_id` FK to `research_studies` (NOT NULL)
3. Add `project_id` FK to `study_variables` (NOT NULL)
4. Add `study_id` FK to `study_variables` (NOT NULL, replaces `study_name`)
5. Add `study_id` FK to `created_issues` (NOT NULL, replaces `study_name`)
6. Add `study_id` FK to `study_status` (NOT NULL, replaces `study_name`)
7. Add `active_project_id` FK to `slack_user_state`
8. Add `project_id` FK to `channel_config`
9. DROP `study_name` columns (denormalized)
10. DROP `contact_details` column from `study_participants` (dead PII)

### Phase 4: Deploy New Code

**Merge feature branch with:**
- Project model + service
- Updated handlers (project-aware)
- Updated modal builders (project context)
- Updated YAML templates (project paths)
- Updated cascade store (project + study FK)

**Railway auto-deploys on push to main.**

### Phase 5: Verify

**Manual smoke test:**
1. Create project via new flow
2. Create study under project
3. Create brief → verify cascade emission
4. Create plan → verify cascade consumption
5. Run fieldwork dashboard → verify metadata threading
6. Generate readout → verify output path

**Automated tests:**
- All existing tests pass
- New project-scoped tests pass

---

## 5. Test Coverage Gaps (Restructure-Blocking)

**Current coverage is severely thin. These gaps must be closed before cutover begins.**

### 5.1 Cascade Variable Store (0% coverage)

**Required tests:**

| Test | Purpose |
|------|---------|
| Read/write roundtrip | `writeStudyVariables()` → `readStudyVariables()` returns same data |
| Pool merge: replace | New values replace old |
| Pool merge: append | New values added to existing |
| Pool merge: append_or_replace_per_participant | Per-participant atomic replace |
| Scope: study | Study-scoped variables isolated |
| Scope: discovery | Discovery-scoped variables isolated |
| Postgres fallback | If Postgres unavailable, GitHub fallback works |

**Why blocking:** Cascade store is the backbone of template chaining. Untested changes here break all downstream flows.

### 5.2 YAML Template Rendering (1/27 coverage)

**Required tests (5 representative templates):**

| Template | Why Representative |
|----------|-------------------|
| `research_brief` | First in chain, emits to cascade |
| `research_plan` | Consumes from brief, emits to cascade |
| `session_summary` | Per-participant variables, pool merge |
| `research_readout` | Consumes multiple upstream, generates tickets |
| `desk_research` | Discovery scope, team-level variables |

**Test structure:**
- Mock LLM responses
- Provide known input data
- Assert output Markdown matches expected
- Assert cascade variables emitted correctly

**Why blocking:** Templates are the product. Untested changes here produce wrong output.

### 5.3 Modal Callback Flows (0% coverage)

**Required tests (3 representative chains):**

| Flow | Why Representative |
|------|-------------------|
| Brief entry → submission → result | Single modal, cascade emission |
| Fieldwork dashboard → add participant → refresh | Multi-modal, rootViewId threading |
| Plan entry → submission → approval flow | Multi-modal, approval state |

**Test structure:**
- Mock Slack client
- Simulate modal submission with known view state
- Assert private_metadata preserved through chain
- Assert correct view updates called

**Why blocking:** Modal flows are the UX. Untested changes here break user interactions.

### 5.4 Test Infrastructure Needed

**For cascade store tests:**
- Test database fixtures (Postgres, already exists for integration tests)
- Clean state between tests (TRUNCATE)

**For template tests:**
- LLM mock harness (return canned responses for known prompts)
- Handlebars rendering assertion helpers
- Cascade variable assertion helpers

**For modal flow tests:**
- Slack client mock (already partially exists)
- View state builders (generate realistic `view.state.values`)
- private_metadata assertion helpers

---

## 6. Compatibility Code Risk

**Clean break means no `if (project_id)` checks. The restructure must not leave fallback paths.**

### 6.1 High-Risk Areas for Accidental Compatibility Code

| Location | Risk | Pattern to Avoid |
|----------|------|------------------|
| `studyVariables.ts` | HIGH | `if (study_name) { /* old path */ } else { /* new path */ }` |
| Handler metadata extraction | HIGH | `const studyId = meta.studyId \|\| meta.study_name` |
| YAML output path construction | MEDIUM | `path: {{#if project}}{{project}}/{{/if}}{{study}}/...` |
| Modal private_metadata | MEDIUM | `studyName: study.name` (should be `studyId: study.id`) |
| Service queries | MEDIUM | `where: { study_name }` (should be `where: { study_id }`) |

### 6.2 Code Review Checklist

**Before merge, verify:**

- [ ] No `study_name` string lookups in services
- [ ] No `study_name` in private_metadata
- [ ] No `study_name` in button values
- [ ] No `study_name` in YAML consumes/emits
- [ ] No `study_name` in cascade variable writes
- [ ] No `if (project_id)` conditional paths
- [ ] No `|| study_name` fallback expressions
- [ ] All handlers receive project context
- [ ] All modals include project in metadata
- [ ] All templates use project-prefixed paths

### 6.3 Pattern Enforcement Test Additions

**Add to `pattern-enforcement.test.ts`:**

```typescript
// No study_name string lookups in services
it('services use study_id FK, not study_name string', async () => {
  const serviceFiles = await glob('src/services/*.ts');
  for (const file of serviceFiles) {
    const content = await fs.readFile(file, 'utf-8');
    expect(content).not.toMatch(/where:\s*{\s*study_name/);
    expect(content).not.toMatch(/findOne\(\s*{\s*where:\s*{\s*study_name/);
  }
});

// No study_name in handler metadata
it('handlers use studyId in metadata, not studyName string', async () => {
  const handlerFiles = await glob('src/helpers/slack/commands/*.ts');
  for (const file of handlerFiles) {
    const content = await fs.readFile(file, 'utf-8');
    // Allow studyName for display only, not for lookups
    expect(content).not.toMatch(/getStudyByName\(.*studyName/);
  }
});
```

---

## 7. Summary

### What's Different from Dual-Write Migration

| Aspect | Dual-Write (Original) | Clean Break (This Audit) |
|--------|----------------------|--------------------------|
| Data preservation | Primary concern | Not applicable |
| Feature flags | Required | None |
| Rollback strategy | Complex, phased | Redeploy previous commit |
| Dual-path code | Extensive | Zero tolerance |
| Migration phases | 5 | 3 (wipe → migrate → deploy) |
| Timeline | Weeks | Days (once tests pass) |

### Restructure-Blocking Items

1. **Cascade variable store tests** — Must exist before cutover
2. **Representative template tests** — Must exist before cutover
3. **Modal callback flow tests** — Must exist before cutover
4. **Code review checklist** — Must be enforced on merge

### Non-Blocking Items

- Handler updates — Can be done incrementally in feature branch
- YAML template updates — Can be done incrementally in feature branch
- Modal builder updates — Can be done incrementally in feature branch
- Documentation — Can follow implementation

### Risk Level: MEDIUM

With clean break approach, risk shifts from "data loss" to "test coverage." The restructure is safe if:
- Test gaps are closed before cutover
- Code review catches compatibility patterns
- Pattern enforcement tests prevent regression

The test coverage work is the critical path. Phase 1 spec should include test coverage as a precondition, not a parallel workstream.

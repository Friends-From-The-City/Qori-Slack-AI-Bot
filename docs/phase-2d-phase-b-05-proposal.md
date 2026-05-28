# Phase 2D Phase B-0.5 Proposal: Folder Scaffolding Redesign

**Date:** 2026-05-27
**Status:** Proposal, awaiting review
**Prerequisite for:** Phase B Step 3 (discussionGuideHandler)

---

## Executive Summary

Replace the opaque folder template copy mechanism with a transparent, testable architecture:

1. **Structure registry** in TypeScript defines the canonical folder structure
2. **Content registry** in qori-studies `_content/` stores meaningful markdown files
3. **Scaffolding function** writes project/study READMEs + content files on creation
4. **YAML templates** updated to spec'd paths (no more `primary-research/` interstitial)

**Why this design over alternatives:**

| Alternative | Problem |
|-------------|---------|
| Keep copying folder tree | Opaque, untestable, creates empty directories that lie about what exists |
| Just delete the template | Loses meaningful observer content, no documentation of structure |
| Define structure in YAML | Wrong abstraction — structure is architectural, not template config |

The proposed design matches mature engineering practice: structure as code (testable, version-controlled), content as content (editable without deploy), documentation as README (visible in repo).

---

## 1. Structure Registry Design

### Location

```
backend/src/config/folderStructure.ts
```

Rationale: `config/` is where structural constants live (schemas are already at `backend/config/schemas/`). TypeScript in `src/` means it's importable by handlers and testable by Jest.

### TypeScript Shape

```typescript
/**
 * Canonical folder structure per Phase 1 spec.
 *
 * This is the SINGLE SOURCE OF TRUTH for folder paths.
 * YAML templates' output_options.path values MUST match these constants.
 * Pattern enforcement tests verify alignment.
 */

// Project-level folders (relative to project root)
export const PROJECT_FOLDERS = {
  DISCOVERY: '00-discovery',
  DISCOVERY_VARIABLES: '00-discovery/.variables',
} as const;

// Study-level folders (relative to study root)
export const STUDY_FOLDERS = {
  BRIEF: '01-brief',
  PLAN: '02-plan',
  FIELDWORK: '03-fieldwork',
  FIELDWORK_SESSIONS: '03-fieldwork/sessions',
  FIELDWORK_TRANSCRIPTS: '03-fieldwork/transcripts',
  FIELDWORK_OUTREACH: '03-fieldwork/outreach',
  SYNTHESIS: '04-synthesis',
  READOUTS: '05-readouts',
  TICKETS: '06-tickets',
  VARIABLES: '.variables',
} as const;

// Content files scaffolded on creation
export const SCAFFOLDED_CONTENT = {
  PROJECT_README: 'README.md',
  STUDY_README: 'README.md',
  OBSERVER_GUIDELINES: '03-fieldwork/observer-guidelines.md',
  OBSERVER_GUIDE_EXPANDED: '03-fieldwork/observer-guide-expanded.md',
} as const;

// Types for consumer code
export type ProjectFolder = typeof PROJECT_FOLDERS[keyof typeof PROJECT_FOLDERS];
export type StudyFolder = typeof STUDY_FOLDERS[keyof typeof STUDY_FOLDERS];
```

### Usage by Handlers

Handlers import constants instead of hardcoding paths:

```typescript
import { STUDY_FOLDERS } from '../../config/folderStructure';

// Before: 'primary-research/01-planning/'
// After:
const outputPath = STUDY_FOLDERS.BRIEF; // '01-brief'
```

### Pattern Enforcement Test

```typescript
// backend/src/__tests__/integration/pattern-enforcement.test.ts

describe('folder structure alignment', () => {
  test('YAML output_options.path values match folderStructure constants', async () => {
    const yamlFiles = await glob('config/prompts/*.yaml');
    const registry = Object.values({ ...PROJECT_FOLDERS, ...STUDY_FOLDERS });

    for (const file of yamlFiles) {
      const content = await fs.readFile(file, 'utf8');
      const match = content.match(/output_options:\s*\n\s*path:\s*"([^"]+)"/);
      if (match) {
        const yamlPath = match[1].replace(/\/$/, ''); // strip trailing slash
        // Discovery templates use {{project_slug}}/ prefix — validate remainder
        const normalizedPath = yamlPath.replace(/^\{\{project_slug\}\}\//, '');
        expect(registry).toContain(normalizedPath);
      }
    }
  });

  test('no hardcoded old folder names in handlers', async () => {
    const oldFolders = ['primary-research', '01-planning', '02-participants',
                        '04-analysis', '05-findings', '07-implementation'];
    const handlerFiles = await glob('backend/src/helpers/slack/commands/**/*.ts');

    for (const file of handlerFiles) {
      const content = await fs.readFile(file, 'utf8');
      for (const folder of oldFolders) {
        expect(content).not.toMatch(new RegExp(`['"\`]${folder}['"\`/]`));
      }
    }
  });
});
```

---

## 2. Content Registry Implementation

### Location in qori-studies

```
qori-studies/_content/
├── project-readme-template.md
├── study-readme-template.md
├── observer-guidelines.md
└── observer-guide-expanded.md
```

### File Contents

**project-readme-template.md** (new):
```markdown
# {{project_name}}

*Created {{created_date}} by {{created_by}}*

## Project Structure

| Folder | Purpose |
|--------|---------|
| `00-discovery/` | Desk research, stakeholder synthesis, surveys |
| `{study-slug}/01-brief/` | Research brief |
| `{study-slug}/02-plan/` | Research plan, discussion guide |
| `{study-slug}/03-fieldwork/` | Participant tracking, sessions, transcripts |
| `{study-slug}/04-synthesis/` | Affinity mapping, personas, JTBD |
| `{study-slug}/05-readouts/` | Research readout, stakeholder briefs |
| `{study-slug}/06-tickets/` | Generated GitHub issues |

## Studies

*Studies will appear here as they're created.*

---

*Generated by Qori*
```

**study-readme-template.md** (new):
```markdown
# {{study_name}}

*Part of project: {{project_name}}*
*Created {{created_date}} by {{created_by}}*

## Cascade Status

| Artifact | Status |
|----------|--------|
| Brief | Pending |
| Plan | — |
| Discussion Guide | — |
| Fieldwork | — |
| Synthesis | — |
| Readout | — |

*Updated as artifacts are generated.*

---

*Generated by Qori*
```

**observer-guidelines.md** and **observer-guide-expanded.md**: Migrated from current `config/templates/` with no content changes (already substantial, 117 and 42 lines respectively).

### Fetch Mechanism

Same pattern as YAML templates — `fetchFileFromRepo`:

```typescript
import { fetchFileFromRepo } from '../github';

const CONTENT_PATH = '_content';

async function fetchContentTemplate(filename: string): Promise<string> {
  const file = await fetchFileFromRepo(
    process.env.GITHUB_REPO!, // qori-studies, not config repo
    CONTENT_PATH,
    filename
  );
  return file.content;
}
```

**Note:** Content lives in `GITHUB_REPO` (qori-studies), not `GITHUB_CONFIG_REPO` (qori-slack). This is intentional — researchers can edit content without touching code.

### Variable Interpolation

Handlebars, same as YAML output templates:

```typescript
import Handlebars from 'handlebars';

function renderTemplate(template: string, vars: Record<string, string>): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled(vars);
}
```

Variables available:
- `{{project_name}}` — project display name
- `{{project_slug}}` — URL-safe slug
- `{{study_name}}` — study display name
- `{{study_slug}}` — URL-safe slug
- `{{created_date}}` — ISO date
- `{{created_by}}` — researcher name (resolved from Slack user ID)

### Error Handling

```typescript
async function fetchContentTemplate(filename: string): Promise<string | null> {
  try {
    const file = await fetchFileFromRepo(
      process.env.GITHUB_REPO!,
      CONTENT_PATH,
      filename
    );
    return file.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ Content template fetch failed: ${filename} — ${message}`);
    return null; // Graceful degradation — scaffolding continues without this file
  }
}
```

Content fetch failure is non-fatal. The scaffolding function writes what it can. Missing observer guides don't block study creation — they can be added later via a separate fix or manual upload.

---

## 3. Scaffolding Function

### Location

```
backend/src/services/scaffolding.service.ts
```

Rationale: Services handle data operations. Scaffolding writes files to GitHub — that's a data operation.

### Signature

```typescript
interface ScaffoldProjectResult {
  projectReadmePath: string;
  projectReadmeUrl: string;
  errors: string[]; // Non-fatal errors (content fetch failures)
}

interface ScaffoldStudyResult {
  studyReadmePath: string;
  studyReadmeUrl: string;
  observerGuidesPaths: string[];
  errors: string[];
}

async function scaffoldProject(
  projectSlug: string,
  projectName: string,
  createdBy: string,
): Promise<ScaffoldProjectResult>;

async function scaffoldStudy(
  projectSlug: string,
  studySlug: string,
  studyName: string,
  projectName: string,
  createdBy: string,
): Promise<ScaffoldStudyResult>;
```

### Called From

| Caller | When | Which Function |
|--------|------|----------------|
| `projectStartHandler.ts` | Project created via `/qori-start` | `scaffoldProject` |
| `briefHandler.ts` | Study created from brief submission (Phase A flow) | `scaffoldStudy` |
| `createStudyHandler.ts` | Direct study creation (legacy flow, if still used) | `scaffoldStudy` |

**Audit of callers:**

1. **projectStartHandler.ts** — `/qori-start` creates project. Should call `scaffoldProject`.
2. **briefHandler.ts** — Creates study on first brief if doesn't exist (lines 258-303). Should call `scaffoldStudy` inside the transaction.
3. **createStudyHandler.ts** — Legacy `/qori-create-study` flow. Currently calls `copyFilesToFolder`. Replace with `scaffoldStudy`.

No other callers found. The three above are the complete set.

### Error Handling

```typescript
async function scaffoldStudy(...): Promise<ScaffoldStudyResult> {
  const errors: string[] = [];
  const paths: string[] = [];

  // 1. Write study README (required — fail if this fails)
  const readmeContent = await fetchContentTemplate('study-readme-template.md');
  if (!readmeContent) {
    throw new Error('Failed to fetch study-readme-template.md — cannot scaffold');
  }
  const rendered = renderTemplate(readmeContent, { study_name: studyName, ... });
  const readmePath = `${projectSlug}/${studySlug}/README.md`;
  const result = await createOrUpdateFileOnGitHub(readmePath, rendered);

  // 2. Write observer guides (optional — log warning, continue)
  const guides = ['observer-guidelines.md', 'observer-guide-expanded.md'];
  for (const guide of guides) {
    const content = await fetchContentTemplate(guide);
    if (!content) {
      errors.push(`Content fetch failed: ${guide}`);
      continue;
    }
    const guidePath = `${projectSlug}/${studySlug}/${STUDY_FOLDERS.FIELDWORK}/${guide}`;
    try {
      await createOrUpdateFileOnGitHub(guidePath, content);
      paths.push(guidePath);
    } catch (err) {
      errors.push(`GitHub write failed: ${guidePath}`);
    }
  }

  return { studyReadmePath: readmePath, studyReadmeUrl: result.url, observerGuidesPaths: paths, errors };
}
```

**Partial failure semantics:**
- README write failure = hard fail (throw). Study needs documentation.
- Observer guide write failure = soft fail (log, continue). Guides are nice-to-have, not blocking.

### Sync/Async Behavior

Scaffolding runs **after** modal acknowledgment, not blocking the response:

```typescript
async function handleBriefSubmission({ ack, ... }) {
  await ack();  // Modal closes immediately (satisfies 3-second window)

  // ... all GitHub operations happen after ack
  await scaffoldStudy(...);  // Non-blocking to Slack
}
```

This matches the existing pattern in `briefHandler.ts:195-196`. Slack's 3-second modal response window is satisfied by `await ack()` before any GitHub API calls. Scaffolding failures are handled via error logging and user DM notification, not modal error states.

---

## 4. Project-Level README

### Template Content

See Section 2 above — `project-readme-template.md`.

### Variable Interpolation

| Variable | Source |
|----------|--------|
| `{{project_name}}` | `projects.name` from DB |
| `{{created_date}}` | `projects.created_at` formatted |
| `{{created_by}}` | Resolved from `projects.created_by` (Slack user ID → display name) |

### Lives At

```
qori-studies/_content/project-readme-template.md
```

Written to:

```
qori-studies/{project-slug}/README.md
```

---

## 5. YAML Template output_options.path Updates

### Current → New Mapping

| Template | Current Path | New Path | Notes |
|----------|--------------|----------|-------|
| research_brief.yaml | `01-planning/` | `01-brief/` | Subfolder rename |
| research_plan.yaml | `01-planning/` | `02-plan/` | Move to plan folder |
| discussion_guide.yaml | `01-planning/` | `02-plan/` | Move to plan folder |
| participant_tracker.yaml | `02-participants/` | `03-fieldwork/` | Subfolder rename |
| participant_outreach.yaml | `02-participants/outreach/` | `03-fieldwork/outreach/` | Subfolder rename |
| session_notes.yaml | `03-fieldwork/session-notes/{{session_id}}/` | `03-fieldwork/sessions/{{session_id}}/` | Minor rename |
| session_summary.yaml | `03-fieldwork/session-summaries/` | `03-fieldwork/sessions/` | Consolidate |
| transcript_upload.yaml | `03-fieldwork/coded-transcript-analysis/` | `03-fieldwork/transcripts/` | Subfolder rename |
| affinity_mapping.yaml | `04-analysis/affinity-mapping/` | `04-synthesis/` | Flatten |
| persona_generator.yaml | `04-analysis/personas/` | `04-synthesis/` | Flatten |
| jobs_to_be_done.yaml | `04-analysis/jobs-to-be-done/` | `04-synthesis/` | Flatten |
| journey_mapping.yaml | `04-analysis/journey-mapping/` | `04-synthesis/` | Flatten |
| design_opportunity_generator.yaml | `04-analysis/design-opportunities/` | `04-synthesis/` | Flatten |
| service_blueprint.yaml | `04-analysis/service-blueprint/` | `04-synthesis/` | Flatten |
| usability_issues_extractor.yaml | `04-analysis/usability-issues/` | `04-synthesis/` | Flatten |
| research_readout.yaml | `05-findings/` | `05-readouts/` | Subfolder rename |
| targeted_readouts.yaml | `05-findings/` | `05-readouts/` | Subfolder rename |
| leadership_readout.yaml | `05-reports/` | `05-readouts/` | Subfolder rename |
| engineering_readout.yaml | `05-reports/` | `05-readouts/` | Subfolder rename |
| designer_readout.yaml | `05-reports/` | `05-readouts/` | Subfolder rename |
| accessibility_readout.yaml | `05-reports/` | `05-readouts/` | Subfolder rename |
| github_issues_generator.yaml | `07-implementation/` | `06-tickets/` | Subfolder rename |
| desk_research.yaml | `{{project_slug}}/00-discovery/` | `{{project_slug}}/00-discovery/` | No change |
| stakeholder_synthesis.yaml | `{{project_slug}}/00-discovery/` | `{{project_slug}}/00-discovery/` | No change |
| survey_synthesis.yaml | `{{project_slug}}/00-discovery/` | `{{project_slug}}/00-discovery/` | No change |
| research_request.yaml | `research-requests/00-requests/` | No change | Separate intake flow (stakeholder requests before project creation) |

### Handler extraFolder Parameter

**Current behavior:** Handlers pass `'primary-research'` as `extraFolder` parameter to `processYamlTemplate`. The final path becomes `{studyPath}/primary-research/{yamlPath}`.

**Proposed change:** Remove `extraFolder` from handlers. YAML `output_options.path` handles the full relative path. Handler passes `''` (empty string).

```typescript
// Before:
const renderedYaml = await processYamlTemplate(
  file.content, data, studyPath, 'primary-research', false, variableContext
);

// After:
const renderedYaml = await processYamlTemplate(
  file.content, data, studyPath, '', false, variableContext
);
```

This eliminates the architectural split between "handler decides outer folder, YAML decides inner folder" — YAML is the single source of truth for artifact paths.

---

## 6. Handler Updates

### Artifact-Writing Handlers

| Handler | Current Path Construction | New Path Construction |
|---------|---------------------------|----------------------|
| briefHandler.ts:522 | `studyPath + 'primary-research' + '01-planning/'` | `studyPath + '01-brief/'` |
| planHandler.ts:237 | `studyPath + 'primary-research' + '01-planning/'` | `studyPath + '02-plan/'` |
| discussionGuideHandler.ts | `studyPath + 'primary-research' + '01-planning/'` | `studyPath + '02-plan/'` |
| analyzeNotesHandler.ts | `studyPath + 'primary-research' + '03-fieldwork/'` | `studyPath + '03-fieldwork/'` |
| sessionNotesHandler.ts | `studyPath + 'primary-research' + '03-fieldwork/'` | `studyPath + '03-fieldwork/'` |
| readoutHandler.ts | `studyPath + 'primary-research' + '05-findings/'` | `studyPath + '05-readouts/'` |
| discoverHandler.ts:535 | `'' + '' + '{{project_slug}}/00-discovery/'` | No change (already correct) |

### Hardcoded Path References

| File | Line | Current | Fix |
|------|------|---------|-----|
| ticketHandler.ts | 633 | `${studyName}/primary-research/05-reports/` | `${studyPath}/05-readouts/` |
| addObserverHandler.ts | 44 | `'primary-research'` extraFolder | `''` extraFolder |

### createStudyHandler Destination Path

**Current:** `{product_folder_name}/{sub_folder_name}/research/{studyName}/`

This is a legacy pattern from before projects existed. **Proposed change:** Replace with `{projectSlug}/{studySlug}/` (spec-aligned).

The `product_folder_name` and `sub_folder_name` references come from `channel_config` — a pre-project-era configuration. After Phase 2C, projects have their own slug. Use that.

---

## 7. Removal Scope

### config/templates/ Removal

Delete entire directory after content migrated:
```
config/templates/README.md
config/templates/desk-research/readme.md
config/templates/primary-research/01-planning/README.md
config/templates/primary-research/02-participants/README.md
config/templates/primary-research/03-fieldwork/observer_guidelines.md
config/templates/primary-research/04-analysis/readme.md
config/templates/primary-research/05-findings/README
config/templates/primary-research/06-assets/observer_guide_expanded.md
config/templates/primary-research/07-implementation/README.md
```

### Code References to Remove

| File | What | Action |
|------|------|--------|
| github.ts | `readFolders`, `copyFilesToFolder` exports | Keep functions (may be used elsewhere), remove from briefHandler/createStudyHandler usage |
| briefHandler.ts:277-284 | `readFolders` + `copyFilesToFolder` call | Replace with `scaffoldStudy` call |
| createStudyHandler.ts:165-173 | `readFolders` + `copyFilesToFolder` call | Replace with `scaffoldStudy` call |

### Documentation Update

Add to `docs/phase-2d-close-out.md` (or create if doesn't exist):
```markdown
## Folder Template Removal

Removed `config/templates/` in Phase B-0.5. Structure now defined in
`backend/src/config/folderStructure.ts`. Content now lives in
`qori-studies/_content/`.

Pattern enforcement tests verify alignment between:
- folderStructure.ts constants
- YAML output_options.path values
- Handler extraFolder parameters (should be empty)
```

---

## 8. Edge Cases

### .variables/ Folder

**Question:** Does `.variables/` need explicit creation?

**Answer:** No. GitHub auto-creates parent directories when a file is written. When the first cascade variable JSON is written to `{study}/.variables/brief-variables.json`, GitHub creates `.variables/` automatically.

**Verification:** Confirmed by existing behavior — `studyVariables.ts` writes directly without folder creation.

### Existing Studies with Old Structure

**Decision:** Do nothing.

Rationale: All existing studies are test data. No production studies exist. The old folders (`primary-research/01-planning/`, etc.) will coexist with new artifacts written to new paths. This is acceptable for test data. If cleanup is needed, it's a manual one-time task, not a migration.

### createStudyHandler Callers Audit

**Handler registration:**
| Registration | Location |
|--------------|----------|
| `slackApp.view('create_study_modal', handleCreateStudySubmission)` | events.ts:242 |

**Modal sources (both use callback_id `create_study_modal`):**
| Modal | File | Entry Point |
|-------|------|-------------|
| `createStudyModal` | createStudyModal.ts:398 | Direct study creation flow |
| `createStudyFromRequestModal` | createStudyFromRequestModal.ts:12 | requestResearchHandler.ts:330 (study from research request) |

Both modal sources submit to the single `handleCreateStudySubmission` handler. Updating the handler covers both entry points. No additional callers found.

---

## 9. Verification Protocol

### Fresh Project via /qori-start

1. Run `/qori-start` with project name "Test Project B05"
2. Confirm:
   - [ ] `test-project-b05/README.md` written with structure documentation
   - [ ] `test-project-b05/00-discovery/` does NOT exist (no discovery artifact yet)
   - [ ] No study folders yet (no studies created)

### Fresh Study via /qori-brief

1. In project channel, run `/qori-brief`
2. Fill brief, submit
3. Confirm:
   - [ ] `test-project-b05/test-study/README.md` written
   - [ ] `test-project-b05/test-study/03-fieldwork/observer-guidelines.md` written
   - [ ] `test-project-b05/test-study/03-fieldwork/observer-guide-expanded.md` written
   - [ ] `test-project-b05/test-study/01-brief/` created with brief artifact
   - [ ] No `primary-research/` folder
   - [ ] No `01-planning/` folder (brief goes to `01-brief/`)

### Generate Plan

1. Run `/qori-plan`, create plan
2. Confirm:
   - [ ] Plan at `test-project-b05/test-study/02-plan/test-study-research-plan-{date}.md`
   - [ ] NOT at `primary-research/01-planning/`

### Generate Discussion Guide

1. Run `/qori-plan`, create discussion guide
2. Confirm:
   - [ ] Guide at `test-project-b05/test-study/02-plan/test-study-discussion-guide-{date}.md`
   - [ ] NOT at `primary-research/01-planning/`

### Run /qori-discover

1. Run `/qori-discover` with desk research
2. Confirm:
   - [ ] Artifact at `test-project-b05/00-discovery/test-topic-desk-research-{date}.md`
   - [ ] NOT at `test-project-b05/test-study/desk-research/`

### Negative Verification

After all above:
- [ ] `grep -r 'primary-research' qori-studies/test-project-b05/` returns nothing
- [ ] `grep -r '01-planning' qori-studies/test-project-b05/` returns nothing
- [ ] `grep -r '02-participants' qori-studies/test-project-b05/` returns nothing

---

## 10. Implementation Order

### Step 1: Structure Registry
- Create `backend/src/config/folderStructure.ts`
- Add pattern enforcement tests (expected-failing until YAML updates)
- **Verification:** Tests compile, structure matches spec

### Step 2: Content Migration
- Create `qori-studies/_content/` with 4 files
- Commit to qori-studies main branch
- **Verification:** `fetchFileFromRepo` can retrieve content

### Step 3: Scaffolding Service
- Create `backend/src/services/scaffolding.service.ts`
- Unit test the service with mocked GitHub API
- **Verification:** Service compiles, tests pass

### Step 4: Handler Updates — Scaffolding Callers
- Update `projectStartHandler.ts` to call `scaffoldProject`
- Update `briefHandler.ts` to call `scaffoldStudy` (remove `copyFilesToFolder`)
- Update `createStudyHandler.ts` to call `scaffoldStudy` (remove `copyFilesToFolder`)
- **Verification:** `/qori-start` creates project README, `/qori-brief` creates study scaffold

### Step 5: YAML Template Updates
- Update all 24 YAML `output_options.path` values per mapping table
- **Verification:** Pattern enforcement tests pass

### Step 6: Handler extraFolder Updates
- Change all `processYamlTemplate` calls to pass `''` for extraFolder
- Fix hardcoded references (ticketHandler.ts, addObserverHandler.ts)
- **Verification:** Full verification protocol from Section 9

### Step 7: Cleanup
- Delete `config/templates/`
- Remove unused `readFolders`/`copyFilesToFolder` imports
- **Verification:** Build passes, no dead code warnings

---

## 11. Risks

### Partial Scaffolding Failure

**Risk:** GitHub write fails partway through `scaffoldStudy`.

**Mitigation:** Study README is written first (most critical). Observer guides are optional — failure is logged but doesn't block. The study record is created in DB inside a transaction; if scaffolding throws, the transaction rolls back.

### GitHub API Rate Limits

**Current approach:** `copyFilesToFolder` makes N API calls for N files in template (currently 9 files).

**New approach:** `scaffoldProject` makes 1 call (README). `scaffoldStudy` makes 3 calls (README + 2 observer guides).

**Net effect:** Fewer API calls (3 vs 9). Risk reduced.

### Pattern Enforcement CI Test

**Recommendation:** Yes. Add to `pattern-enforcement.test.ts`:

```typescript
test('no hardcoded old folder names in handlers', async () => {
  const oldFolders = ['primary-research', '01-planning', '02-participants',
                      '04-analysis', '05-findings', '07-implementation'];
  // ... grep test
});
```

This catches regressions if someone adds a new handler with old paths.

### qori-studies Branch Coordination

**Decision:** Push `_content/` to qori-studies **main branch directly**.

**Reasoning:**
- Content is not code — no CI/CD gating needed
- Dev and prod share the same qori-studies repo
- Content edits are low-risk (markdown READMEs, observer guides)
- The feature branch is in qori-slack (code), not qori-studies (content)

**Alternative rejected:** Creating a feature branch in qori-studies for content would add coordination overhead without safety benefit. Content changes don't require code review in the same way handler changes do.

**Dev/prod bifurcation:** Yes, dev environment will fetch content from main while code runs from feature branch. This is intentional — content is stable, code is under development. The bifurcation resolves when the qori-slack feature branch merges to main.

---

## 12. Scope Assessment

**Estimated effort:** 4-6 hours focused implementation after proposal approval.

**Breakdown:**
- Structure registry + tests: 30 min
- Content migration to qori-studies: 30 min
- Scaffolding service: 1 hour
- Handler scaffolding updates: 1 hour
- YAML template updates: 1 hour (24 files, mechanical changes)
- Handler extraFolder updates: 30 min
- Cleanup + verification: 1 hour

**Fits in one session:** Yes, if proposal approved without significant changes.

**Risk of scope creep:** Low. The changes are mechanical once the design is set. The only creative work is the README templates, which are defined above.

---

## Decision Request

Approve this proposal to proceed with implementation, or request specific changes.

Key decisions embedded in proposal:
1. Structure registry at `backend/src/config/folderStructure.ts` (not a JSON config file)
2. Content in `GITHUB_REPO/_content/` (not `GITHUB_CONFIG_REPO`)
3. Handlers pass `''` for extraFolder (YAML owns full path)
4. Pattern enforcement test blocks old folder names in handlers
5. Scaffolding failure is partial-soft (README required, guides optional)

If any of these need revision, specify before implementation begins.

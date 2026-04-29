# Folder Migration Plan: beta-test/ → config/

**Date:** 2026-04-29
**Status:** Investigation complete. No changes made.

---

## 1. Current State Inventory

### `beta-test/YAML Templates/` — 23 YAML files (ACTIVE)

This is the **live editing surface**. The backend fetches templates from this folder at runtime via `getConfigRepo()` + `fetchFileFromRepo()`. Four files were modified during this session (Apr 29): `research_plan.yaml`, `service_blueprint.yaml`, `session_notes.yaml`, `usability_issues_extractor.yaml`.

| File | Last Modified |
|------|---------------|
| affinity_mapping.yaml | Apr 20 |
| design_opportunity_generator.yaml | Apr 20 |
| desk_research.yaml | Apr 20 |
| discussion_guide.yaml | Apr 20 |
| github_issues_generator.yaml | Apr 20 |
| jobs_to_be_done.yaml | Apr 20 |
| journey_mapping.yaml | Apr 20 |
| participant_outreach.yaml | Apr 20 |
| participant_tracker.yaml | Apr 20 |
| persona_generator.yaml | Apr 20 |
| research_brief.yaml | Apr 20 |
| research_plan.yaml | **Apr 29** |
| research_readout.yaml | Apr 20 |
| research_request.yaml | Apr 20 |
| service_blueprint.yaml | **Apr 29** |
| session_notes.yaml | **Apr 29** |
| session_summary.yaml | Apr 20 |
| stakeholder_interview_guide.yaml | Apr 20 |
| stakeholder_synthesis.yaml | Apr 20 |
| survey_synthesis.yaml | Apr 20 |
| targeted_readouts.yaml | Apr 20 |
| transcript_upload.yaml | Apr 20 |
| usability_issues_extractor.yaml | **Apr 29** |

### `config/prompts/` — 26 YAML files (STALE)

Local reference copies. Not read by the backend at runtime. Contains 3 orphaned templates that were deleted from `beta-test/` during this session: `observer_request.yaml`, `participant_status_update.yaml`, `synthesize_router.yaml`.

### `config/modals/` — 26 JSON files across 5 subdirectories (REFERENCE ONLY)

```
config/modals/
├── analyze/     (3 files: analyze_notes, research_request, synthesis)
├── notes/       (3 files: manual_notes, take_notes, upload_transcript)
├── outreach/    (7 files: follow_up, initial_recruitment, outreach_menu, rescheduling, session_confirmation, session_reminder, thank_you)
├── participants/ (3 files: add_participant, observer_request, update_participant)
├── plan/        (8 files: discussion_guide, plan_menu, research_brief, research_plan, stakeholder_interview_guide, upload_desk_research, upload_stakeholder_notes, upload_survey_data)
└── report/      (2 files: report_menu, targeted_readouts)
```

These JSON files are **not loaded at runtime** by most handlers. The backend builds modals programmatically in JS files under `backend/src/helpers/slack/ui/`. The JSON files appear to be reference specs / Block Kit Builder drafts, except `config/modals/analyze/synthesis.json` which we edited labels in this session.

### `beta-test/slack-ui/modals/` — 26 JSON files (LEGACY DRAFTS)

Older modal drafts with different naming conventions. Not referenced by any code. Safe to ignore or delete.

### Other config-shaped folders

| Folder | Contents | Status |
|--------|----------|--------|
| `config/command-mapping.json` | Maps commands to modal/prompt files | **Not used at runtime** (documented in CLAUDE.md) |
| `config/sam-config.yaml` | SAM agent config | SAM is unfinished |
| `beta-test/templates/` | Study folder scaffold (markdown READMEs) | Used by `createStudyHandler.js:180` via `readFolders('beta-test/templates')` |
| `study-template/` | Another study folder scaffold | Not referenced by any code |
| `sam/` | `escalation-config.yaml`, `sam-prompts.yaml` | SAM is unfinished |

---

## 2. Backend Integration Analysis

### How templates are fetched

Every YAML template fetch follows the same pattern:
```js
const file = await fetchFileFromRepo(getConfigRepo(), "beta-test/YAML Templates", "template_name.yaml");
```

- `getConfigRepo()` returns `process.env.GITHUB_CONFIG_REPO || process.env.GITHUB_REPO` (defined in `github.js:9-10`)
- The folder path `"beta-test/YAML Templates"` is **hardcoded in every call site** — there is no centralized constant.

### All 24 call sites across 10 files

| File | Lines | Template(s) |
|------|-------|-------------|
| `events.js` | 1277, 1514, 1811, 2116, 2317, 2527, 2666 | research_plan, research_brief, discussion_guide, stakeholder_interview_guide, stakeholder_synthesis, survey_synthesis, desk_research |
| `sessionNotesHandler.js` | 352 | `yamlTemplateName` (variable — session_notes or transcript_upload) |
| `participantOutreachHandler.js` | 272, 398, 523, 645, 761, 884, 1017 | participant_outreach (×6), participant_tracker (×1) |
| `readoutHandler.js` | 404 | `yamlTemplateName` (variable — research_readout, targeted_readouts, github_issues_generator) |
| `requestResearchHandler.js` | 101 | research_request |
| `participantHandler.js` | 403 | participant_tracker |
| `researchSynthesisHandler.js` | 721 | `yamlFileName` (variable — all synthesis sub-templates) |
| `observeSessionHandler.js` | 273, 391 | participant_tracker (×2) |
| `analyzeNotesHandler.js` | 179 | session_summary |
| `createStudyHandler.js` | 180 | Uses `'beta-test/templates'` (different path — folder scaffold, not YAML) |

### What would need to change to point at `config/prompts/`

**Option A: One-line centralized constant (recommended)**

Add a constant to `github.js` or a new `config/constants.js`:
```js
const TEMPLATE_FOLDER = "config/prompts";
```

Then find-and-replace `"beta-test/YAML Templates"` → `TEMPLATE_FOLDER` across all 24 call sites. All are in the second argument to `fetchFileFromRepo()`.

**Option B: Change just the string**

Find-and-replace `"beta-test/YAML Templates"` → `"config/prompts"` across all files. Simpler but no abstraction.

**Note:** `createStudyHandler.js:180` uses `'beta-test/templates'` (the folder scaffold), not `'beta-test/YAML Templates'`. This is a separate path that would need its own decision (move scaffold to `config/templates/` or `study-template/`).

### Other `beta-test/` references in code

| File | Line | Path | Purpose |
|------|------|------|---------|
| `events.js` | 747 | `"beta-test/product-team-1/research"` | Fallback research folder (active) |
| `observeSessionHandler.js` | 325 | Hardcoded GitHub URL to `beta-test/templates/.../observer_guidelines.md` | Observer guidelines link |
| `createStudyHandler.js` | 180 | `'beta-test/templates'` | Study folder scaffold |

---

## 3. Migration Risks

### Templates in `beta-test/` but NOT in `config/prompts/`

None — all 23 `beta-test/YAML Templates/` files exist in `config/prompts/`. (The 3 extra files in `config/prompts/` — `observer_request.yaml`, `participant_status_update.yaml`, `synthesize_router.yaml` — are orphaned templates we deleted from `beta-test/` this session.)

### Diverged templates (6 files)

| Template | Status | Risk |
|----------|--------|------|
| `usability_issues_extractor.yaml` | **Major divergence** — beta-test is the v3.0 rewrite (14KB), config/prompts has the old v2.0 (22KB) | Must copy beta→config. Config version is broken (6-task chain). |
| `research_plan.yaml` | Beta-test has the `{{start_date}}` fix from this session | Must copy beta→config |
| `session_notes.yaml` | Beta-test has the `ai_generation_tasks` key fix | Must copy beta→config |
| `service_blueprint.yaml` | Beta-test has the output path fix | Must copy beta→config |
| `discussion_guide.yaml` | 3-byte difference, likely whitespace | Low risk — verify and copy |
| `participant_outreach.yaml` | 19-byte difference | Low risk — verify and copy |

### Can we migrate incrementally?

**Yes.** Each template is fetched independently. We can:
1. Copy all 23 files from `beta-test/YAML Templates/` to `config/prompts/` (overwriting stale versions)
2. Delete the 3 orphaned files from `config/prompts/`
3. Change the path constant in one commit
4. Test each command individually

There are no cross-dependencies between templates that would require all-or-nothing migration.

### Modal JSON migration

The `config/modals/` JSON files are mostly reference specs, not loaded at runtime. The one exception is `config/modals/analyze/synthesis.json` (we edited labels in this session). Since the backend builds modals in JS (`backend/src/helpers/slack/ui/`), moving or deleting the JSON files has no runtime impact. The `beta-test/slack-ui/modals/` folder is fully legacy and can be deleted.

---

## 4. Proposed Migration Plan

### Step 1: Sync templates (effort: XS)

Copy all 23 YAML files from `beta-test/YAML Templates/` to `config/prompts/`, overwriting stale versions. Delete the 3 orphaned files from `config/prompts/`.

```bash
cp "beta-test/YAML Templates/"*.yaml config/prompts/
rm config/prompts/observer_request.yaml config/prompts/participant_status_update.yaml config/prompts/synthesize_router.yaml
```

**Verify:** `diff -r "beta-test/YAML Templates/" config/prompts/` should show only the README difference.

### Step 2: Add centralized constant (effort: XS)

In `backend/src/helpers/github.js`, add:
```js
const YAML_TEMPLATE_FOLDER = "config/prompts";
```
Export it.

### Step 3: Update all call sites (effort: S)

Find-and-replace `"beta-test/YAML Templates"` → `YAML_TEMPLATE_FOLDER` across all 10 handler files (24 call sites). This is a mechanical change.

**Verify after each file:** Run the associated `/qori-*` command to confirm templates still load.

### Step 4: Update other `beta-test/` references (effort: XS)

- `events.js:747` — decide if `"beta-test/product-team-1/research"` should move
- `observeSessionHandler.js:325` — update hardcoded GitHub URL for observer guidelines
- `createStudyHandler.js:180` — `'beta-test/templates'` folder scaffold → decide new location

### Step 5: Clean up (effort: XS)

- Delete `beta-test/YAML Templates/` (now redundant)
- Delete `beta-test/slack-ui/modals/` (legacy drafts)
- Optionally delete `study-template/` (duplicate of `beta-test/templates/`)
- Update CLAUDE.md to reflect new paths

### Rollback strategy

If anything breaks after Step 3:
1. Revert the path constant back to `"beta-test/YAML Templates"` (one-line change)
2. The files still exist in both locations, so no data is lost
3. Push and Railway auto-deploys the revert

### Estimated total effort

| Step | Effort | Risk |
|------|--------|------|
| 1. Sync templates | XS (one cp command) | None — no runtime change yet |
| 2. Add constant | XS (2 lines) | None — constant isn't used yet |
| 3. Update call sites | S (24 string replacements) | Low — mechanical change, one template tested per command |
| 4. Other beta-test refs | XS (3 lines) | Low |
| 5. Cleanup | XS (delete folders) | None — old files already unused |
| **Total** | **S** (1-2 hours including testing) | **Low** |

---

## 5. Blocking Questions

1. **Should `config/prompts/` stay local or still be fetched from GitHub?** Currently the backend fetches from GitHub at runtime via `getConfigRepo()`. If we point at `config/prompts/`, those files are in the same repo — they'll be fetched from GitHub the same way, just from a different path. Alternatively, we could read them from the local filesystem (skip GitHub API entirely), which would be faster and work offline. This is a separate architecture decision.

2. **What happens to `beta-test/templates/` (the study folder scaffold)?** `createStudyHandler.js:180` reads from this folder. Should it move to `config/templates/` or stay?

3. **Should we keep `config/modals/` JSON files?** They're mostly unused reference specs. Keeping them as documentation is fine, but they should be clearly marked as non-runtime.

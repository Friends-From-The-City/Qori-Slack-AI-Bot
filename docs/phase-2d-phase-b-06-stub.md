# Phase B-0.6: Migrate createStudyHandler to Project-Aware Scaffolding

**Status:** Stub — implementation deferred
**Filed:** 2026-05-28

---

## Decision (Lapedra, May 28, 2026)

Study creation flows through the project-aware path, consistent with how `/qori-start` creates projects and how discovery artifacts lazy-create their folders (see Reference Pattern below). Brief creation is not the trigger for study/folder creation.

---

## Reference Pattern: Discovery Lazy-Creation

Confirmed in discoverHandler.ts:172-189 (`scaffoldDiscoveryFolders`):

1. On first discovery artifact submission, check if `{projectSlug}/00-discovery/README.md` exists
2. If not, create it (which creates the folder)
3. Then write the artifact

This is the reference pattern for study folder creation: lazy scaffolding on first artifact write, not pre-creation during brief submission.

---

## Scope

Migrate `createStudyHandler` (`handleCreateStudySubmission`) from pre-project-era channel_config-based folder paths to project-aware scaffolding.

**Current state (legacy):**
- Uses `getChannelConfigByChannelId(channelId)` for path resolution
- Uses `readFolders('config/templates')` + `copyFilesToFolder()` — old template copy mechanism
- Creates studies without `project_id` (old schema)
- Path pattern: `{sub_folder_name}/research/{studyName}/`

**Target state:**
- Uses `projectId` from modal metadata for path resolution
- Uses `scaffoldStudy()` from scaffolding.service.ts
- Creates studies with `project_id` FK
- Path pattern: `{projectSlug}/{studySlug}/` (per STUDY_FOLDERS registry)

---

## Affected Entry Points

| Action ID | Handler | Location |
|-----------|---------|----------|
| `create_study_from_brief` | openStudyFromBrief | briefToStudyHandler.ts:104-179 |
| `create_study_from_request` | handleCreateStudyFromRequest | requestResearchHandler.ts:305-343 |

Both open modals that submit to `handleCreateStudySubmission` in createStudyHandler.ts.

---

## Open Items to Resolve During B-0.6

### a. Confirm discovery's lazy-creation mechanism as the reference pattern
**Status:** Confirmed (see Reference Pattern above)

### b. Decide the fate of the two legacy entry points
Options:
1. **Redirect to project flow** — "Create Study" buttons redirect to `/qori-start` or project selection modal
2. **Rewire to be project-aware in place** — Keep entry points but require project context
3. **Deprecate** — Remove entry points, studies only created via `/qori-start` flow

**Lapedra's lean:** Consolidation toward the project flow (Option 1 or 3).

### c. Preserve meaningful non-scaffolding work
The following operations in `handleCreateStudySubmission` need project_id-aware versions or preservation in the new path:

| Operation | Lines | Notes |
|-----------|-------|-------|
| DB row creation | `addResearchStudyWithRoles(payload)` | Needs `project_id` in payload |
| Team member DMs | 200-238 | Notify assigned team members |
| Requester DM | 240-252 | Notify original requester (if from request) |
| Channel success message | 254-278 | Post confirmation to channel |

---

## Related Callsite (Phase B Step 3)

`openPlanFromBrief` at briefToStudyHandler.ts:37 uses deprecated `resolveStudyFromName` — same pattern Phase B Steps 1-2 fixed in planModalOpener and planHandler. Not new work, just an additional callsite needing the same treatment when Step 3 ships.

---

## Dependencies

- Phase B-0.5 complete (scaffolding.service.ts in place)
- Phase 2C complete (/qori-start project creation flow)
- Decision on legacy entry point fate (see Open Item b)

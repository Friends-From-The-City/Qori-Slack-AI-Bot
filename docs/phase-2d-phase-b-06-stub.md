# Phase B-0.6: createStudyHandler Disposition

**Status:** ✅ Complete
**Filed:** 2026-05-28
**Completed:** 2026-05-29 (PR #167)

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

**Original scope (2026-05-28):** Migrate `createStudyHandler` to project-aware scaffolding.

**Revised scope (2026-05-29, post-B-0.7):** **REMOVE** `createStudyHandler` and related dead code.

The handler is unreachable — `/qori-start` (Phase 2C) already creates studies through the project-aware path, making this legacy handler obsolete.

**Files to remove:**
- `src/helpers/slack/commands/createStudyHandler.ts`
- `src/helpers/slack/ui/createStudyModal.ts`
- `openStudyFromBrief` in `src/helpers/slack/commands/modal-openers/briefToStudyHandler.ts`

**Registrations to remove from events.ts:**
- Line 21: `startResearchHandler` import (dead)
- Line 240: `slackApp.action('add_user', handleAddTeamMember)` (unreachable)
- Line 242: `slackApp.view('create_study_modal', handleCreateStudySubmission)` (unreachable)
- Line 272: `slackApp.action('create_study_from_brief', openStudyFromBrief)` (unreachable)

---

## Affected Entry Points

**Post-B-0.7 (2026-05-29):** The `create_study_from_request` entry point was removed entirely. Only one entry point remains:

| Action ID | Handler | Location |
|-----------|---------|----------|
| `create_study_from_brief` | openStudyFromBrief | briefToStudyHandler.ts:213-288 |

This simplifies B-0.6 — only one entry point to rewire.

### Registration Grep (verified 2026-05-29, B-0.7 closure)

**Slack handler registrations in events.ts:**

| Line | Registration | Reachable? |
|------|--------------|------------|
| 240 | `slackApp.action('add_user', handleAddTeamMember)` | **UNREACHABLE** — only fires inside create_study_modal, which can't be opened |
| 242 | `slackApp.view('create_study_modal', handleCreateStudySubmission)` | **UNREACHABLE** — modal can't be opened (see below) |
| 272 | `slackApp.action('create_study_from_brief', openStudyFromBrief)` | **UNREACHABLE by design** — button never rendered (study always exists at brief-approval time) |

**Modal openers (what could trigger the view submission):**

| Location | Opener | Trigger | Status |
|----------|--------|---------|--------|
| createStudyHandler.ts:43 | `startResearchHandler` | None — imported but never registered | **DEAD** |
| briefToStudyHandler.ts:261 | `openStudyFromBrief` | `create_study_from_brief` action | **UNREACHABLE** — button never appears |

**Why `create_study_from_brief` button never appears:**
- The button is rendered only when `!studyExists` (requestChangesHandler.ts:146-159)
- `/qori-start` (Phase 2C) creates the study as part of project creation
- By brief-approval time, study always exists → button shows "Create Research Plan" instead
- Live-verified 2026-05-29: brief approval → "Create Research Plan" CTA (correct behavior)

**Conclusion:** Zero reachable invocations. The entire `createStudyHandler` file and its three registrations are dead code.

**Implication for B-0.6:** This is now a **REMOVAL candidate**, not a migration target. `/qori-start` already creates studies through the project-aware `projectStartCommand` — the "study creation through project-aware path" is fully realized, making this handler obsolete.

---

## Open Items to Resolve During B-0.6

### a. Confirm discovery's lazy-creation mechanism as the reference pattern
**Status:** Confirmed (see Reference Pattern above)

### b. Decide the fate of the remaining entry point
**Status:** Resolved by registration grep (2026-05-29)

With the registration grep confirming zero reachable invocations, the decision is clear:

**Recommendation: REMOVE** — Delete `createStudyHandler.ts` and its three registrations in events.ts (lines 21, 240, 242, 272). Also delete the modal builder `createStudyModal.ts` and the `openStudyFromBrief` handler in briefToStudyHandler.ts.

**Rationale:** The entry point is unreachable by design. `/qori-start` creates studies, so by brief-approval time the study always exists. The "Create Research Study" button can never appear through normal user flows.

### c. Preserve meaningful non-scaffolding work
**Status:** MOOT (2026-05-29)

With handler confirmed unreachable and recommended for removal, there's nothing to preserve. The equivalent functionality already exists in `/qori-start` flow:

| Operation | createStudyHandler | /qori-start equivalent |
|-----------|-------------------|------------------------|
| DB row creation | `addResearchStudyWithRoles` | `projectStartHandler` creates study with project_id |
| Team member DMs | Lines 200-238 | Project creation notifies team members |
| Channel success message | Lines 254-278 | Project creation posts to channel |

### d. Brief-submitter DM notification (enhancement)

**Pre-existing gap discovered during B-0.7 removal audit (2026-05-29):**

When a study is created from an approved brief, the brief submitter gets **no DM notification**. The notification code exists (lines 240-252) but is guarded by `isFromRequest`, which is undefined for the brief flow.

**Update (2026-05-29, B-0.7 closure):** With `createStudyHandler` confirmed unreachable and recommended for removal, this gap's disposition changes:

- **If handler is removed:** Gap becomes **MOOT** for the brief→study flow (that flow is dead)
- **If notification is still wanted:** Move to `projectStartCommand` / `/qori-start` flow, where study creation actually happens. The brief submitter notification would fire when the project+study is created, not at brief approval time.

**Recommendation:** Let the gap die with the handler. The current flow (`/qori-start` creates project+study) already has team member notifications. If brief-submitter notification is wanted, add it to the `/qori-start` flow as a separate enhancement, not as part of B-0.6.

---

## Related Callsite (Phase B Step 3)

**Status:** DONE (2026-05-29)

`openPlanFromBrief` at briefToStudyHandler.ts was migrated to use `getStudyById` with `studyId` and `projectId` from the button value, following the same pattern as planModalOpener and planHandler.

---

## Dependencies

- ✅ Phase B-0.5 complete (scaffolding.service.ts in place)
- ✅ Phase 2C complete (/qori-start project creation flow — this is why the handler is now dead)
- ✅ Registration grep confirms zero reachable invocations (see Caller Map above)

**B-0.6 is now a straightforward removal** — no migration logic needed, just delete dead code and verify tests pass.

---

## Completion Summary (2026-05-29)

**Deleted:**
- `createStudyHandler.ts` (3 exports, all unreachable)
- `createStudyModal.ts` (only caller deleted)
- `openStudyFromBrief` function in briefToStudyHandler.ts
- 4 registrations in events.ts
- Dead `create_study_from_brief` button path in requestChangesHandler.ts

**Preserved:**
- `create_research_plan_from_brief` button with FK context (Step 3 work)
- `openPlanFromBrief` handler

**Verification:**
- Typecheck, unit tests (114), integration tests (92) pass
- CI green (PR #167)
- Orphaned reference greps clean

**Net change:** -814 lines, +29 lines

**Phase B complete.**

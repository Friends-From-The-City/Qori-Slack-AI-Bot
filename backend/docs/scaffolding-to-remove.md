# Scaffolding to Remove

Temporary code added during Phase 2B-2D restructure. Each entry documents what exists, why, and when it gets deleted.

When deletion time arrives, work through this list. Each entry includes a pattern enforcement assertion to activate.

---

## 1. `resolveStudyFromName`

**File:** `src/services/research_study.service.ts`

**Function signature:**
```typescript
resolveStudyFromName(studyName: string): Promise<{
  study: ResearchStudy;
  projectId: number;
  studyId: number;
} | null>
```

**Why it exists:**
Modal builders (Phase 2D scope) still pass `studyName` in `private_metadata`. Handlers need `projectId` + `studyId` to call the new FK-based cascade APIs. This function is the ONE place that translates name → FKs.

**Deletion trigger:**
Phase 2D updates modal builders to pass `projectId` + `studyId` directly in `private_metadata`.

**Pattern enforcement assertion to activate:**
Located in `src/__tests__/integration/pattern-enforcement.test.ts`, search for:
```
ACTIVATE AT 2D CLOSE-OUT: resolveStudyFromName
```

Uncomment the assertion block. Test should pass after all usages are removed.

**Files using this scaffold (33 call sites, all migrated in Phase 2B Step 7):**

All handlers below now use `resolveStudyFromName` as the boundary function
and pass `variableContext: { projectId, studyId }` to FK-based cascade APIs.

**Handlers:**
- `helpers/slack/commands/analyzeNotesHandler.ts` ✅
- ~~`helpers/slack/commands/briefHandler.ts`~~ ✅ MIGRATED in 2D-A — now uses `getStudyByProjectAndName`
- `helpers/slack/commands/discussion-guide/discussionGuideHandler.ts` ✅
- `helpers/slack/commands/participantOutreachHandler.ts` ✅
- `helpers/slack/commands/planHandler.ts` ✅
- `helpers/slack/commands/readoutHandler.ts` ✅
- `helpers/slack/commands/researchSynthesisHandler.ts` ✅
- `helpers/slack/commands/sessionNotesHandler.ts` ✅
- `helpers/slack/commands/study/deleteStudyHandler.ts` ✅
- `helpers/slack/commands/addObserverHandler.ts` ✅
- `helpers/slack/requestChangesHandler.ts` ✅

**Modal openers:**
- `helpers/slack/commands/modal-openers/briefModalOpener.ts` ✅
- `helpers/slack/commands/modal-openers/briefToStudyHandler.ts` ✅
- `helpers/slack/commands/modal-openers/planModalOpener.ts` ✅

**UI / non-handler:**
- `helpers/slack/ui/studyResultBlocks.ts` ✅

**Core processor (variableContext parameter added):**
- `helpers/yamlProcessor.ts` ✅

**Removed imports (now use FK-based alternatives):**
- `getResearchStudyWithRoles` → `resolveStudyFromName`
- `readStudyVariables` → `readStudyVariablesByContext`
- `readUpstreamVariables` → `readUpstreamVariablesByContext`
- `writeStudyVariables` → `writeStudyVariablesByContext`

---

## ~~2. `briefHandler` study creation without project_id~~ ✅ REMOVED

**Status:** Removed in Phase 2D-A (2026-05-22)

**What was done:**
- Updated `briefHandler.ts` to receive `projectId` from modal metadata
- Removed the `@ts-expect-error project_id required` comment
- `addResearchStudyWithRoles` now receives `project_id: projectId` directly
- Transaction wrap added for atomic study creation + brief generation

---

## ~~3. `loadDiscoveryArtifacts` team-based lookup~~ ✅ REMOVED

**Status:** Removed in Phase 2D-A (2026-05-22)

**What was done:**
- Updated function signature from `loadDiscoveryArtifacts(team: string)` to `loadDiscoveryArtifacts(projectId: number)`
- Replaced `readDiscoveryVariables(team, type)` with `readDiscoveryVariablesByProject(projectId, type)`
- Updated all callers to pass `projectId` from channel context:
  - `researchBriefEntryModal.ts`
  - `briefHandler.ts`
  - `discoverHandler.ts`

---

## 4. Silent error swallow in yamlProcessor transform phase

**File:** `src/helpers/yamlProcessor.ts:272-279`

**Code:**
```typescript
} catch (error: unknown) {
  if (error instanceof TemplateContractError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `Transform phase failed for ${yamlConfig.id}, continuing without upstream variables:`,
    message,
  );
}
```

**Why this is a problem:**

This catch block swallows ALL non-TemplateContractError errors. This hid a critical bug where `readUpstreamDiscoveryVariables` called a deprecated function that always throws — the error was swallowed and processing continued without upstream variables, causing silent cascade failures.

**Behavior that needs fixing:**

1. `TemplateContractError` is rethrown (correct — required cascade violations propagate)
2. All other errors are swallowed with console.warn (incorrect — hides real bugs)

**What should happen:**

- Database connection errors should surface (user sees "temporary error, try again")
- Programming errors (like calling deprecated functions) should surface as bugs
- Only EXPECTED failures (like "no upstream variables found") should be handled silently

**Suggested fix:**

Create a specific `UpstreamVariableNotFoundError` for expected "no data" cases. All other errors should propagate or at minimum DM the user that cascade consumption failed.

**Priority:** High — silent error swallowing hid the deprecated function bug for months.

**Filed:** 2026-05-26 during Phase 2D discovery path audit

---

## 5. Pattern enforcement test gap for internal calls

**File:** `src/__tests__/integration/pattern-enforcement.test.ts`

**Issue:**

The `ALLOWED_FILES` list (line 351-360) includes `studyVariables.ts` to allow the deprecated function DEFINITIONS (throwing stubs). But this also allows CALLS to those deprecated functions from within the same file, like the bug at line 660.

**Suggested fix:**

The test should only allow lines that DEFINE the deprecated functions (the `export async function readDiscoveryVariables` line), not lines that CALL them. Could use more specific regex patterns:
- Allow: `export async function readDiscoveryVariables(`
- Disallow: `readDiscoveryVariables(` when not preceded by `export async function`

**Priority:** Medium — prevents regression but bug was already caught manually.

**Filed:** 2026-05-26 during Phase 2D discovery path audit

---

## Adding new scaffolding

When adding temporary code during 2B-2D:

1. Add a `SCAFFOLDING: [phase] removal deadline` comment in the code
2. Add an entry to this doc with: file path, why it exists, deletion trigger
3. Pre-write a commented-out pattern enforcement assertion
4. Reference this doc in the code comment

Do not add runtime flags or configuration switches as scaffolding discipline — they become their own technical debt.

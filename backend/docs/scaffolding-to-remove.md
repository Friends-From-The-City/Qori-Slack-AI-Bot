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
- `helpers/slack/commands/briefHandler.ts` ✅
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

## 2. `briefHandler` study creation without project_id

**File:** `src/helpers/slack/commands/briefHandler.ts:259`

**What the code does:**
When a user approves a brief and clicks "Create Study from Brief", this code path calls `addResearchStudyWithRoles()` to create the study record.

**Why it's broken:**
In 2B step 5, `StudyInput` was updated to require `project_id`. The function now throws at runtime:
```
"project_id is required to create or update a study"
```

The handler doesn't have project context to pass.

**Runtime impact:**
Study creation from briefs is broken. Users will see an error when trying to create a study from an approved brief.

**Deletion trigger:**
Phase 2D, when `briefModalOpener` and `briefHandler` entry modal pass `project_id` in `private_metadata`.

**Pattern enforcement:**
The typecheck error at line 259 will clear once `project_id` is passed to `addResearchStudyWithRoles`.

---

## 3. `loadDiscoveryArtifacts` team-based lookup

**File:** `src/helpers/discoveryLoader.ts`

**Function signature:**
```typescript
loadDiscoveryArtifacts(team: string): Promise<DiscoveryArtifact[]>
```

**Why it exists:**
Discovery loading currently uses `team` string to find artifacts via `readDiscoveryVariables(team, type)`. The FK-based alternative `readDiscoveryVariablesByProject` requires `projectId`, but the callers don't have project context yet.

**Deletion trigger:**
Phase 2C adds channel-project binding. After that, callers will have access to `projectId` via channel context.

**Pattern enforcement assertion:**
Located in `src/__tests__/integration/pattern-enforcement.test.ts`, in the ALLOWED_FILES list. Remove `'discoveryLoader.ts'` from the list after migration.

**Migration steps:**
1. Update function signature to `loadDiscoveryArtifacts(projectId: number)`
2. Replace `readDiscoveryVariables(team, type)` with `readDiscoveryVariablesByProject(projectId, type)`
3. Update callers to pass `projectId` from channel context

---

## Adding new scaffolding

When adding temporary code during 2B-2D:

1. Add a `SCAFFOLDING: [phase] removal deadline` comment in the code
2. Add an entry to this doc with: file path, why it exists, deletion trigger
3. Pre-write a commented-out pattern enforcement assertion
4. Reference this doc in the code comment

Do not add runtime flags or configuration switches as scaffolding discipline — they become their own technical debt.

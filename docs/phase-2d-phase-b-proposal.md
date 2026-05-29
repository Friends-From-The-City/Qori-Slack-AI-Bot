# Phase 2D Phase B Proposal

**Date:** 2026-05-27
**Status:** Discovery complete, awaiting scope decision

## Summary

Phase B applies the Phase A project-context pattern to the Plan and Discussion Guide handlers. The key change: replace `resolveStudyFromName` (deprecated name-based lookup) with `projectId` passed through modal metadata, enabling FK-based cascade operations.

---

## Current State Audit

### planHandler.ts

**Location:** `backend/src/helpers/slack/commands/planHandler.ts`

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Study resolution | Uses `resolveStudyFromName(studyName)` (line 67) | Deprecated pattern — should use projectId from metadata |
| Metadata extraction | `{ channelId, studyName, userId }` from `view.private_metadata` (line 59) | Missing `projectId` |
| VariableContext | Built from `resolved.projectId` (line 72) | Should come from metadata |
| Target channel | Uses `getProjectById(projectId)` (line 77-78) — correct pattern | projectId comes from wrong source |

### planModalOpener.ts

**Location:** `backend/src/helpers/slack/commands/modal-openers/planModalOpener.ts`

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Study resolution | Uses `resolveStudyFromName(preselectStudyName)` (line 72) | Should use `getStudyById(studyId)` |
| Input | Gets studyName from `body.view.state.values` select option (line 52) | Also has studyId in `value` — unused for project lookup |
| Metadata passed | `{ studyName, studyId, userId }` (lines 103-108) | Missing `projectId` |
| VariableContext | Built from `resolved.projectId` (line 89) | Ephemeral — not passed to submission |

### discussionGuideHandler.ts (opener + submission)

**Location:** `backend/src/helpers/slack/commands/discussion-guide/discussionGuideHandler.ts`

| Aspect | Current State | Gap |
|--------|--------------|-----|
| Opener study resolution | Uses `resolveStudyFromName(studyName)` (line 126) | Deprecated |
| Opener metadata passed | `{ ...meta, studyName, studyId, userId }` (lines 171-176) | Missing `projectId` |
| Submission study resolution | Uses `resolveStudyFromName(studyName)` again (line 302) | Redundant + deprecated |
| Submission VariableContext | From `resolved.projectId, resolved.studyId` (line 305) | Should come from metadata |
| Target channel | Uses `getProjectById(resolved.projectId)` (line 310-311) | Correct pattern, wrong source |

### Entry Point: studySetupModal

**Location:** `backend/src/helpers/slack/ui/studySetupModal.ts`

The `/qori-plan` command opens `studySetupModalPlanStudy` — a study picker that shows all studies created by the user (via `getStudiesByUser`).

**Key observations:**
1. Passes only `{ channelId }` in metadata (line 34)
2. Study list comes from `getStudiesByUser(user_id)` which does NOT include `project_id` (see service line 162)
3. Select options include `studyId` as `value` (line 27) — this is the hook for fixing

**Architectural difference from Phase A:**
- Brief/Discover: channel-bound → project context from channel
- Plan/Discussion Guide: user-scoped study list → any study across all projects

---

## Phase A Reference Pattern

### briefHandler.ts (reference)

```typescript
// lines 200-221 — Phase A pattern

// 1. Parse typed metadata from modal
let meta: BriefEntryModalMetadata;
try {
  meta = JSON.parse(view.private_metadata || '{}') as BriefEntryModalMetadata;
} catch { ... }

const { channelId, projectId, projectName, projectSlug } = meta;

// 2. Validate required metadata
if (!projectId || !projectSlug) {
  console.error('Missing project context in brief modal metadata');
  return;
}

// 3. Resolve target channel (project's bound channel > trigger channel)
const projectForChannel = await getProjectById(projectId);
const targetChannel = projectForChannel?.channel_id || channelId;

// 4. Study operations use projectId from metadata, not name lookup
let study = await getStudyByProjectAndName(projectId, studyName);

// 5. VariableContext built from metadata
const variableContext: VariableContext = { projectId, studyId };
```

### discoverHandler.ts (reference)

```typescript
// lines 242-256 — Channel-bound entry point

const project = await getProjectByChannelId(channelId);
if (!project) {
  await client.chat.postEphemeral({
    channel: channelId,
    user: command.user_id,
    text: `This channel isn't linked to a project yet...`,
  });
  return;
}

// lines 301-305 — Metadata includes projectId
const meta: DiscoverMeta = {
  channelId,
  projectId: project.id,
  projectSlug: project.slug,
};

// line 529 — VariableContext from metadata
const variableContext: VariableContext = { projectId };
```

---

## Scope Options

### Option A: Minimal (project context wiring only) — RECOMMENDED

**Changes:**

1. **planModalOpener.ts**
   - Extract `studyId` from `selectedFromView.value` (already available)
   - Call `getStudyById(studyId)` instead of `resolveStudyFromName(studyName)`
   - Pass `{ channelId, studyName, studyId, projectId }` in metadata

2. **planHandler.ts**
   - Extract `projectId` from metadata
   - Remove `resolveStudyFromName` call
   - Build `VariableContext` from metadata directly
   - Study lookup via `getStudyById(studyId)` — already have studyId from metadata

3. **discussionGuideHandler.ts opener**
   - Same pattern as planModalOpener
   - Pass `projectId` in metadata to submission

4. **discussionGuideHandler.ts submission**
   - Extract `projectId` from metadata
   - Remove `resolveStudyFromName` call
   - Build `VariableContext` from metadata

**Files touched:** 3 (planModalOpener, planHandler, discussionGuideHandler)

**Reasoning:**
- Matches Phase A pattern exactly
- Removes deprecated `resolveStudyFromName` usage
- Does not require channel-binding these commands (preserves current UX)
- Backlog items for these handlers are out of scope (75-minute, task→topic, materials & links)

### Option B: Bundled

No additional bundling recommended. The backlog items are either:
- **Done:** desk research/stakeholder/survey removal, execution risks decision, study name readonly, cascade warning
- **Out of scope:** 75-minute session length (YAML/extraction), task→topic rename (YAML semantics), materials & links (new field)

---

## Risks

### 1. Study ID Parsing

The studySetupModal passes `String(s.id)` as the option value. The openers will need to parse this back to a number for `getStudyById`.

**Mitigation:** `parseInt(preselectStudyId, 10)` with validation.

### 2. getStudiesByUser Does Not Include project_id

Currently `getStudiesByUser` doesn't return `project_id`. The fix path requires an additional database call (`getStudyById`) in the modal opener.

**Alternative considered:** Add `project_id` to `getStudiesByUser` attributes → rejected because it would require changing the modal builder to pass projectId, which is more invasive.

### 3. Latent Name Collision Bugs

`resolveStudyFromName` could return the wrong study if two projects have studies with the same name. This is unlikely but architecturally unsound.

**Mitigation:** Phase B fixes this by using studyId-based lookup.

### 4. Cascade Variable Load from Wrong Project

If projectId were passed incorrectly, cascade variables would load from the wrong project. This would cause silent content drift.

**Mitigation:** Explicit validation that `study.project_id === projectId` after lookup.

---

## Verification Protocol

"Phase B done" means:

### Code-Level

1. **No `resolveStudyFromName` usage** in:
   - `planHandler.ts`
   - `planModalOpener.ts`
   - `discussionGuideHandler.ts`

2. **Metadata contracts include projectId**:
   - Plan modal opens with `{ channelId, studyName, studyId, projectId }`
   - Discussion guide modal opens with same

3. **VariableContext built from metadata** (not from db lookup):
   - `const variableContext: VariableContext = { projectId, studyId };` where both values come from `view.private_metadata`

### Content-Trace Level (matches Phase B-0)

1. Run `/qori-plan` → Create plan
   - Plan output includes correct cascade variables from the study's brief
   - Output file lands in correct project folder

2. Run `/qori-plan` → Create discussion guide
   - Guide output pre-fills from correct brief cascade
   - Output file lands in correct study folder

3. Create two projects with same-named studies
   - `/qori-plan` from each produces correct project-specific output
   - No cross-contamination of cascade variables

### Pattern Enforcement Test

Add/enable assertion in `pattern-enforcement.test.ts`:
```typescript
test('Phase B handlers do not use resolveStudyFromName', async () => {
  const handlers = [
    'planHandler.ts',
    'planModalOpener.ts',
    'discussionGuideHandler.ts'
  ];
  for (const handler of handlers) {
    const content = await fs.readFile(`src/helpers/slack/commands/${handler}`, 'utf8');
    expect(content).not.toMatch(/resolveStudyFromName/);
  }
});
```

---

## Recommendation

**Proceed with Option A (Minimal).**

Phase A established the pattern; Phase B applies it. The backlog items are separable — they don't touch the same code paths as project context wiring.

---

## Open Questions

1. Should we also update the `StudySetupModalMetadata` interface to include `studyId` and `projectId` for type safety, even though those are populated by the openers not the initial modal?

2. Should the discussion guide opener flow (which opens via action from studySetupModal) also validate that the study belongs to a project? Currently it just validates study exists.

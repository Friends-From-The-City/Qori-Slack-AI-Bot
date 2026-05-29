# Phase B-0.7: Research Request Flow Removal Plan

**Status:** Awaiting approval
**Date:** 2026-05-29
**Author:** Claude (audit)

---

## Decision

The research-request intake-and-conversion flow is being removed entirely. The concept (stakeholder submits request → triaged → becomes study) is not needed.

---

## 1. Command/Entry Points

### 1.1 `/qori-request` command registration

**Finding:** The command handler exists but is **NOT registered** in events.ts.

- `requestResearchHandler.ts:44` defines `requestResearchHandler()` for `/qori-request`
- **No registration found** in `events.ts` — grep for `qori-request`, `request_research`, `requestResearch` returns no matches
- The handlers are dead code — exported but never wired up

**Action:** REMOVE — delete the handler file entirely

### 1.2 Slack action registrations

**Finding:** Request-related actions also NOT registered.

| Action ID | Handler | Registered? |
|-----------|---------|-------------|
| `request_research_modal` (view) | `handleRequestResearchSubmission` | **No** |
| `create_brief_from_request` | `handleCreateBriefFromRequest` | **No** |
| `create_study_from_request` | `handleCreateStudyFromRequest` | **No** |

**Action:** REMOVE — these handlers are in requestResearchHandler.ts, delete with the file

### 1.3 Commands reference listing

**File:** `qoriMainHandler.ts:39`
```typescript
{
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: '*`/qori-request`* → Stakeholder submits research request'
  }
},
```

**Action:** REMOVE — delete this block from the commands reference

---

## 2. Handlers & Modals

### 2.1 requestResearchHandler.ts — PURE REMOVAL

**Path:** `src/helpers/slack/commands/requestResearchHandler.ts`

**Contents (all request-specific):**
- `requestResearchHandler()` — /qori-request command
- `handleRequestResearchSubmission()` — modal submission
- `handleCreateBriefFromRequest()` — button handler
- `handleCreateStudyFromRequest()` — button handler

**Imports to note:**
- Imports `requestResearchModal` (also being removed)
- Imports `createStudyFromRequestModal` (also being removed)
- Imports `researchBriefModal` (shared, keep)

**Action:** REMOVE — delete entire file

### 2.2 requestResearchModal.ts — PURE REMOVAL

**Path:** `src/helpers/slack/ui/requestResearchModal.ts`

**Contents:** Single export `requestResearchModal` — the modal definition for /qori-request

**Action:** REMOVE — delete entire file

### 2.3 createStudyFromRequestModal.ts — PURE REMOVAL

**Path:** `src/helpers/slack/ui/createStudyFromRequestModal.ts`

**Contents:** Single export `createStudyFromRequestModal()` — study creation modal pre-filled from request

**Action:** REMOVE — delete entire file

### 2.4 requestChangesHandler.ts — PRESERVE (Step 3 work)

**Path:** `src/helpers/slack/requestChangesHandler.ts`

**CAUTION:** This file is NOT part of the research-request intake flow. It handles:
- `handleApprove()` — approve plan/brief/discussion
- `handleApproveSubmission()` — approval confirmation (includes Step 3 button creation)
- `handleRequestChanges()` — request changes to plan/brief
- `handleRequestChangesSubmission()` — changes submission

The "request" in the name refers to "request changes" (to a plan/brief), not "research request intake."

**Step 3 work location:** Lines 127-133 — the `create_research_plan_from_brief` button with `studyId` and `projectId`

**Action:** PRESERVE — no changes, Step 3 work survives

---

## 3. createStudyHandler — MODIFY (Shared Code)

**Path:** `src/helpers/slack/commands/createStudyHandler.ts`

### Current callers

| Caller | Flow | Uses |
|--------|------|------|
| `/qori-start` | `startResearchHandler()` | `isFromRequest: false` |
| `create_study_from_request` | `handleCreateStudyFromRequest()` | `isFromRequest: true` |
| `create_study_from_brief` | `openStudyFromBrief()` | `isFromBrief: true` (via createStudyModal) |

After removal: Only `/qori-start` and `create_study_from_brief` remain.

### Request-specific code to remove

**Lines 25-31 — Metadata interface:**
```typescript
isFromRequest: boolean;
requestData?: {
  project_title: string;
  prepared_by: string;
  requestedBy?: string;
};
```
→ MODIFY: Remove `requestData` interface, simplify `isFromRequest` handling

**Lines 140, 142:**
```typescript
const { channelId, userId, isFromRequest, requestData } = metadata;
console.log('📊 Parsed metadata:', { channelId, userId, isFromRequest, hasRequestData: !!requestData });
```
→ MODIFY: Remove requestData destructuring and logging

**Lines 184-186 — Description:**
```typescript
description: isFromRequest
  ? `Created from research request: ${requestData!.project_title}`
  : `Research study created by ${user.real_name}`,
```
→ MODIFY: Remove request branch, keep brief branch if needed or simplify

**Lines 199-201 — source_request:**
```typescript
if (isFromRequest && requestData) {
  payload.source_request = requestData;
}
```
→ REMOVE: This block entirely (note: `source_request` column doesn't exist in schema anyway)

**Lines 221-226 — Notification blocks:**
```typescript
if (isFromRequest && requestData) {
  notificationBlocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Original Request:* ${requestData.project_title}...` },
  });
}
```
→ REMOVE: This block entirely

**Lines 247-258 — Requester notification:**
```typescript
if (isFromRequest && requestData?.requestedBy) {
  try {
    await client.chat.postMessage({
      channel: requestData.requestedBy,
      text: `✅ Great news! Your research request has been approved...`,
    });
  } catch (requesterError) { ... }
}
```
→ REMOVE: This block entirely

**Lines 261-263 — Success message:**
```typescript
const successMessage = isFromRequest
  ? `✅ Study *${studyName}* has been created from the research request!`
  : `✅ Study *${studyName}* has been created successfully!`;
```
→ MODIFY: Remove ternary, just use the non-request message

### Code to PRESERVE

The `create_study_from_brief` flow uses `createStudyModal({ briefData })`, not `isFromRequest`. The brief flow:
1. `openStudyFromBrief()` in `briefToStudyHandler.ts` opens modal
2. Modal uses `briefData` path, not `requestData` path
3. Submission handler checks `isFromRequest` but brief flow sets `isFromRequest: false`

**Wait — clarification needed:** Looking at `briefToStudyHandler.ts:250`:
```typescript
await client.views.open({
  ...createStudyModal({ briefData }),
  private_metadata: JSON.stringify({
    channelId,
    userId,
    isFromBrief: true,  // NOT isFromRequest
    briefData,
  }),
});
```

And `createStudyHandler.ts` metadata interface doesn't have `isFromBrief`. The brief flow appears to use `createStudyModal({ briefData })` to build the view but the submission handler only checks `isFromRequest`.

**Recommendation:** After removing request code, audit the brief→study flow to ensure it still works. The `isFromRequest` flag in metadata determines handler behavior, but brief flow sets `isFromBrief` which isn't checked.

---

## 4. createStudyModal.ts — MODIFY (Shared Code)

**Path:** `src/helpers/slack/ui/createStudyModal.ts`

### Request-specific code to remove

**Lines 8-16 — RequestData interface:**
```typescript
interface RequestData {
  project_title?: string;
  projectTitle?: string;
  prepared_by?: string;
  submittedBy?: string;
  requestedBy?: string;
  briefUrl?: string;
  timelineNeeded?: string;
}
```
→ KEEP for now — BriefData maps to this format (line 39-44). After request removal, consider renaming to `PrefillData` for clarity.

**Lines 28-31 — Options interface:**
```typescript
interface CreateStudyModalOptions {
  requestData?: RequestData;  // ← Remove this
  briefData?: BriefData;      // ← Keep this
}
```
→ MODIFY: Remove `requestData` option

**Lines 34-35:**
```typescript
const { requestData, briefData } = options;
const isFromRequest = !!requestData;
```
→ MODIFY: Remove `requestData` destructuring and `isFromRequest`

**Lines 229-233:**
```typescript
const userDisplayName = isFromRequest
  ? requestData!.submittedBy || requestData!.prepared_by
  : briefData!.userDisplayName || prefillData!.prepared_by || briefData!.requestor_name;
const userId = isFromRequest ? requestData!.requestedBy : prefillData!.requestedBy;
```
→ MODIFY: Remove `isFromRequest` branches, simplify to brief-only path

---

## 5. Templates

### 5.1 research_request.yaml — PURE REMOVAL

**Path:** `config/prompts/research_request.yaml`

**Referential integrity check:**
```bash
grep -r "consumes.*research_request\|source.*research_request" config/prompts/
# Result: No matches
```

No other template consumes from `research_request`. Safe to delete.

**Action:** REMOVE — delete entire file

### 5.2 pattern-enforcement.test.ts

**Path:** `src/__tests__/integration/pattern-enforcement.test.ts:575-576`

```typescript
// Skip research_request (separate intake flow)
if (yamlFilename === 'research_request.yaml') continue;
```

**Action:** REMOVE — delete these two lines (template won't exist to skip)

---

## 6. Database — FLAG, DO NOT DROP

### Schema check

```bash
grep -r "source_request\|research_request\|request_" src/database/
# Result: No matches
```

**Finding:** No database schema for requests. The `payload.source_request` in createStudyHandler is dead code — the column doesn't exist.

### Existing data

The `research-requests/00-requests/` folder pattern may have test files in GitHub repos. These are:
- Documentation/test artifacts
- Not database rows
- Low stakes to leave orphaned

**Action:** FLAG for manual cleanup — no schema changes needed

---

## 7. Folder Structure

### Output path

`research_request.yaml` writes to `{sanitizedTitle}/research-requests/00-requests/`

After removal:
- No handler creates this folder
- Existing folders in test/GitHub repos become orphaned
- Low impact — test data only

**Action:** NOTE — orphaned folders acceptable, no automated cleanup needed

---

## 8. Documentation References

Files referencing `/qori-request` or research request flow:

| File | Action |
|------|--------|
| `ALPHA_POLISH.md:27,39-40` | REMOVE lines |
| `README.md:405` | REMOVE line |
| `test/README.md:22` | REMOVE line |
| `docs/template-inventory.md:58,125` | REMOVE lines |
| `docs/v1.1-followups.md:151-159` | REMOVE section |
| `yaml-audit-2026-04-24.md:275-277,577` | REMOVE sections |
| `docs/internal/database-schema.md:24` | REMOVE line |
| `docs/phase-2d-phase-b-07-stub.md` | REMOVE entire file (superseded by this plan) |
| `docs/help/getting-started.md:30,67` | REMOVE lines |
| `docs/help/faq.md:149` | REMOVE line |
| `docs/help/commands.md:17-31` | REMOVE section |
| `docs/research-brief-translation-plan.md:110` | REMOVE line |
| `docs/dev-plan-2026-01-30.md:112` | REMOVE line |
| `docs/modals-migration-plan.md:14,109` | REMOVE lines |
| `docs/yaml-fix-plan.md:68-77,107-116` | REMOVE sections |
| `docs/phase-2d-phase-b-05-proposal.md:442,567` | REMOVE lines |
| `docs/folder-migration-plan.md:29,48,94` | REMOVE lines |
| `test/va-health-benefits-mobile-app/qori-request/` | REMOVE directory |
| `test/va-health-benefits-mobile-app/README.md:18` | REMOVE line |
| `docs/audits/system-architecture-audit.md:504` | REMOVE mention |

---

## 9. Summary: Actions by Category

### PURE REMOVAL (delete entirely)

| Item | Path |
|------|------|
| Handler | `src/helpers/slack/commands/requestResearchHandler.ts` |
| Modal | `src/helpers/slack/ui/requestResearchModal.ts` |
| Modal | `src/helpers/slack/ui/createStudyFromRequestModal.ts` |
| Template | `config/prompts/research_request.yaml` |
| Test data | `test/va-health-benefits-mobile-app/qori-request/` |
| Stub doc | `docs/phase-2d-phase-b-07-stub.md` |

### MODIFY (remove request-specific code, preserve shared)

| Item | Path | Preserve |
|------|------|----------|
| Handler | `createStudyHandler.ts` | `/qori-start` flow, brief→study flow |
| Modal | `createStudyModal.ts` | `briefData` handling |
| Commands ref | `qoriMainHandler.ts` | All other commands |
| Test | `pattern-enforcement.test.ts` | All other assertions |

### PRESERVE (no changes)

| Item | Path | Reason |
|------|------|--------|
| Handler | `requestChangesHandler.ts` | Step 3 work — NOT request-intake-related |

### FLAG FOR LATER (no action now)

| Item | Notes |
|------|-------|
| Database schema | No request schema exists — nothing to drop |
| Orphaned GitHub folders | `research-requests/00-requests/` in test repos — manual cleanup if desired |

---

## 10. Verification Protocol (Post-Removal)

### No dangling registrations

```bash
# Should return NO matches
grep -r "qori-request\|request_research_modal\|create_brief_from_request\|create_study_from_request" src/helpers/slack/events.ts
```

### No orphaned references

```bash
# Should return NO matches in src/
grep -rn "requestResearchHandler\|createStudyFromRequestModal\|requestResearchModal\|research_request\.yaml" src/

# Should return only this plan doc + removal commits in git
grep -rn "research_request" --include="*.ts" --include="*.js" .
```

### Brief→study flow still works

1. Approve a brief
2. Click "Create Research Study" button (if study doesn't exist)
3. Verify modal opens with brief data pre-filled
4. Submit → verify study created successfully

### Typecheck + tests green

```bash
npm run typecheck
npm test
npm run test:integration
```

### B-0.6 surface simplified

After removal, `createStudyHandler.handleCreateStudySubmission` has two callers:
1. `/qori-start` command → `startResearchHandler()`
2. `create_study_from_brief` action → `openStudyFromBrief()`

The `isFromRequest` path is eliminated, simplifying the handler.

---

## 11. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|:----------:|------------|
| Step 3 requestChangesHandler accidentally modified | Low | Explicit preserve flag, separate from request flow |
| Brief→study flow breaks | Medium | Audit `isFromBrief` vs `isFromRequest` handling, test post-removal |
| Orphaned imports cause build failures | Low | Typecheck catches immediately |
| Documentation drift | Medium | Bulk-update docs in same PR |

---

## Approval Checklist

- [ ] requestChangesHandler.ts PRESERVED (Step 3 work)
- [ ] createStudyHandler shared code PRESERVED (brief flow)
- [ ] createStudyModal briefData handling PRESERVED
- [ ] All PURE REMOVAL items identified
- [ ] Documentation cleanup list complete
- [ ] Verification protocol adequate

**Awaiting approval to execute.**

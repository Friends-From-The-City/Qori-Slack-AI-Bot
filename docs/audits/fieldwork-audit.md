# /qori-fieldwork Audit

**Date:** 2026-05-21
**Purpose:** Pre-design state-of-the-world audit before project restructure
**Scope:** What was consolidated, current shape, anti-pattern check

---

## 1. What Was Consolidated

### Merged Commands

The `/qori-fieldwork` command (commit `8e3e411e`, May 8, 2026) consolidated five previously standalone commands:

| Former Command | Purpose |
|----------------|---------|
| `/qori-participants` | Add/view participant list for a study |
| `/qori-update-participant` | Change participant status or session details |
| `/qori-observe` | Invite observers to sessions |
| `/qori-outreach` | Create templated outreach messages |
| `/qori-notes` | Upload session transcripts or manual notes |

### Architecture Change

**Before consolidation:**
- Each command opened its own top-level modal
- Handlers lived in separate command files
- No metadata threading between related actions
- Post-action flows had no parent refresh mechanism

**After consolidation:**
- Single `/qori-fieldwork` command opens a read-only dashboard
- Dashboard shows 3 sections: Outreach stats, Participant counts, Observer counts
- Each section has an action button that pushes a sub-modal (not replaces)
- Sub-modal submissions trigger original handlers with added dashboard refresh
- Parent dashboard refreshes via `views.update()` using stored `root_view_id`

### Study Picker Pattern

- If user has 1 study: Dashboard opens directly
- If user has multiple studies: Study picker modal opens first, then dashboard
- Active study pre-filled from `slack_user_state` table (added in this consolidation)

---

## 2. Current Shape

### Handler: `fieldworkHandler.ts` (460 lines)

**Entry point:** `fieldworkHandler()` — Command handler
- Fetches user's studies via `getStudiesByUser(userId)`
- If 1 study → opens dashboard directly
- If multiple → opens study picker, then dashboard via submission handler

**Study picker:** `handleFieldworkStudyPickerSubmit()`
- Receives selected study ID from modal
- Calls `setActiveStudy()` to save to `slack_user_state`
- Fetches fresh stats and opens dashboard

**Sub-modal action dispatchers:**
1. `handleFieldworkAddParticipant()` — Pushes `addParticipantModal`
2. `handleFieldworkUpdateStatus()` — Pushes `updateParticipantStatusModal`
3. `handleFieldworkObserve()` — Pushes `addObserverModal`
4. `handleFieldworkOutreach()` — Pushes `participantOutreachModal`
5. `handleFieldworkUploadNotes()` — Pushes `sessionNotesModal`

**Helper functions:**
- `buildDashboardContext()` — Derives stats from participant list
- `fetchAndRenderDashboard()` — Queries stats and updates view
- `refreshDashboardAfterAction()` — Generic wrapper for post-submission refresh

### Modal: `fieldworkDashboardModal.ts` (191 lines)

**Two builders:**

1. **`buildFieldworkDashboard()`** — Main dashboard
   - Title: "Fieldwork"
   - 6 blocks: Context (study name + timestamp), 3 stat sections with action buttons, divider, bottom actions
   - Button values are JSON: `{ studyId, studyName }`
   - Private metadata: `{ channelId, userId, studyId, studyName }`

2. **`buildFieldworkStudyPicker()`** — Study selection
   - Single input block with static_select of studies
   - Pre-selects active study if available

### Data Flow

```
User types /qori-fieldwork
         ↓
   fieldworkHandler()
         ↓
   studies = getStudiesByUser(userId)
         ↓
   ├─ If 1 study → Open dashboard directly
   │
   └─ If >1 → Open picker
              ↓
       handleFieldworkStudyPickerSubmit()
              ↓
       setActiveStudy(userId, studyId)
              ↓
       Open dashboard for selected study
              ↓
   User clicks action button (e.g., "Add participant")
              ↓
   handleFieldworkAddParticipant() action dispatcher
              ↓
   client.views.push() → Opens sub-modal
              ↓
   User fills form and submits
              ↓
   Original handler (e.g., handleAddParticipantSubmit)
              ↓
   If rootViewId in metadata:
      refreshDashboardAfterAction()
      └─ views.update() → Parent dashboard refreshes
```

### Services Used

- `study_participant.service.ts`: `getParticipantStats()`, `getParticipantsByStudy()`
- `session_observer.service.ts`: `getObserverStats()`, `buildSessionsWithCounts()`
- `research_study.service.ts`: `getStudiesByUser()`
- `slack-user-state.service.ts`: `getActiveStudy()`, `setActiveStudy()`

### Event Registration (events.ts)

**Command:**
```typescript
slackApp.command('/qori-fieldwork', fieldworkHandler)
```

**Views:**
```typescript
slackApp.view('fieldwork_study_picker', handleFieldworkStudyPickerSubmit)
```

**Actions:**
```typescript
slackApp.action('fieldwork_add_participant', handleFieldworkAddParticipant)
slackApp.action('fieldwork_update_status', handleFieldworkUpdateStatus)
slackApp.action('fieldwork_observe', handleFieldworkObserve)
slackApp.action('fieldwork_outreach', handleFieldworkOutreach)
slackApp.action('fieldwork_upload_notes', handleFieldworkUploadNotes)
```

---

## 3. Anti-Pattern Check

### A. Metadata Threading Complexity

**Issue:** Private metadata is serialized/deserialized at 5+ points in the callstack, creating fragile JSON contracts.

```typescript
// Dashboard creation
dashboard.private_metadata = JSON.stringify({ channelId, userId, studyId, studyName })

// Button action dispatcher extracts it
const dashboardMeta = JSON.parse(body.view?.private_metadata || '{}')

// Pushes sub-modal with extended metadata
private_metadata: JSON.stringify({ ...dashboardMeta, studyId, studyName, rootViewId: body.view?.id })

// Sub-modal handler extracts it again
const { rootViewId, studyId, ...meta } = JSON.parse(view.private_metadata)
```

**Risk:** Silent failures if field names change or metadata is corrupted. No validation of required fields.

### B. Circular Dependency (Resolved, But Symptomatic)

**History:** Commit `4088ddb7` fixed a circular dependency between `fieldworkHandler` and `addObserverHandler`.

**Root cause:** `fieldworkHandler` tried to call a function defined in `addObserverHandler`, which imported `fieldworkHandler` to call `refreshDashboardAfterAction()`.

**Solution:** Moved `buildSessionsWithCounts()` to `session_observer.service.ts`.

**Observation:** This hints at tight coupling—the two handlers share concern about session selection but couldn't directly depend on each other.

### C. Modal Builder Dispatch Pattern (Non-standard)

**Issue:** Sub-modal action dispatchers are registered as `action` handlers but push new modals instead of handling form values. This conflates two concerns:
1. "Dispatch" (push a sub-modal)
2. "Action" (handle a button press)

```typescript
// In events.ts:
slackApp.action('fieldwork_add_participant', handleFieldworkAddParticipant)

// In fieldworkHandler.ts:
async function handleFieldworkAddParticipant({ ack, body, client }) {
  // Not a typical action handler—doesn't interact with form values
  // Instead, it fetches data and pushes a NEW VIEW
  await client.views.push({ trigger_id: body.trigger_id, view: ... })
}
```

**Contrast:** Other patterns in the codebase register these as `action` + a separate button click, or use a single modal submission handler.

### D. Inconsistent Study Dropdown Injection

**Issue:** Study dropdown is added dynamically to sub-modals in different ways:

**Pattern 1** (`handleFieldworkOutreach`):
```typescript
blocks.unshift({  // Prepend to top
  type: 'input',
  block_id: 'study_select_block',
  ...
})
```

**Pattern 2** (`handleFieldworkUpdateStatus`):
```typescript
// Find existing block and mutate it
const studyBlockIdx = blocks.findIndex((b) => b.block_id === 'study_selection_block')
if (studyBlockIdx !== -1) {
  blocks[studyBlockIdx] = { ... }
}
```

**Risk:** Different block IDs (`study_select_block` vs. `study_selection_block`), different insertion points, different element action IDs.

### E. Dual-Purpose Button Values (JSON Packing)

**Issue:** Button `value` field carries JSON data instead of a simple identifier:

```typescript
{
  type: 'button',
  action_id: 'fieldwork_add_participant',
  value: JSON.stringify({ studyId: study.id, studyName: study.name })
}
```

**Cons:**
- Slack button values have size limits (~255 bytes)
- No schema validation—malformed JSON silently fails
- Different from the Slack idiom of storing IDs and fetching data

### F. Non-Fatal Error Handling in Parent Refresh

**Pattern:**
```typescript
async function refreshDashboardAfterAction(client, rootViewId, studyId, ...) {
  try {
    // ...
  } catch (error) {
    console.error('refreshDashboardAfterAction error:', message)
    // Non-fatal — the sub-modal action already succeeded
  }
}
```

**Issue:** If the refresh fails, user sees stale data on the parent dashboard but the sub-modal action already succeeded. No error feedback to user.

### G. Type Annotation Gap

**Issue:** `refreshDashboardAfterAction()` parameter is typed as `any`:

```typescript
async function refreshDashboardAfterAction(
  client: any,  // Should be WebClient
  rootViewId: string,
  ...
)
```

This survived the TypeScript migration.

### H. Builder Pattern Inconsistency

**Issue:** Modal builders exist in two patterns:
- `fieldworkDashboardModal.ts` exports builder functions
- `addParticipantModal` is a static export, not a builder function

This is inconsistent with the codebase's trend toward builder functions.

---

## 4. Database & Model Dependencies

### Models Referenced

- `StudyParticipant` — Participant records (status_select, scheduled_date, etc.)
- `SessionObserver` — Observer assignments to sessions
- `ResearchStudy` — Study metadata
- `SlackUserState` — Active study per Slack user (new in consolidation)

### Key Queries

**Participant stats** (`getParticipantStats(studyId)`):
- Counts participants with status = confirmed, contacted, etc.
- Returns: `{ total_participants_count, confirmed_sessions_count, ... }`

**Observer stats** (`getObserverStats(studyId)`):
- Counts observer records grouped by status
- Returns: `{ total_observers, confirmed_observers, ... }`

---

## 5. What Would Break Under Refactoring

1. **Field renames** in private_metadata (fragile JSON contracts)
2. **Study dropdown block IDs** (different per sub-modal)
3. **Button value JSON schema** (no validation)
4. **rootViewId threading** (5+ serialization points)
5. **Participant status enum** (values must match DB)
6. **Service method signatures** (getParticipantStats, getObserverStats)

---

## 6. Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| **Consolidation** | Complete | 5 commands → 1 dashboard |
| **TypeScript Migration** | Complete | Some `any` gaps remain |
| **Pattern Consistency** | Mixed | Metadata threading complex |
| **Error Handling** | Silent failures | Parent refresh non-fatal |
| **Test Coverage** | None | No unit or integration tests for fieldwork module |
| **Coupling** | Moderate | Handlers import from each other for refresh |

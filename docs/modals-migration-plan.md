# Modals Architecture Analysis & Migration Plan

**Date:** 2026-04-29
**Status:** Investigation complete. No changes made.

---

## 1. Current State

### `config/modals/` — 26 JSON files (NOT USED AT RUNTIME)

```
config/modals/
├── analyze/          analyze_notes.json, research_request.json, synthesis.json
├── notes/            manual_notes.json, take_notes.json, upload_transcript.json
├── outreach/         follow_up.json, initial_recruitment.json, outreach_menu.json,
│                     rescheduling.json, session_confirmation.json, session_reminder.json,
│                     thank_you.json
├── participants/     add_participant.json, observer_request.json, update_participant.json
├── plan/             discussion_guide.json, plan_menu.json, research_brief.json,
│                     research_plan.json, stakeholder_interview_guide.json,
│                     upload_desk_research.json, upload_stakeholder_notes.json,
│                     upload_survey_data.json
└── report/           report_menu.json, targeted_readouts.json
```

**Zero of these files are loaded by the backend at runtime.** No `readFileSync`, `require`, or any reference to these filenames exists in backend source code. They appear to be early design specs / Block Kit Builder exports.

### `backend/src/helpers/slack/ui/` — 34 JS files (ACTIVE)

This is the runtime source of truth. 23 files in the root + 11 in `outreach/`.

---

## 2. Runtime Integration

### How modals actually work

All modals are defined as JavaScript objects or factory functions in `backend/src/helpers/slack/ui/`. They are imported into handlers and opened via `client.views.open()` or `client.views.push()`.

Three patterns exist:

**Pattern A — Static object, spread at call site:**
```js
// Modal defined as a plain object
const myModal = { type: 'modal', callback_id: '...', blocks: [...] };

// In events.js, blocks are sometimes rebuilt before opening:
await client.views.open({
  trigger_id,
  view: { ...myModal, blocks: rebuiltBlocks, private_metadata: JSON.stringify({...}) }
});
```

**Pattern B — Factory function with parameters:**
```js
// Modal is a function that builds the view object
function myModal(studies, selectedId, files) { return { type: 'modal', ... }; }

// Called at open time:
await client.views.open({ trigger_id, view: myModal(studies, selectedId, files) });
```

**Pattern C — Static object, deep-cloned and mutated by handler:**
```js
// Modal defined as static object
// Handler does: const modal = JSON.parse(JSON.stringify(staticModal));
// Then finds specific blocks by index/block_id and replaces options
```

### All 34 modal files classified

#### Fully Dynamic (factory functions — cannot be pure JSON)

| File | callback_id | Why dynamic |
|------|-------------|-------------|
| `researchSynthesisModal.js` | `research-synthesis-modal` | Study dropdown from DB, file checkboxes from DB, conditional "Load Files" button |
| `analyzeNotesModal.js` | `analyze_notes_submit` | Shows/hides study picker, session picker, file checklist based on options |
| `createStudyModal.js` | `create_study_modal` | Different blocks for request vs brief vs blank |
| `createStudyFromRequestModal.js` | `create_study_modal` | Pre-fill from request data |
| `readoutModal.js` | `readout_modal_submit` | State-driven: report type, files, team, timeline |
| `sessionNotesModal.js` | `session_notes_submit` | Two-tab manual/upload, blocks change per tab |
| `requestObserveSessionModal.js` | `request_observe_session_modal` | Session dropdown from DB |
| `requestStudyChangesModal.js` | `request_changes_plan_modal` | File checkbox list from array |
| `emailModal.js` | `email-preview` | All fields injected as params |
| `markChangesCompleteModal.js` | `mark_changes_complete_modal` | fileName/path embedded in metadata |
| `uploadNotesModal.js` | `fieldwork_upload_modal` | Participant dropdown from DB |
| `copyEmailModal.js` | `copy-email-modal` | Message body injected |

#### Static objects (could be JSON, currently spread+patched at call site)

| File | callback_id | How used |
|------|-------------|----------|
| `researchPlanGeneratorModal.js` | `research_plan_modal` | Spread with rebuilt blocks in events.js:1197 |
| `researchBriefModal.js` | `research_brief_modal` | Spread with rebuilt blocks in events.js:1433 |
| `discussionGuideModal.js` | `discussion_guide_modal` | Spread with rebuilt blocks in events.js:1733 |
| `stakeholderInterviewGuideModal.js` | `stakeholder_interview_guide_modal` | Spread with rebuilt blocks in events.js:1971, 2032 |
| `uploadDeskResearchModal.js` | `upload_desk_research_modal` | Spread with rebuilt blocks in events.js:1908 |
| `uploadStakeholderNotesModal.js` | `upload_stakeholder_notes_modal` | Spread with rebuilt blocks in events.js:2199 |
| `uploadSurveyDataModal.js` | `upload_survey_data_modal` | Spread with rebuilt blocks in events.js:2399 |
| `researchShareoutModal.js` | `research-shareout-submit` | Spread with only metadata |
| `studySetupModal.js` | `plan_study_modal` / `study-setup-modal-start-research` | Two exports, spread in events.js |

#### Static objects (deep-cloned and mutated by handler)

| File | callback_id | What handler mutates |
|------|-------------|---------------------|
| `addParticipantModal.js` | `add-participant-modal` | Study dropdown options replaced with real studies |
| `requestResearchModal.js` | `request_research_modal` | `submitted_by_block` initial_value set to user name |
| `participantOutreachModal.js` | `participant-outreach-modal` | Study dropdown unshifted at position 0 |
| `updateParticipantStatusModal.js` | `update-participant-status` | Study dropdown options replaced |

#### Fully static outreach modals (fixed structure, no mutation)

| File | callback_id |
|------|-------------|
| `followupModal.js` | `outreach_follow_up_modal` |
| `initialRecruitmentModal.js` | `outreach_initial_recruitment_modal` |
| `reschedulingRequestModal.js` | `outreach_rescheduling_modal` |
| `sessionConfirmationModal.js` | `outreach_session_confirmation_modal` |
| `sessionReminderModal.js` | `outreach_session_reminder_modal` |
| `thankyouModal.js` | `outreach_thank_you_modal` |

#### Not modals (message block builders)

| File | Purpose |
|------|---------|
| `qoriLearnModal.js` | Builds Slack message blocks, not a modal |
| `studyResultBlocks.js` | Builds result notification blocks |
| `basicInfoBlock.js` | Helper block builder for outreach |

#### Inline in events.js (not in ui/ directory)

4 small utility modals defined directly at their usage site in events.js:
- `repo-folder-subfolder-modal` — /qori-repo channel config
- `delete-study-modal` — /qori-delete confirmation
- `ask-study-modal` — disabled RAG modal
- `sync-folder-modal` — disabled sync modal

---

## 3. Divergence: JSON vs JS

**The JSON files and JS files have significantly diverged.** Key differences:

| Aspect | config/modals/ JSON | backend/src/helpers/slack/ui/ JS |
|--------|--------------------|---------------------------------|
| `callback_id` | `"synthesis"` | `"research-synthesis-modal"` |
| `callback_id` | `"research_brief"` | `"research_brief_modal"` |
| `callback_id` | `"upload_transcript"` | (no counterpart — unreferenced) |
| Block IDs | `"analysis_method_block"` | `"analysis_method_selection"` |
| Action IDs | `"study_id"` | `"study_select_synthesize"` |
| Option values | `"jtbd"` | `"jobs_to_be_done"` |

**The callback_id mismatches alone make the JSON files non-functional** — a handler listening for `"research-synthesis-modal"` would never receive a submission from a modal opened with callback_id `"synthesis"`.

**Current truth: The JS files are authoritative.** The JSON files are stale design artifacts.

---

## 4. Migration Complexity Assessment

### What "migration" means here

Unlike the YAML templates (where both copies were valid YAML and the backend just needed a path change), modals have a fundamental format gap:

- **JSON can represent static modals** — fixed blocks, no logic
- **JS is required for dynamic modals** — factory functions that build different block structures based on parameters (DB data, user state, file lists)

### Effort estimate by category

| Category | Count | Migration to JSON | Effort |
|----------|-------|------------------|--------|
| Fully dynamic (factory functions) | 12 | **Cannot be pure JSON.** Would need a hybrid: JSON template + JS runtime logic to populate dynamic sections. | L — requires a template engine or custom loader |
| Static, spread+patched at call site | 9 | **Could be JSON** but the spread+metadata pattern in events.js would need a loader function. | M — mechanical refactor + new loader |
| Static, deep-cloned+mutated | 4 | **Could be JSON** with a mutation step. Similar to above. | M |
| Fully static (outreach) | 6 | **Straightforward JSON export.** No runtime logic needed. | S |
| Inline in events.js | 4 | **Straightforward** — extract to JSON files. | XS |
| Not modals (block builders) | 3 | N/A — these aren't modals. | — |

### Total effort: M-L

The 6 static outreach modals + 4 inline utility modals = 10 easy wins (S effort).
The 9 spread+patched modals = medium refactor (need a JSON loader that handles metadata/block injection).
The 12 dynamic modals = hard (need a template system or accept that these stay as JS).

---

## 5. Sam Agent Implications

### Goal: Non-developers edit modals via Sam

Sam needs modals in a structured, editable format. JSON is ideal because:
- No syntax knowledge required beyond JSON
- Block Kit Builder can import/export JSON directly
- Changes are pure data, not code — lower risk

### Sam-editable modals (good candidates)

These 19 modals have fixed or mostly-fixed structures that could live as JSON:

| Modal | Notes |
|-------|-------|
| 6 outreach modals (follow_up, initial_recruitment, etc.) | Fully static — trivial |
| 4 inline utility modals (repo, delete, ask-study, sync) | Fully static — trivial |
| 9 spread+patched modals (research_plan, research_brief, etc.) | Static structure; the spread+metadata injection could be standardized into a loader |

**What Sam could edit:** Field labels, placeholder text, help text, option lists, block order, adding/removing static blocks.

### Modals that resist Sam editing (12 dynamic)

These build entirely different block structures based on runtime state. Sam could edit their *templates* (the base structure), but the conditional logic must stay in JS:

- `researchSynthesisModal` — file picker sections built from DB queries
- `analyzeNotesModal` — conditional show/hide of entire sections
- `sessionNotesModal` — two-tab UI with different blocks per tab
- `readoutModal` — state-driven block assembly
- `createStudyModal` — different layouts for request/brief/blank
- 7 others (see fully dynamic list above)

**Hybrid approach for dynamic modals:** Store the base template as JSON (the fixed blocks), and have JS logic that injects dynamic blocks (dropdowns, checkboxes populated from DB) at specific insertion points marked in the JSON.

---

## 6. Recommended Approach

### Phase 1: Quick wins (effort: S)

Export the 6 static outreach modals and 4 inline utility modals to `config/modals/` as JSON. Write a simple loader:

```js
function loadModal(category, name) {
  return require(`../../config/modals/${category}/${name}.json`);
}
```

This gives Sam 10 immediately editable modals.

### Phase 2: Standardize the spread+patch pattern (effort: M)

The 9 "static object, spread at call site" modals follow a consistent pattern. Refactor to:
1. Store the base modal as JSON in `config/modals/`
2. Create a `loadAndPrepareModal(category, name, { metadata, blockOverrides })` function
3. Each handler calls this instead of `{ ...importedModal, blocks, private_metadata }`

This gives Sam 19 editable modals total.

### Phase 3: Hybrid templates for dynamic modals (effort: L)

Design a convention for marking insertion points in JSON templates:
```json
{ "type": "dynamic_slot", "slot_id": "study_dropdown" }
```

JS resolves these slots at runtime. Sam can edit everything except the slots.

### Don't do yet

- Don't regenerate the `config/modals/` JSON from the JS files — the current JSON is stale and diverged. Fresh exports should come from the JS files if/when Phase 1 starts.
- Don't delete `config/modals/` yet — it's useful as a reference for what the intended structure looks like, even if the content is outdated.

---

## 7. Blocking Questions

1. **Which modals does Sam actually need to edit?** If Sam only needs to change prompt text and labels (not block structure), the YAML templates are the right editing surface — modals are just the input UI. Sam may not need to edit modals at all.

2. **Is Block Kit Builder part of the workflow?** If designers use Block Kit Builder to prototype modals, JSON round-tripping matters. If modals are always edited as code, JS is fine.

3. **Priority vs. other work:** Modal migration is not blocking any alpha functionality. The current JS approach works. This is a developer-experience improvement, not a bug fix.

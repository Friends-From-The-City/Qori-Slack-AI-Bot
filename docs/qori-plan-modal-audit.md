# /qori-plan Modal Design Audit

**Date:** 2026-05-21
**Status:** Review — no code changes until approved
**Target:** `researchPlanGeneratorModal.ts` (v5.0) + `planModalOpener.ts` + `studySetupModal.ts`

---

## 1. Current state

The `/qori-plan` flow is a two-step modal sequence:

### Step 1: Study setup modal (`studySetupModal.ts`)

The researcher runs `/qori-plan` and gets a "hub" modal listing their studies and available actions.

```
┌─────────────────────────────────────────────────────────┐
│  Plan your study                              [Close]   │
├─────────────────────────────────────────────────────────┤
│  Select a study, then create documents or upload files. │
│  Start a new study with /qori-brief.                    │
│ ─────────────────────────────────────────────────────── │
│  Study                                                  │
│  ┌───────────────────────────────────┐                  │
│  │ Select a study...              ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  *Create Documents*                                     │
│                                                         │
│  *Research plan*                            [Create]    │
│  Timeline, logistics, and session design                │
│                                                         │
│  *Discussion guide*                         [Create]    │
│  Conversation guide for user research sessions          │
│                                                         │
│  *Stakeholder interview guide*              [Create]    │
│  Questions for PMs, engineers, policy SMEs              │
│ ─────────────────────────────────────────────────────── │
│  *Upload Files*                                         │
│                                                         │
│  *Desk research*                            [Upload]    │
│  Reports, competitive analysis, background docs         │
│                                                         │
│  *Stakeholder notes*                        [Upload]    │
│  Transcripts from internal interviews                   │
│                                                         │
│  *Survey data*                              [Upload]    │
│  Survey exports (CSV, Excel) for synthesis              │
│ ─────────────────────────────────────────────────────── │
│  Upload stakeholder notes to unlock Service Blueprint   │
│  analysis.                                              │
│                                                         │
│                                     [Done]              │
└─────────────────────────────────────────────────────────┘
```

### Step 2: Research plan modal (`researchPlanGeneratorModal.ts`)

After selecting a study and clicking "Create" next to Research plan, the modal updates (via `views.update`) to the plan form:

```
┌─────────────────────────────────────────────────────────┐
│  Research Plan                               [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  Execution plan for an approved brief. Scope, method,   │
│  participants, recruitment, and timeline come from the   │
│  cascade.                                               │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  [⚠️ cascade warning blocks injected here if missing]   │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│  Study                                                  │
│  ┌───────────────────────────────────┐                  │
│  │ va-mobile-nav-2026                │                  │
│  └───────────────────────────────────┘                  │
│  Auto-populated from study selection                    │
│ ─────────────────────────────────────────────────────── │
│  Lead researcher                                        │
│  ┌───────────────────────────────────┐                  │
│  │ Lapedra Tolson                    │                  │
│  └───────────────────────────────────┘                  │
│  Auto-filled from your profile                          │
│ ─────────────────────────────────────────────────────── │
│  *Execution Risks*                                      │
│                                                         │
│  Operational risks                                      │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., AT user recruitment takes   │                  │
│  │ 2x longer, need backup            │                  │
│  │ participants                       │                  │
│  │                                    │                  │
│  └───────────────────────────────────┘                  │
│  Execution-specific risks (not scope risks — those      │
│  are in the brief)                                      │
│                                                         │
│                              [Generate Plan]            │
└─────────────────────────────────────────────────────────┘
```

### Field inventory — plan modal (step 2)

| # | Block ID | Label | Type | Required | Pre-filled | Conditional | Source |
|---|----------|-------|------|----------|------------|-------------|--------|
| 1 | — | (context) | context | — | — | — | Static copy |
| 2 | — | (divider) | divider | — | — | — | — |
| 3 | `study_folder_block` | Study | plain_text_input | Yes | Yes — study name from step 1 selection | No | `planModalOpener` mutates `initial_value` |
| 4 | — | (divider) | divider | — | — | — | — |
| 5 | `lead_researcher_block` | Lead researcher | plain_text_input | Yes | Yes — study record → Slack profile fallback | No | `planModalOpener` mutates `initial_value` |
| 6 | — | (divider) | divider | — | — | — | — |
| 7 | — | *Execution Risks* | section header | — | — | — | Static |
| 8 | `operational_risks_block` | Operational risks | plain_text_input (multiline) | **No** (optional) | No | No | Researcher input |

**Total researcher-entered fields: 1** (operational risks). The other two inputs are pre-filled confirmations.

---

## 2. Field-by-field assessment

### Study (`study_folder_block`)

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **No as a text input.** The researcher already selected the study in step 1. Showing it again as an editable text field invites confusion — the researcher can type a study name that doesn't match any DB record, and the handler just uses whatever's in the field. The study was already validated in `planModalOpener`; re-presenting it as editable text is the "form ID field" anti-pattern (Principle: avoid showing fields researchers shouldn't change). |
| Cascade pre-fill? | Pre-filled from step 1 selection — working correctly. |
| Conditional? | No — always shown. Correct. |
| Label conversational? | "Study" is fine but terse. Could be a non-editable display. |
| Help text quality | "Auto-populated from study selection" — explains the mechanism, not the purpose. Researcher doesn't need to know it's auto-populated. |
| Required vs optional | Required. Correct — handler needs it. |
| **Recommendation** | Replace with a **context block** (non-editable display): `"📋 *va-mobile-nav-2026*"`. The handler should read the study name from `private_metadata` (already stored there), not from form input. Eliminates an editable field that shouldn't be edited. |

### Lead researcher (`lead_researcher_block`)

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes, but as editable confirmation.** Sometimes the researcher delegating is not the lead researcher. The pre-fill is right; letting them override is right. |
| Cascade pre-fill? | Pre-filled from study record → Slack profile. Working correctly. |
| Conditional? | No — always shown. Correct. |
| Label conversational? | "Lead researcher" is formal. Per Principle 6: "Who's leading this study?" would be more conversational. |
| Help text quality | "Auto-filled from your profile" — acceptable but could be more helpful: "Change if someone else is leading." |
| Required vs optional | Required. Correct. |
| **Recommendation** | Keep as editable input. Improve label to "Who's leading this study?" and hint to "Auto-filled from your Slack profile — change if someone else is leading." |

### Execution Risks section header

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Debatable.** There's exactly one field underneath this header. A section header for a single field adds visual weight without adding scannability. Per Principle 5: headers are for grouping 2-4 fields. One field doesn't need a group. |
| **Recommendation** | Remove the section header. The field's own label and hint are sufficient. |

### Operational risks (`operational_risks_block`)

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes, but the backlog says to remove it.** The backlog item "Remove the execution risks section (consolidated elsewhere or no longer relevant)" suggests this field is dead weight. However, the handler does use it — it's passed to the YAML template as `operational_risks`, and the LLM's `risks` AI task can reference it. The field adds researcher-specific operational knowledge the cascade can't provide. |
| Cascade pre-fill? | No — this is new information only the researcher knows. Correct. |
| Conditional? | No — always shown. Could be conditional (see proposal). |
| Label conversational? | "Operational risks" is formal. Per Principle 6: "Anything that could go wrong?" or "Execution risks you're aware of?" |
| Help text quality | Good — "Execution-specific risks (not scope risks — those are in the brief)" clearly scopes the field. The placeholder example is also useful. |
| Required vs optional | Optional. Correct — many studies have no special risks. |
| **Recommendation** | Keep but reconsider. The LLM generates 3 risks from context regardless — this field adds researcher-known risks the LLM can't infer. That's valuable. But if the backlog decision is firm, remove it and let the LLM generate all risks from cascade context. **Needs your call.** |

---

## 3. Cascade pre-fill opportunities

The plan handler already loads these from brief via `readUpstreamVariables`:

| Upstream variable | Currently used by handler | Could feed a modal field? | Assessment |
|---|---|---|---|
| `research_objectives` | Yes — transforms to `{id, objective}` | No field needed — flows to template | Correctly invisible to researcher |
| `research_questions` | Yes — passed through | No field needed | Correctly invisible |
| `target_barriers` | Yes — passed through | No field needed | Correctly invisible |
| `methodology_selection` | Yes — passed through | No field needed | Correctly invisible |
| `participant_criteria` | Declared in YAML consumes, not loaded by handler | Could surface as context | See note below |
| `participant_approach` | Declared in YAML consumes, not loaded by handler | Could surface as context | See note below |
| `timeline_preference` | Yes — `standard` fallback | No field needed | Correctly invisible |
| `start_date` | Yes — empty string fallback | No field needed | Correctly invisible |
| `recruitment_sources` | Yes — empty string fallback | No field needed | Correctly invisible |
| `budget` | Yes (via study record `parsed_budget_amount`) | No field needed | Correctly invisible |
| `decision_deadline` | Declared in YAML consumes, not loaded by handler | Could surface as context | See note below |

**Note:** `participant_criteria`, `participant_approach`, and `decision_deadline` are declared in the YAML's `consumes` block and in the cascade readiness spec (`cascadeReadinessBlocks.ts:103-113`) but the handler doesn't load them. The YAML may use them as AI context, or they may be vestigial. The handler's `readUpstreamVariables` call (line 90-98) doesn't include `participant_criteria`, `participant_approach`, `decision_deadline`, or `budget` — but `budget` is sourced from the study DB record instead. Worth verifying these are actually injected into the template context somehow, or are just dead consumes.

**New pre-fill opportunity:** None. The modal already has almost no fields. The cascade is correctly invisible — researchers don't need to see or confirm upstream data because the brief was already approved.

---

## 4. Conditional logic opportunities

| Opportunity | Description | Effort |
|---|---|---|
| **Cascade warning → disable submit** | When required cascade variables are missing, the warning blocks are injected but the "Generate Plan" submit button is still enabled. Researcher can submit and get a `TemplateContractError` DM. Instead: when the cascade readiness check finds required missing, don't show the plan form at all — show only the warning and a "Go back" close button. | S |
| **Operational risks → hidden by default** | If keeping the field: collapse it behind a "Add execution risks" button (section with `button` accessory). Researchers who have no risks skip it entirely — zero visual noise. Those who need it click once to expand. Uses `views.update` on button click. | M |

---

## 5. Removal candidates

### Confirmed removals (from backlog)

| Item | Backlog says | Current state | Verdict |
|---|---|---|---|
| Desk research, stakeholder notes, survey data sections | "Remove — those now live in /qori-discover" | These are in the **step 1 study setup modal** (`studySetupModal.ts`), not the plan modal itself. The setup modal has Upload buttons for desk research, stakeholder notes, and survey data. | **Remove from study setup modal.** These belong in `/qori-discover`. The study setup modal should only show document creation actions. |
| Execution risks section | "Remove (consolidated elsewhere or no longer relevant)" | The plan modal has one optional field: `operational_risks_block`. | **Your call.** See assessment in §2 above. The handler passes it to the template and the LLM uses it. Removing it means the LLM generates all risks from cascade context only. |

### Additional removal candidates

| Item | Rationale |
|---|---|
| `study_folder_block` (editable text) | Replace with non-editable context display. Study name in `private_metadata` is authoritative. See §2. |
| *Execution Risks* section header | Single-field section. See §2. |
| "Done" submit button on study setup modal | The setup modal's "Done" button submits to `plan_study_modal` callback — but the modal is a launcher, not a form. Should it have a submit at all, or just close buttons and action buttons? Currently submitting "Done" does nothing useful — the actions (Create, Upload) are individual buttons. Consider removing submit and making it close-only. |

---

## 6. Proposed new modal structure

### Step 1: Study setup modal (revised)

Remove upload sections. Keep document creation only.

```
┌─────────────────────────────────────────────────────────┐
│  Plan your study                              [Close]   │
├─────────────────────────────────────────────────────────┤
│  Pick a study, then choose what to create.              │
│  New study? Start with /qori-brief.                     │
│ ─────────────────────────────────────────────────────── │
│  Which study?                                           │
│  ┌───────────────────────────────────┐                  │
│  │ Select a study...              ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  📋 *Research plan*                         [Create]    │
│  Turns your brief into a stakeholder-ready plan         │
│                                                         │
│  💬 *Discussion guide*                      [Create]    │
│  Session script grounded in your objectives             │
│                                                         │
│  🎤 *Stakeholder interview guide*           [Create]    │
│  Questions for PMs, engineers, policy SMEs              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Changes:
- **Removed:** "Upload Files" section (desk research, stakeholder notes, survey data) — lives in `/qori-discover`
- **Removed:** "Done" submit button — modal is a launcher, not a form; close button suffices
- **Revised:** Context copy is more conversational
- **Revised:** Study label → "Which study?"
- **Added:** Emoji type differentiation per Principle 7 (semantic, not decorative)
- **Revised:** Plan description → "Turns your brief into a stakeholder-ready plan" (explains cascade relationship)

### Step 2: Research plan modal (revised)

```
┌─────────────────────────────────────────────────────────┐
│  Research Plan                               [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📋 *va-mobile-nav-2026*                                │
│  Generating an execution plan from your approved brief. │
│ ─────────────────────────────────────────────────────── │
│  Who's leading this study?                              │
│  ┌───────────────────────────────────┐                  │
│  │ Lapedra Tolson                    │                  │
│  └───────────────────────────────────┘                  │
│  Auto-filled — change if someone else is leading        │
│ ─────────────────────────────────────────────────────── │
│  Anything that could go wrong?              (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., AT users take 2x longer to │                  │
│  │ recruit, key team member out in   │                  │
│  │ June                              │                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│  Operational risks you know about — scope risks         │
│  are already captured in the brief                      │
│                                                         │
│                              [Generate Plan]            │
└─────────────────────────────────────────────────────────┘
```

Changes:
- **Removed:** `study_folder_block` editable text input → replaced with **context block** showing study name as non-editable display (handler reads from `private_metadata`)
- **Removed:** *Execution Risks* section header — single field doesn't need a group
- **Revised:** Lead researcher label → "Who's leading this study?" (Principle 6)
- **Revised:** Lead researcher hint → "Auto-filled — change if someone else is leading"
- **Revised:** Operational risks label → "Anything that could go wrong?" (Principle 6)
- **Revised:** Operational risks hint → "Operational risks you know about — scope risks are already captured in the brief"
- **Revised:** Context block at top → shows study name prominently + explains what the modal does in one sentence

### Cascade warning state (when required variables missing)

When `buildCascadeReadiness` finds required variables missing, the modal should show **only** the warning — not the form fields:

```
┌─────────────────────────────────────────────────────────┐
│  Research Plan                               [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📋 *va-mobile-nav-2026*                                │
│ ─────────────────────────────────────────────────────── │
│  ⚠️ *Can't generate yet — 3 inputs missing*            │
│                                                         │
│  ⚠️ *Research objectives* — Create research brief first │
│  ⚠️ *Research questions* — Create research brief first  │
│  ⚠️ *Methodology* — Create research brief first         │
│                                                         │
│  _Run /qori-brief for this study, then come back._      │
│                                                         │
│                                              [Cancel]   │
└─────────────────────────────────────────────────────────┘
```

Changes:
- Form fields hidden entirely when cascade is incomplete
- Submit button removed (or relabeled to just "Cancel")
- Warning is the entire content — researcher knows exactly what to do
- No wasted time filling out a form that will fail on submit

---

## 7. Risks

### Handler changes required

| Change | Risk | Mitigation |
|---|---|---|
| Remove `study_folder_block` from form | Handler reads study name from `values.study_folder_block` (line 60). Must change to read from `private_metadata` only. | `private_metadata` already contains `studyName` — handler already has the fallback `metaStudyName`. Remove the `values` extraction, keep the metadata path. Low risk. |
| Conversational labels | Block IDs and action IDs stay the same — only visible label text changes. | No handler impact. Zero risk. |
| Remove upload sections from setup modal | Upload actions (`upload_desk_research`, `upload_stakeholder_notes`, `upload_survey_data`) are registered in `events.ts`. Removing the buttons means dead action registrations. | Remove the action registrations too, or leave them harmless. Confirm no other modal triggers these actions. Low risk. |
| Remove "Done" submit from setup modal | `plan_study_modal` callback handler exists in `events.ts`. Removing submit means the callback never fires. | Check if the callback does anything meaningful. If it just acks, removing it is safe. If it records analytics or status, preserve that elsewhere. |
| Cascade warning hides form | `planModalOpener` currently injects warning blocks alongside form blocks. New behavior: when required missing, replace form blocks entirely. | Requires changes to `planModalOpener.ts` branching logic. Must also remove or hide the submit button. Medium complexity. |

### Cascade contract gap

The handler's `readUpstreamVariables` call (planHandler.ts:90-98) doesn't include `participant_criteria`, `participant_approach`, or `decision_deadline` — but these are declared as consumed in the YAML and in `cascadeReadinessBlocks.ts`. Either:
- The YAML template accesses them via a different injection path (e.g., `processYamlTemplate` loads all study variables automatically), or
- They're dead consumes that should be cleaned up.

**Must verify before implementation** to avoid breaking the template.

### Researcher workflow disruption

The current modal is minimal and works. Changes are cosmetic + structural, not behavioral. The only functional change is removing the editable study name field. Risk: a researcher who habitually corrects the study name in the plan modal (e.g., because they selected the wrong study) would lose that ability. Mitigation: they can go back to the study selector.

---

## 8. Implementation sequence (suggested)

If approved, implement in this order to minimize blast radius:

1. **Study setup modal cleanup** — remove upload sections, remove "Done" submit, conversational copy. (Isolated to `studySetupModal.ts` + `events.ts` action registrations.)
2. **Plan modal copy polish** — conversational labels, revised hints, remove section header. (Isolated to `researchPlanGeneratorModal.ts`. No handler changes.)
3. **Study name → context block** — replace editable input with non-editable display, update handler to read from metadata only. (Modal + handler change together.)
4. **Cascade warning gate** — when required missing, show only warning, hide form and submit. (Modal opener logic change.)

Each step is independently shippable and testable.

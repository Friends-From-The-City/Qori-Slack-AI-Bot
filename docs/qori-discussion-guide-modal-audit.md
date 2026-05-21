# /qori-plan → Discussion Guide Modal Design Audit

**Date:** 2026-05-21
**Status:** Review — no code changes until approved
**Target:** `discussionGuideModal.ts` + `discussionGuideHandler.ts`
**Entry point:** `/qori-plan` → select study → "Create" next to Discussion guide

---

## 1. Current state

The discussion guide modal opens via `views.update` from the study setup hub (same entry point as the plan modal). The opener pre-populates the study name and lead moderator, injects cascade readiness blocks if required variables are missing.

### Text rendering of current modal

```
┌─────────────────────────────────────────────────────────┐
│  Discussion Guide                            [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  Create a session guide for your user research. Qori    │
│  generates introduction scripts, methodology-specific   │
│  tasks, and closing protocols.                          │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  [cascade warning blocks injected here if missing]      │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│  Study                                                  │
│  ┌───────────────────────────────────┐                  │
│  │ va-mobile-redesign-postgress-v2   │  ← editable!     │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Research goal / focus                                  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., How Veterans navigate the   │                  │
│  │ mobile app to complete tasks      │                  │
│  └───────────────────────────────────┘                  │
│  What are you trying to learn in this session?          │
│                                                         │
│  Research questions                                     │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Where do Veterans abandon   │                  │
│  │ tasks? What causes confusion?     │                  │
│  └───────────────────────────────────┘                  │
│  Specific questions this session should answer          │
│ ─────────────────────────────────────────────────────── │
│  Methodology                                            │
│  ┌───────────────────────────────────┐                  │
│  │ Select method...               ▼  │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Session length                                         │
│  ┌───────────────────────────────────┐                  │
│  │ 60 minutes                     ▼  │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Number of tasks / topics                               │
│  ┌───────────────────────────────────┐                  │
│  │ 5                              ▼  │                  │
│  └───────────────────────────────────┘                  │
│  Main activities in the session (typically 3-7)         │
│ ─────────────────────────────────────────────────────── │
│  Lead moderator                                         │
│  ┌───────────────────────────────────┐                  │
│  │ 👤 Lapedra Tolson             ▼  │  ← users_select  │
│  └───────────────────────────────────┘                  │
│  Auto-filled with you — change if someone else is       │
│  moderating                                             │
│                                                         │
│                              [Generate Guide]           │
└─────────────────────────────────────────────────────────┘
```

### Field inventory

| # | Block ID | Label | Type | Required | Pre-filled | Cascade source? |
|---|----------|-------|------|----------|------------|-----------------|
| 1 | — | (context) | context | — | — | — |
| 2 | `study_name` | Study | plain_text_input | Yes | Yes — from study selection | No (should be metadata) |
| 3 | `research_focus_block` | Research goal / focus | plain_text_input (multiline) | Yes | **No** | **Yes** — `research_objectives` |
| 4 | `research_questions_block` | Research questions | plain_text_input (multiline) | Yes | **No** | **Yes** — `research_questions` |
| 5 | `research_method_block` | Methodology | static_select | Yes | **No** | **Yes** — `methodology_selection` |
| 6 | `session_length_block` | Session length | static_select | Yes | Default: 60 min | No |
| 7 | `task_count_block` | Number of tasks / topics | static_select | Yes | Default: 5 | No |
| 8 | `lead_moderator_block` | Lead moderator | users_select | Yes | Yes — study creator or opener | No (correct) |

**Total fields requiring researcher input today: 5** (focus, questions, method, session length, task count)
**Fields that could be pre-filled from cascade: 3** (focus, questions, method)
**After pre-fill: 2 fields requiring researcher input** (session length, task count)

---

## 2. Field-by-field assessment

### Study (`study_name`) — REMOVE

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **No.** Same "form ID field" anti-pattern fixed in the plan modal. Researcher already selected the study in the hub. The editable text input invites typos. Handler already has `studyName` from `private_metadata` (line 153). |
| Cascade pre-fill? | Pre-filled by opener from study selection. |
| Label | "Study" — formal but acceptable for a display-only context. |
| **Recommendation** | Replace with non-editable context block: `:speech_balloon: *va-mobile-nav-2026*` — same pattern as plan modal v6.0. Handler reads from `private_metadata` (already does this as primary path, with form value as fallback). Remove the form fallback. |

### Research goal / focus (`research_focus_block`) — PRE-FILL FROM CASCADE

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes, but pre-filled.** The brief's `research_objectives` define what the study aims to learn. The discussion guide's "focus" is a session-level refinement of those objectives — e.g., the brief says "understand navigation barriers" and the guide focuses on "how Veterans navigate the mobile app to complete tasks." |
| Cascade source | `research_objectives` (array of strings, emitted by brief). The `yamlProcessor` already loads this as `upstream_research_objectives` for the AI task — but the modal field is blank, forcing the researcher to retype. |
| Pre-fill strategy | Join `research_objectives` into a bullet list as `initial_value`. Researcher can edit/refine for the specific session. If no cascade data, field stays blank (current behavior). |
| Label | "Research goal / focus" is acceptable. Could be more conversational: "What should this session focus on?" |
| Help text | Current hint "What are you trying to learn in this session?" is good — it distinguishes session focus from study-level objectives. Add: "Pre-filled from your brief's objectives — refine for this session." |
| **Recommendation** | Opener loads `research_objectives` from study variables. Joins as newline-separated bullet list. Sets as `initial_value`. Researcher sees the brief's objectives and can trim, reword, or add session-specific focus. |

### Research questions (`research_questions_block`) — PRE-FILL FROM CASCADE

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes, but pre-filled.** The brief's `research_questions` (array of `{id, question, priority}`) define the exact questions the study must answer. The discussion guide's session questions should be grounded in these. |
| Cascade source | `research_questions` (array of objects with `id`, `question`, `priority`). |
| Pre-fill strategy | Format as numbered list: `RQ-001 (Primary): How do Veterans...` etc. Researcher can prune questions not relevant to this specific session or add session-specific probes. |
| Label | "Research questions" is fine but could be "Which questions should this session answer?" |
| Help text | Current: "Specific questions this session should answer." Update to: "Pre-filled from your brief — remove any not relevant to this session, or add session-specific questions." |
| **Recommendation** | Same pattern as focus: opener loads, formats, sets `initial_value`. |

### Methodology (`research_method_block`) — PRE-SELECT FROM CASCADE

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes, but pre-selected.** The brief's `methodology_selection` defines the approved method. The guide's methodology should match unless the researcher intentionally overrides. |
| Cascade source | `methodology_selection` (string, e.g., "Moderated usability testing"). |
| Pre-fill strategy | Map the cascade value to the `static_select` option value. Brief emits friendly labels ("Moderated usability testing") but the select uses snake_case values ("usability_testing"). Need a mapping: `usability_testing` ← contains "usability", `user_interviews` ← contains "interview", etc. Set `initial_option` on the select element. |
| Label | "Methodology" is formal. Could be "How are you running this session?" but the select dropdown makes conversational labels less important — the options speak for themselves. |
| **Recommendation** | Opener loads `methodology_selection`, maps to select value, sets `initial_option`. Researcher can override if needed (e.g., brief says mixed methods but this specific session is usability-only). |

### Session length (`session_length_block`) — KEEP AS-IS

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** Session length is session-specific. The brief doesn't specify it — it's an execution detail decided per session. Default of 60 minutes is sensible. |
| Cascade source | None. This is genuinely new information. |
| Label | "Session length" is fine. Could be "How long is each session?" |
| **Recommendation** | Keep. Optionally improve label to conversational form. |

### Number of tasks / topics (`task_count_block`) — KEEP AS-IS

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** Task count is session-specific and depends on session length, methodology, and researcher judgment. The LLM uses this to generate exactly N task blocks. Default of 5 is sensible. |
| Cascade source | None. Genuinely new. |
| Label | "Number of tasks / topics" is clear. Hint "Main activities in the session (typically 3-7)" is useful. |
| **Recommendation** | Keep as-is. |

### Lead moderator (`lead_moderator_block`) — ALREADY FIXED

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** Already converted to `users_select` in the recent batch (PR #157). Defaults to study creator or opener. |
| **Recommendation** | No changes needed. |

---

## 3. Cascade pre-fill opportunities

| Upstream variable | Source | Available in cascade readiness spec? | Could feed which field? | Pre-fill strategy |
|---|---|---|---|---|
| `research_objectives` | research_brief | Yes (required) | `research_focus_block` | Join array into newline-separated bullet list |
| `research_questions` | research_brief | Yes (required) | `research_questions_block` | Format as `RQ-001 (Primary): question text` list |
| `methodology_selection` | research_brief | Yes (required) | `research_method_block` | Map string to select option value, set `initial_option` |
| `target_barriers` | research_brief | Yes (required) | Not a modal field — used by AI task only | No modal pre-fill needed (correctly invisible) |
| `participant_criteria` | research_brief | Yes (optional) | Not a modal field — used by AI task only | No modal pre-fill needed |

**Key insight:** The YAML template already consumes all 5 cascade variables via `yamlProcessor`'s TRANSFORM phase (same architecture as the plan template). The AI task prompt uses `upstream_research_objectives`, `upstream_research_questions`, `upstream_target_barriers`, `upstream_methodology_selection`, and `upstream_participant_criteria` in its Jinja conditionals. The modal pre-fill is purely for researcher confirmation/refinement — the LLM already gets the cascade data regardless of what the researcher types.

**Implication for pre-fill:** Even if the researcher blanks out the pre-filled focus/questions, the AI task still receives the upstream data. The modal fields serve as researcher-visible context and session-level refinement. Pre-filling them means the researcher sees "the system already knows this" and only needs to adjust for the specific session.

---

## 4. Conditional logic opportunities

| Opportunity | Description | Effort |
|---|---|---|
| **Cascade gate (match plan modal)** | When required cascade vars are missing, show warning-only view — no form, no submit. The cascade readiness spec declares `research_objectives`, `research_questions`, `methodology_selection`, and `target_barriers` as required. Same pattern as plan modal v6.0. | S — copy plan modal opener pattern |
| **Methodology → task label preview** | After researcher selects methodology, show a context block: "Tasks will be labeled as 'Task 01, Task 02...' (usability testing)" or "Topics will be labeled as 'Topic 01, Topic 02...' (interviews)". Gives researcher confidence the right template will be used. Requires `views.update` on method change. | M |
| **Session length → task count suggestion** | When session length changes, suggest a task count: 30 min → 2-3, 45 min → 3-4, 60 min → 4-5, 90 min → 5-7. Currently researchers guess. | S (hint text update only) |

---

## 5. Anti-pattern detection

| Anti-pattern | Where | Severity | Fix |
|---|---|---|---|
| **Form ID field** | `study_name` — editable text showing the study name the researcher already selected | High | Replace with context block, read from `private_metadata` |
| **Cascade-available data entered from scratch** | `research_focus_block`, `research_questions_block`, `research_method_block` — all blank despite cascade having the data | High | Pre-fill from cascade variables |
| **Formal labels** | "Research goal / focus", "Research questions", "Methodology" — all noun-form | Medium | Conversational alternatives below |
| **No cascade gate** | When required variables missing, warning blocks are injected alongside the form (researcher can still submit → `TemplateContractError`) | Medium | Gate the form — same pattern as plan modal |
| **Cascade readiness injection point** | Injected before first divider, which is between the context block and the study name — breaks visual flow | Low | Inject as part of the gate logic (when missing → replace form entirely) |
| **Duplicate study fetches** | Opener calls `getResearchStudyWithRoles` twice — once for lead moderator (line 101), once for cascade readiness (line 114) | Low | Single fetch, reuse result |

### Conversational label alternatives

| Current | Proposed |
|---------|----------|
| Study | (removed — context block) |
| Research goal / focus | What should this session focus on? |
| Research questions | Which questions should this session answer? |
| Methodology | How are you running this session? |
| Session length | How long is each session? |
| Number of tasks / topics | How many tasks or topics? |
| Lead moderator | (already done — "Lead moderator" with users_select) |

---

## 6. Proposed new modal structure

### Happy path (cascade complete)

```
┌─────────────────────────────────────────────────────────┐
│  Discussion Guide                            [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  💬 *va-mobile-nav-2026*                                │
│  Building a session guide from your approved brief.     │
│ ─────────────────────────────────────────────────────── │
│  What should this session focus on?                     │
│  ┌───────────────────────────────────┐                  │
│  │ • Understand navigation barriers  │  ← pre-filled   │
│  │   Veterans encounter              │    from brief    │
│  │ • Identify task completion        │    objectives    │
│  │   patterns across AT users        │                  │
│  └───────────────────────────────────┘                  │
│  Pre-filled from your brief — refine for this session   │
│                                                         │
│  Which questions should this session answer?            │
│  ┌───────────────────────────────────┐                  │
│  │ RQ-001 (Primary): Where do       │  ← pre-filled   │
│  │ Veterans abandon tasks?           │    from brief    │
│  │ RQ-002 (Primary): What causes    │    questions     │
│  │ confusion in the navigation?      │                  │
│  │ RQ-003 (Secondary): How do AT    │                  │
│  │ users differ in task approach?    │                  │
│  └───────────────────────────────────┘                  │
│  Pre-filled from your brief — remove any not relevant   │
│  to this session, or add session-specific questions     │
│ ─────────────────────────────────────────────────────── │
│  How are you running this session?                      │
│  ┌───────────────────────────────────┐                  │
│  │ Usability Testing              ▼  │  ← pre-selected │
│  └───────────────────────────────────┘                  │
│                                                         │
│  How long is each session?                              │
│  ┌───────────────────────────────────┐                  │
│  │ 60 minutes                     ▼  │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  How many tasks or topics?                              │
│  ┌───────────────────────────────────┐                  │
│  │ 5                              ▼  │                  │
│  └───────────────────────────────────┘                  │
│  Main activities in the session (typically 3-7)         │
│ ─────────────────────────────────────────────────────── │
│  Lead moderator                                         │
│  ┌───────────────────────────────────┐                  │
│  │ 👤 Lapedra Tolson             ▼  │                  │
│  └───────────────────────────────────┘                  │
│  Auto-filled with you — change if someone else is       │
│  moderating                                             │
│                                                         │
│                              [Generate Guide]           │
└─────────────────────────────────────────────────────────┘
```

### Gated state (cascade incomplete)

```
┌─────────────────────────────────────────────────────────┐
│  Discussion Guide                            [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  💬 *va-mobile-nav-2026*                                │
│ ─────────────────────────────────────────────────────── │
│  ⚠️ *Can't generate yet — 3 inputs missing*            │
│                                                         │
│  ⚠️ *Research objectives* — Create research brief first │
│  ⚠️ *Research questions* — Create research brief first  │
│  ⚠️ *Methodology* — Create research brief first         │
│                                                         │
│  _Run /qori-brief for this study, then come back._      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

No form fields. No submit. Same pattern as plan modal.

---

## 7. Risks

### Handler changes required

| Change | Risk | Mitigation |
|---|---|---|
| Remove `study_name` input | Handler reads study name from `values.study_name` as fallback (lines 155-161). Must change to `private_metadata` only. | `private_metadata` already has `studyName` as primary path. Remove the fallback. Low risk — same change as plan handler. |
| Pre-fill focus from cascade | Opener must call `readStudyVariables` (already done for cascade readiness). Extract `research_objectives`, join as text, set `initial_value`. | If variable missing, field stays blank (current behavior). No regression. |
| Pre-fill questions from cascade | Same as focus — extract `research_questions`, format with IDs and priority. | Formatting must handle array-of-objects gracefully. If malformed, fall back to empty. |
| Pre-select methodology | Must map brief's methodology string to select option value. | Mapping is lossy (brief says "Moderated usability testing", select has "usability_testing"). Use substring matching. If no match, leave select unset. |
| Cascade gate | Same pattern as plan modal opener — when required vars missing, replace form with warning. | Already proven in plan modal. Copy pattern. |

### Template input contract

The `DiscussionGuideTemplateInput` interface has `research_focus` and `research_questions` as `string | null`. Pre-filling from cascade doesn't change the type — the handler still extracts whatever the researcher typed (which may be the pre-filled value, an edited version, or something new). The YAML processor independently loads `upstream_research_objectives` and `upstream_research_questions` regardless. No contract change needed.

### Double data: modal fields vs. upstream variables

After this change, the AI task receives both:
- `{{research_focus}}` / `{{research_questions}}` — from the modal (handler-extracted, potentially edited by researcher)
- `{{upstream_research_objectives}}` / `{{upstream_research_questions}}` — from the cascade (raw, unedited)

This is correct. The modal values represent the researcher's session-level intent. The upstream values represent the study-level commitments. The AI prompt already uses both: upstream for cascade-aware generation rules (coverage checks, barrier targeting), modal values for the specific session scope. No conflict.

---

## 8. Implementation sequence (suggested)

1. **Study name → context block + handler metadata** — same pattern as plan modal. Isolated to modal + opener + handler.
2. **Cascade pre-fill: focus + questions** — opener loads variables, formats, sets `initial_value`. Modal unchanged (just receives pre-filled values).
3. **Cascade pre-fill: methodology** — opener maps cascade value to select option, sets `initial_option`.
4. **Cascade gate** — when required vars missing, show warning-only view. Copy plan modal pattern.
5. **Conversational labels** — label text changes only. No handler impact.

Each step is independently shippable and testable.

---

## Appendix: "Done" button on study setup hub modal

### What happened

The plan modal audit (2026-05-21) proposed removing the "Done" submit button from the study setup hub modal (`studySetupModal.ts`) because the modal is a launcher, not a form — the "Create" buttons are the primary actions, and "Done" does nothing (the callback `handlePlanStudyNoop` just calls `ack()`).

The submit button was removed in PR #156. This immediately caused a production error:

```
[ERROR] bolt-app must define `submit` to use an `input` block in modals
        [json-pointer:/view/blocks/2/input]
```

### Root cause

**Slack API constraint:** A modal that contains any block with `type: "input"` must define a `submit` property. The study selector is an `input` block (a `static_select` wrapped in an `input` block). Removing `submit` made the `views.open` call fail with `invalid_arguments`.

This is not about the callback handler or analytics — it's a hard Slack API requirement.

### Fix applied

PR #158 restored `submit: { text: "Done" }`. The no-op callback handler (`handlePlanStudyNoop`) was already registered and continues to just call `ack()`.

### How to remove the button cleanly (if desired)

The only way to remove the submit button is to eliminate all `input` blocks from the modal. Two approaches:

**Option A: Convert study selector to `section` with `accessory`**

Replace the `input` block wrapping the `static_select` with a `section` block using an accessory `static_select`. Section accessories don't require `submit`. However: Slack section accessories have different value extraction — the handler can't read the value from `view.state.values` (only `input` blocks populate that). The value must be read from the action event (`study_select` action) instead, which already stores the selection in the opener's logic.

Effort: M. Requires restructuring how the opener reads the study selection.

**Option B: Accept the button**

The button is harmless. The no-op handler acks and closes the modal. Researchers who click "Done" instead of "Close" get the same result. The cost of removing it exceeds the benefit.

**Recommendation:** Option B — keep the button. Update the comment in the code to document why it must stay (Slack API constraint, not a design choice). The audit doc's original "remove" recommendation was wrong; this is a platform constraint.

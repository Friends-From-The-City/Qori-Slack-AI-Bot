# Stakeholder Interview Guide Modal Design Audit

**Date:** 2026-05-21
**Status:** ARCHIVED — Template removed 2026-05-21. Pre-launch simplification: no validated researcher demand, architecturally problematic (no consumes block, misplaced under /qori-plan). Audit preserved as reference for cascade-driven UX patterns. If post-launch usage reveals demand, revisit as inline cascade-native suggestions, not a separate template.
**Target (removed):** `stakeholderInterviewGuideModal.ts` + `stakeholderHandler.ts`
**Entry point (removed):** `/qori-plan` → select study → "Create" next to Stakeholder interview guide

---

## 1. Current state

The stakeholder interview guide modal opens via `views.push` (not `views.update` — it pushes a new modal on top of the study setup hub rather than replacing it). Two openers exist in `stakeholderHandler.ts`:

- `openStakeholderGuideModal` (action: `create_stakeholder_guide`) — used by the study setup hub. Includes cascade readiness injection.
- `openStakeholderInterviewGuideModal` (action: `create_stakeholder_interview_guide`) — simpler variant, no cascade readiness. Appears unused in current UI.

The YAML template (`stakeholder_interview_guide.yaml` v2.1) has **no `consumes` block and no `emits` block** — it's not cascade-aware. The cascade readiness spec in `cascadeReadinessBlocks.ts` declares two optional variables (`discovered_barriers`, `knowledge_gaps`) from desk research, but these are optional — the readiness check never fires a warning because nothing is required.

### Text rendering of current modal

```
┌─────────────────────────────────────────────────────────┐
│  Stakeholder guide                           [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  Create an interview guide for internal stakeholder     │
│  conversations.                                         │
│ ─────────────────────────────────────────────────────── │
│  *📂 Study*                                             │
│                                                         │
│  Research study folder                                  │
│  ┌───────────────────────────────────┐                  │
│  │ va-mobile-nav-2026                │  ← editable!     │
│  └───────────────────────────────────┘                  │
│  Auto-populated from study                              │
│ ─────────────────────────────────────────────────────── │
│  *👤 Stakeholder info*                                  │
│                                                         │
│  Stakeholder name                           (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Sarah Chen                  │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Stakeholder role *                                     │
│  ┌───────────────────────────────────┐                  │
│  │ Select role...                 ▼  │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Team / Department *                                    │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., OCTO Health & Benefits     │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Interview duration *                                   │
│  ┌───────────────────────────────────┐                  │
│  │ 45 minutes                     ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  *🎯 Focus areas*                                       │
│                                                         │
│  Select all that apply *                                │
│  ☐ 🔧 Constraints                                      │
│     Technical, policy, resource limitations             │
│  ☐ 🎯 Priorities                                       │
│     Strategic goals, roadmap                            │
│  ☐ ⚙️ Processes                                        │
│     Backstage operations                                │
│  ☐ 📋 Requirements                                     │
│     Must-haves, dependencies                            │
│  ☐ 📜 History                                          │
│     Why things are this way                             │
│  ☐ 🔍 User research                                    │
│     Explain user findings                               │
│ ─────────────────────────────────────────────────────── │
│  *📊 Research context*                                  │
│                                                         │
│  Key questions you want answered            (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Why is the claims API      │                  │
│  │ limited to 10 results?           │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  User findings to discuss                   (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., 45% of users abandon at    │                  │
│  │ step 3.                          │                  │
│  └───────────────────────────────────┘                  │
│  Share findings you want stakeholder perspective on     │
│                                                         │
│                              [Generate Guide]           │
└─────────────────────────────────────────────────────────┘
```

### Field inventory

| # | Block ID | Label | Type | Required | Pre-filled | Cascade source? |
|---|----------|-------|------|----------|------------|-----------------|
| 1 | — | (context) | context | — | — | — |
| 2 | — | *📂 Study* | section header | — | — | — |
| 3 | `study_select_block` | Research study folder | plain_text_input | Yes | Yes — from study selection | No (should be metadata) |
| 4 | — | *👤 Stakeholder info* | section header | — | — | — |
| 5 | `stakeholder_name_block` | Stakeholder name | plain_text_input | **No** | No | No — interviewee is external |
| 6 | `stakeholder_role_block` | Stakeholder role | static_select | Yes | No | No |
| 7 | `stakeholder_team_block` | Team / Department | plain_text_input | Yes | No | No |
| 8 | `session_duration_block` | Interview duration | static_select | Yes | Default: 45 min | No |
| 9 | — | *🎯 Focus areas* | section header | — | — | — |
| 10 | `interview_focus_block` | Select all that apply | checkboxes | Yes | No | Partially — see §3 |
| 11 | — | *📊 Research context* | section header | — | — | — |
| 12 | `research_questions_block` | Key questions you want answered | plain_text_input (multiline) | **No** | No | Partially — see §3 |
| 13 | `user_findings_block` | User findings to discuss | plain_text_input (multiline) | **No** | No | No |

**Total fields requiring researcher input: 8** (stakeholder name/role/team, duration, focus areas, questions, user findings, study)
**Fields that could be pre-filled from cascade: 2** (research questions, focus areas — partially)
**Fields that are genuinely per-interview: 5** (stakeholder name, role, team, duration, user findings)

---

## 2. Field-by-field assessment

### Study (`study_select_block`) — REMOVE

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **No as a text input.** Same form-ID anti-pattern as plan and discussion guide. Study already selected in the hub. |
| Label | "Research study folder" — the most formal label in the entire modal system. Nobody thinks in terms of "study folders." |
| **Recommendation** | Replace with non-editable context block. Handler reads from `private_metadata`. |

### Section header: *📂 Study* — REMOVE

Single-field section. After study becomes a context block, this header has no fields underneath it.

### Stakeholder name (`stakeholder_name_block`) — KEEP AS TEXT

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes as text.** This is the interviewee — may be external (vendor PM, policy SME at another agency, contractor). `users_select` is wrong here. |
| Label | "Stakeholder name" is clear. Could be slightly more conversational: "Who are you interviewing?" |
| Optional | Correct — sometimes the researcher doesn't know the specific person yet (scheduling in progress). |
| **Recommendation** | Keep as plain_text_input. Improve label. |

### Stakeholder role (`stakeholder_role_block`) — KEEP

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** The role determines which questions the LLM generates (RULE 5 in the YAML prompt). This is session-specific input the cascade can't provide. |
| Label | "Stakeholder role *" includes a literal asterisk. Slack `input` blocks with `optional: false` already show the required indicator. The asterisk is redundant. |
| **Recommendation** | Keep. Remove manual asterisk from label. Conversational: "What's their role?" |

### Team / Department (`stakeholder_team_block`) — KEEP

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** Teams are context-specific (a PM at OCTO vs. a PM at a vendor is a very different interview). |
| Label | "Team / Department *" — formal with redundant asterisk. |
| **Recommendation** | Keep. Label: "Which team or department?" Remove asterisk. |

### Interview duration (`session_duration_block`) — KEEP

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** Session-specific. Default of 45 min is sensible for stakeholder interviews. |
| Label | "Interview duration *" — formal with asterisk. |
| **Recommendation** | Keep. Label: "How long is the interview?" Remove asterisk. |

### Section header: *👤 Stakeholder info* — KEEP

Groups 4 fields (name, role, team, duration). Per Principle 5, headers group 2-4 fields. This is appropriate.

### Focus areas (`interview_focus_block`) — PARTIALLY PRE-FILL

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** Focus areas determine which sections the LLM generates (RULE 6). This is the primary configuration input. |
| Cascade source? | **Partial.** If desk research produced `discovered_barriers`, pre-check "Constraints." If desk research produced `knowledge_gaps`, pre-check "History." These are optional enrichment variables already declared in `cascadeReadinessBlocks.ts`. |
| Label | "Select all that apply *" — describes the interaction, not the content. |
| **Recommendation** | Keep checkboxes. Pre-check focus areas based on available cascade variables. Label: "What do you want to learn from this stakeholder?" |

### Section header: *🎯 Focus areas* — KEEP

Groups 1 field but the field has 6 options with descriptions — visually rich. Header adds scannability.

### Research questions (`research_questions_block`) — PRE-FILL FROM CASCADE

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes, but pre-filled when possible.** If the brief has `research_questions`, the researcher can see them and select/edit the ones relevant to this stakeholder conversation. |
| Cascade source | `research_questions` from brief (via `yamlProcessor` auto-load if consumes were declared — but they aren't). Also `knowledge_gaps` from desk research. |
| Pre-fill strategy | If `research_questions` exist in study variables, format as bullet list with IDs. If `knowledge_gaps` exist, append them. Researcher edits to focus on stakeholder-relevant questions. |
| Label | "Key questions you want answered" is good. |
| **Recommendation** | Pre-fill from cascade if available. Keep editable. |

### Section header: *📊 Research context* — KEEP

Groups 2 fields. Appropriate.

### User findings (`user_findings_block`) — KEEP AS-IS

| Criterion | Assessment |
|-----------|------------|
| Should it exist? | **Yes.** User findings are genuinely new input — the researcher selects which specific findings to present to this stakeholder. No cascade source provides this (session summaries exist but are study-level, not stakeholder-interview-level). |
| Label | "User findings to discuss" is clear. Hint "Share findings you want stakeholder perspective on" is useful. |
| **Recommendation** | Keep as-is. No cascade source. |

---

## 3. Cascade pre-fill opportunities

This modal is different from plan/discussion guide. The stakeholder interview guide is **discovery-adjacent** — it happens before or during the brief phase, not after. Its cascade sources are desk research outputs, not brief outputs.

| Upstream variable | Source | Available? | Could feed which field? | Pre-fill strategy |
|---|---|---|---|---|
| `discovered_barriers` | desk_research | Optional | `interview_focus_block` — pre-check "Constraints" | If present, auto-check the Constraints checkbox |
| `knowledge_gaps` | desk_research | Optional | `interview_focus_block` — pre-check "History"; `research_questions_block` — append as questions | If present, auto-check History; format gaps as questions in the text field |
| `research_questions` | research_brief | Optional (not declared in consumes) | `research_questions_block` — pre-fill as question list | If present, format with RQ IDs |
| `research_objectives` | research_brief | Optional (not declared in consumes) | Context display only — not a modal field | Could add to context block for researcher reference |

**Key architectural difference:** The YAML template has no `consumes` block. The `yamlProcessor` won't auto-load upstream variables. Pre-filling the modal is purely a UI convenience — the LLM only sees what the handler passes in `templateData`. To also make the LLM cascade-aware, the YAML would need a `consumes` block added. That's a separate template upgrade, not a modal polish task.

**Recommendation for this PR:** Pre-fill the modal fields from study variables loaded in the opener (same `readStudyVariables` call already used for cascade readiness). Don't add a YAML `consumes` block — that's a template v3.0 change.

---

## 4. Conditional logic opportunities

| Opportunity | Description | Effort |
|---|---|---|
| **"User research" focus area → show user_findings_block** | The "User findings to discuss" field is only relevant when the "🔍 User research" focus area is checked. Currently shown unconditionally. Could hide until checked. Requires `views.update` on checkbox change. | M |
| **Cascade gate** | All cascade sources are optional — no required variables to gate on. A gate that says "Run desk research first" when `discovered_barriers` is missing would be wrong — stakeholder interviews don't require desk research. **No gate appropriate.** | — |
| **Role → focus area suggestions** | When researcher selects a role (e.g., "Engineering Lead"), auto-check the most relevant focus areas (Constraints, Processes). A soft suggestion, not enforced. | S |

---

## 5. Removal candidates

| Item | Rationale |
|---|---|
| `study_select_block` (editable text) | Replace with context block. Same fix as plan and discussion guide. |
| *📂 Study* section header | No fields underneath after study becomes context block. |
| Duplicate modal opener (`openStakeholderInterviewGuideModal`) | The simpler opener at line 148 appears unused — the study setup hub routes to `openStakeholderGuideModal` (with cascade readiness). Verify no other trigger uses the simpler action, then remove. |
| Manual asterisks in labels | "Stakeholder role *", "Team / Department *", etc. — Slack's `input` block with `optional: false` already shows a required indicator. |

---

## 6. Proposed new modal structure

### Normal view (always — no gate for this modal)

```
┌─────────────────────────────────────────────────────────┐
│  Stakeholder Guide                           [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  🎤 *va-mobile-nav-2026*                                │
│  Interview guide for an internal stakeholder.           │
│ ─────────────────────────────────────────────────────── │
│  *Stakeholder*                                          │
│                                                         │
│  Who are you interviewing?                  (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Sarah Chen                  │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  What's their role?                                     │
│  ┌───────────────────────────────────┐                  │
│  │ Select role...                 ▼  │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Which team or department?                              │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., OCTO Health & Benefits     │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  How long is the interview?                             │
│  ┌───────────────────────────────────┐                  │
│  │ 45 minutes                     ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  What do you want to learn from this stakeholder?       │
│  ☑ 🔧 Constraints        ← pre-checked if              │
│     Technical, policy...    discovered_barriers exist    │
│  ☐ 🎯 Priorities                                       │
│  ☐ ⚙️ Processes                                        │
│  ☐ 📋 Requirements                                     │
│  ☑ 📜 History             ← pre-checked if              │
│     Why things are...       knowledge_gaps exist         │
│  ☐ 🔍 User research                                    │
│ ─────────────────────────────────────────────────────── │
│  *Research context*                                     │
│                                                         │
│  Key questions you want answered            (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ RQ-001 (Primary): Where do       │  ← pre-filled   │
│  │ Veterans expect to find...        │    if brief      │
│  │                                   │    exists        │
│  └───────────────────────────────────┘                  │
│                                                         │
│  User findings to discuss                   (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., 45% of users abandon at    │                  │
│  │ step 3.                          │                  │
│  └───────────────────────────────────┘                  │
│  Share findings you want stakeholder perspective on     │
│                                                         │
│                              [Generate Guide]           │
└─────────────────────────────────────────────────────────┘
```

Changes from current:
- **Study**: editable text → non-editable context block with 🎤 emoji
- **Removed**: *📂 Study* section header (no fields underneath)
- **Stakeholder section header**: *👤 Stakeholder info* → *Stakeholder* (simpler)
- **Labels**: conversational form throughout, manual asterisks removed
- **Focus areas label**: "Select all that apply" → "What do you want to learn from this stakeholder?"
- **Focus checkboxes**: pre-checked based on available desk research variables
- **Research questions**: pre-filled from brief's `research_questions` if available
- **No cascade gate** — all upstream sources are optional

---

## 7. Risks

### Handler changes required

| Change | Risk | Mitigation |
|---|---|---|
| Remove `study_select_block` from form | Handler reads study name from `values.study_select_block` as fallback (line 226-228). Must change to `private_metadata` only. | `private_metadata` already has `studyName`. Remove the form fallback. Same change as plan and DG handlers. |
| Pre-check focus areas | Must set `initial_options` on the checkboxes element. Slack requires `initial_options` items to exactly match the `options` items (same `text` and `value`). | Copy the exact option objects from the options array. |
| Pre-fill research questions | Opener loads study variables (already done for cascade readiness). Needs to check for `research_questions` and format them. | If not present, field stays blank. No regression. |
| Generating notification | Same gap as discussion guide had — no "Generating..." message. | Add same pattern: post progress message, update on completion. |

### Modal delivery method

This modal uses `views.push` (not `views.update`). This means:
- The study setup hub stays behind it — researcher can go back
- `private_metadata` from the hub is read but the modal gets its own metadata
- The handler uses `ack({ response_action: 'clear' })` to close all stacked modals on submit

No change needed for the delivery method. `views.push` is correct for this flow — the stakeholder guide is a secondary action from the hub, not a replacement.

### Template not cascade-aware

The YAML template has no `consumes` block. Pre-filling modal fields helps the researcher but doesn't help the LLM — it only sees the handler's `templateData`. If we want the LLM to use upstream context (e.g., brief objectives to ground interview questions), the YAML needs a `consumes` block added. That's a v3.0 template upgrade, separate from this modal polish.

### Duplicate opener

`openStakeholderInterviewGuideModal` (simpler, no cascade readiness) appears to be dead code — the study setup hub routes to `openStakeholderGuideModal`. Verify before removing:
- Search all modal builders for `create_stakeholder_interview_guide` action_id
- If only registered in `events.ts` with no trigger, safe to remove

---

## 8. Implementation sequence

1. **Study name → context block + handler metadata** — same pattern as plan and DG modals. Remove `study_select_block`, add context block, handler reads from `private_metadata`.
2. **Conversational labels** — remove manual asterisks, question-form labels. Pure modal file change.
3. **Focus area pre-check from cascade** — opener loads study variables, pre-checks Constraints if `discovered_barriers` exists, pre-checks History if `knowledge_gaps` exists.
4. **Research questions pre-fill from cascade** — opener formats `research_questions` from study variables as initial_value. Falls back to empty if not available.
5. **Generating notification** — same pattern as DG: post "Generating..." to channel, update on completion.
6. **Remove duplicate opener** — verify `openStakeholderInterviewGuideModal` is dead, remove from handler and events.ts.

Each step independently shippable. No cascade gate (all sources optional).

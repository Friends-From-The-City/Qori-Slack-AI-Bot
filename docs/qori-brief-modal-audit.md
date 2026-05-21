# /qori-brief Modal Design Audit

**Date:** 2026-05-21
**Status:** Review — no code changes until approved
**Target:** `researchBriefModal.ts` + `researchBriefEntryModal.ts` + `briefHandler.ts`
**Entry point:** `/qori-brief` slash command

---

## 1. Current state

The brief modal is the most complex modal in the system. It's a two-layer architecture:

- **`researchBriefModal.ts`** — static modal definition (15 fields, 4 sections)
- **`researchBriefEntryModal.ts`** — dynamic builder that clones the static blocks and injects discovery context, cascade pre-fills, and sparkle markers

The `/qori-brief` command (events.ts:180) calls `buildBriefEntryModal()` which:
1. Loads discovery artifacts via `loadDiscoveryArtifacts(team)`
2. Auto-selects all discovery checkboxes
3. Aggregates discovery variables and synthesizes cascade pre-fill values
4. Pre-populates method, questions, out-of-scope, and participants with sparkle (✨) markers
5. Sets start date to next Monday

### Text rendering of current modal (with discovery)

```
┌─────────────────────────────────────────────────────────┐
│  Research Brief                              [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  Define the research scope for stakeholder approval.    │
│  Once approved, the research plan will elaborate the    │
│  execution details.                                     │
│ ─────────────────────────────────────────────────────── │
│  Study name *                                           │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., va-mobile-nav-2026         │                  │
│  └───────────────────────────────────┘                  │
│  Use kebab-case. Study folder created automatically.    │
│                                                         │
│  Requested by *                                         │
│  ┌───────────────────────────────────┐                  │
│  │ 👤 Select stakeholder...      ▼  │                  │
│  └───────────────────────────────────┘                  │
│  Stakeholder who will approve this brief                │
│ ─────────────────────────────────────────────────────── │
│  *Discovery to inform this brief*                       │
│                                                         │
│  ✅ 3 discovery sources available — auto-selected       │
│                                                         │
│  Discovery sources                          (optional)  │
│  ☑ 📄 *veteran-telehealth-barriers*                    │
│       desk research · 5 findings · 2026-05-15           │
│  ☑ 🎙 *claims-process-stakeholders*                    │
│       stakeholder · 6 constraints/priorities · 05-18    │
│  ☑ 📊 *post-launch-survey*                             │
│       survey · 4 themes/findings · 2026-05-20           │
│ ─────────────────────────────────────────────────────── │
│  🤖 *Discovery suggests* — Edit to override. Uncheck   │
│  sources above to exclude.                              │
│                                                         │
│  ✨ *Method:* Usability testing — Recommended by 3      │
│  discovery sources                                      │
│  ✨ *Research questions:* Pulled from stakeholder        │
│  questions for users (3 of 5 selected)                  │
│  ✨ *Out of scope:* First items pre-populated           │
│  ✨ *Participants:* Composition reflects discovery       │
│  ⚠️ *Risks preview* (from stakeholder constraints)     │
│ ─────────────────────────────────────────────────────── │
│  *Research Scope*                                       │
│                                                         │
│  Problem statement *                                    │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│  What problem are we solving? Include metrics if avail. │
│                                                         │
│  What we'll learn *                                     │
│  ┌───────────────────────────────────┐                  │
│  │ 1. [stakeholder question 1]      │  ← pre-filled   │
│  │ 2. [stakeholder question 2]      │                  │
│  │ 3. [stakeholder question 3]      │                  │
│  └───────────────────────────────────┘                  │
│  3-5 bullets: what questions will this research answer? │
│                                                         │
│  Out of scope *                                         │
│  ┌───────────────────────────────────┐                  │
│  │ [barrier 1] (already established) │  ← pre-filled   │
│  │ [barrier 2] (already established) │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  *Method & Participants*                                │
│                                                         │
│  Research method *                                      │
│  ┌───────────────────────────────────┐                  │
│  │ Usability Testing              ▼  │  ← pre-selected │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Or specify custom method              (optional)       │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Participant approach *                                 │
│  ┌───────────────────────────────────┐                  │
│  │ 8-12 Veterans, including 3       │  ← pre-filled   │
│  │ screen reader users, 2 voice     │                  │
│  │ control users, at least 3 65+    │                  │
│  └───────────────────────────────────┘                  │
│  Who, how many, and key composition requirements        │
│                                                         │
│  Recruitment sources                       (optional)   │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Perigean Recruiting        │                  │
│  └───────────────────────────────────┘                  │
│  Where will participants be recruited from?             │
│ ─────────────────────────────────────────────────────── │
│  *Timeline & Budget*                                    │
│                                                         │
│  Start date *                                           │
│  ┌───────────────────────────────────┐                  │
│  │ 2026-05-26                       │  ← next Monday   │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Decision deadline *                                    │
│  ┌───────────────────────────────────┐                  │
│  │ Select deadline                   │                  │
│  └───────────────────────────────────┘                  │
│  When do stakeholders need findings?                    │
│                                                         │
│  Budget                                    (optional)   │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., $800 participant incentives │                  │
│  └───────────────────────────────────┘                  │
│  Participant incentives, tooling, etc.                  │
│                                                         │
│                                [Create Brief]           │
└─────────────────────────────────────────────────────────┘
```

### Field inventory

| # | Block ID | Label | Type | Required | Pre-filled | Section |
|---|----------|-------|------|----------|------------|---------|
| 1 | — | (context) | context | — | — | Top |
| 2 | `study_name_block` | Study name * | plain_text_input | Yes | No | Study basics |
| 3 | `stakeholder_block` | Requested by * | users_select | Yes | No | Study basics |
| 4 | `discovery_header_block` | *Discovery to inform this brief* | section | — | — | Discovery |
| 5 | `discovery_status_block` | (status text) | context | — | Dynamic | Discovery |
| 6 | `discovery_selection_block` | Discovery sources | checkboxes | No | Auto-select all | Discovery |
| 7 | — | 🤖 *Discovery suggests* | context (injected) | — | Dynamic | Cascade pre-fill |
| 8 | `problem_statement_block` | Problem statement * | plain_text_input (multiline) | Yes | No | Research Scope |
| 9 | `learning_objectives_block` | What we'll learn * | plain_text_input (multiline) | Yes | From discovery | Research Scope |
| 10 | `out_of_scope_block` | Out of scope * | plain_text_input (multiline) | Yes | From discovery | Research Scope |
| 11 | `research_method_block` | Research method * | static_select | Yes | From discovery | Method & Participants |
| 12 | `method_override_block` | Or specify custom method | plain_text_input | No | From discovery (if custom) | Method & Participants |
| 13 | `participant_approach_block` | Participant approach * | plain_text_input (multiline) | Yes | From discovery | Method & Participants |
| 14 | `recruitment_sources_block` | Recruitment sources | plain_text_input | No | No | Method & Participants |
| 15 | `start_date_block` | Start date * | datepicker | Yes | Next Monday | Timeline & Budget |
| 16 | `decision_deadline_block` | Decision deadline * | datepicker | Yes | No | Timeline & Budget |
| 17 | `budget_block` | Budget | plain_text_input | No | No | Timeline & Budget |

---

## 2. D6 discovery indicator assessment

### What already exists

The brief modal **already implements D6** — more thoroughly than what was proposed in the follow-on filing:

**When discovery exists:**
- Status line: `"✅ 3 discovery sources available — auto-selected"`
- Checkbox list with all artifacts, each showing type icon, slug, variable count, date
- All checkboxes pre-selected
- "Discovery suggests" section with sparkle markers showing which fields were pre-populated and why
- Fields pre-filled with synthesized values from discovery variables

**When no discovery exists:**
- Status line: `"⚠️ No discovery research available for this team yet. Run /qori-discover first to add organizational context, or proceed without — brief will be generated from your inputs alone."`

This is exactly the D6 behavior we specified: information, not a gate. The empty state copy matches the proposal. The artifact listing is more detailed than the hub's compact format (shows per-artifact variable counts and dates).

### D6 verdict: already implemented

The brief modal's discovery section is the most mature cascade-visibility implementation in the system. It predates the discovery hub work — `buildBriefEntryModal` was written during the v6.0 cascade-aware brief work (CLAUDE.md, May 3, 2026).

**No new D6 indicator needed.** The existing implementation covers:
- Artifact count and listing (✅)
- Auto-selection with opt-out (✅)
- Empty state with actionable guidance (✅)
- Pre-fill with sparkle markers showing provenance (✅)

---

## 3. Four-anti-pattern checklist

### Anti-pattern 1: Form ID fields

| Field | Assessment |
|---|---|
| `study_name_block` | **Not a form ID field.** This is genuinely new input — the researcher names the study. Unlike the plan/DG modals where the study was already selected in a hub, the brief creates the study. The name can't be pre-filled from context. |
| `stakeholder_block` | **Already `users_select`.** Converted in PR #157. |

**Verdict: Clean.** No form ID anti-pattern in this modal.

### Anti-pattern 2: Cascade-blank inputs

The brief is the **cascade root** for study-scoped data. It doesn't consume from other brief/plan outputs. It consumes from **discovery** outputs, and those pre-fills are already implemented in `buildBriefEntryModal`.

| Field | Cascade source | Pre-filled? |
|---|---|---|
| Problem statement | No cascade source — genuinely new input | N/A |
| What we'll learn | `stakeholder_questions_for_users` from discovery | **Yes** — pre-filled with sparkle |
| Out of scope | `discovered_barriers` from discovery | **Yes** — pre-filled with sparkle |
| Research method | `methodology_recommendations` from discovery | **Yes** — pre-selected or custom override |
| Participant approach | Synthesized from `stakeholder_constraints`, `survey_themes`, `discovered_barriers` | **Yes** — pre-filled with sparkle |
| Recruitment sources | No cascade source | N/A |
| Decision deadline | No cascade source | N/A |
| Budget | No cascade source | N/A |
| Start date | No cascade — default to next Monday | **Yes** — next Monday default |

**Verdict: Clean.** Every field that has an upstream cascade source is already pre-filled. The remaining blank fields are genuinely new input.

### Anti-pattern 3: Formal labels

| Current label | Assessment | Proposed |
|---|---|---|
| Study name * | Contains manual asterisk. Label is terse. | "What's the study called?" Remove asterisk. |
| Requested by * | Contains manual asterisk. Formal. | "Who's requesting this research?" Remove asterisk. |
| Problem statement * | Formal noun phrase with asterisk. | "What problem are you solving?" |
| What we'll learn * | **Already conversational.** Good. But has asterisk. | Remove asterisk only. |
| Out of scope * | Terse with asterisk. | "What's out of scope?" |
| Research method * | Formal with asterisk. | "What method fits best?" |
| Or specify custom method | Sentence fragment, clear. | Keep — it's an escape hatch, formality is fine. |
| Participant approach * | Formal with asterisk. | "Who are you researching with?" |
| Recruitment sources | Good. No asterisk (optional). | Keep. |
| Start date * | Terse with asterisk. | "When does research start?" |
| Decision deadline * | Formal with asterisk. Hint "When do stakeholders need findings?" is already conversational. | "When do stakeholders need findings?" (promote hint to label) |
| Budget | Good. Optional, no asterisk. | Keep. |

**Verdict: 9 labels could be more conversational.** All have manual asterisks that Slack's required indicator already provides. The section headers ("Research Scope", "Method & Participants", "Timeline & Budget") are formal — could be conversational but they're section organizers, not field labels.

### Anti-pattern 4: Missing cascade gates

The brief is the cascade root for study data. It consumes discovery outputs, but those are all optional — discovery is never required before creating a brief. The existing implementation handles this correctly:

- Discovery exists → auto-select, pre-fill, sparkle markers
- No discovery → empty state message, proceed without

**No gate needed.** The brief is always creatable. Same reasoning as the discovery hub — the brief is where the researcher starts, gating it would block the entire workflow.

**Verdict: Correct — no gate.**

---

## 4. Discovery indicator design options

Since D6 is already implemented, the remaining question is whether the existing implementation should be updated to use the same visual patterns as the discovery hub for consistency.

### Option A: Keep as-is

The existing implementation works. The sparkle markers, auto-selection, and status line are all functional. The visual language differs from the hub (sparkle markers vs. concrete categories, checkbox list vs. context block list) but the brief modal has a different purpose — it's an interactive selection surface, not a read-only display.

### Option B: Align visual language

Update the discovery status line and artifact display to use the same `formatVariableCategories()` from `cascadeVariableCategories.ts` that the hub uses. Replace `"5 findings"` with `"barriers, metrics, gaps"` for consistency. Keep the checkbox interaction and sparkle markers (those are brief-specific and correct).

### Recommendation: Option B (align categories only)

The checkbox interaction and sparkle pre-fill are correct for the brief — they enable researcher control over which discovery sources inform the brief. But the artifact summary should use concrete categories instead of raw counts, matching the hub's visual language.

Change: `"desk research · 5 findings · 2026-05-15"` → `"desk research · barriers, metrics, gaps · 2026-05-15"`

This is a small, contained change in `buildBriefEntryModal` (lines 199-208) that calls `formatVariableCategories()` on the artifact's variable keys instead of showing `a.variableCount`.

---

## 5. Implementation sequence

1. **Conversational labels** — remove manual asterisks, question-form labels. Pure modal definition change in `researchBriefModal.ts`. No handler changes.
2. **Align discovery artifact categories** — update `buildBriefEntryModal` to use `formatVariableCategories()` from `cascadeVariableCategories.ts` instead of raw variable counts. Small contained change.
3. **Generating notification** — the brief handler doesn't post a "Generating..." message (same gap as the old discussion guide). Add the same pattern: post progress to channel, update on completion.

Each step is independently shippable. No structural changes needed — the brief modal is already cascade-aware with discovery pre-fill.

---

## 6. Risks

| Change | Risk | Mitigation |
|---|---|---|
| Label text changes | Block IDs and action IDs stay the same. Handler extraction unaffected. | Zero risk. |
| `formatVariableCategories()` in artifact display | If a variable key isn't in the registry, `formatVariableCategories()` omits it. Could produce shorter descriptions. | The registry already covers all discovery emit keys. Verify with a test. |
| Generating notification | Brief handler does heavy work (2 structured LLM tasks + YAML rendering + study creation). Progress message important for researcher confidence. | Same pattern proven in DG handler (PR #160). |

# /qori-discover Design Exploration (Phase 2)

**Date:** 2026-05-21
**Status:** Design options for discussion — no code changes
**Prerequisite:** Phase 1 audit at `docs/qori-discover-audit.md`
**Scope change:** Stakeholder interview guide removed (PR #162). Discovery is synthesis-only: 3 types, all upload → analyze.

---

## Design context

The central problem: one modal tries to serve three workflows. The discovery type dropdown changes everything about what the researcher needs to provide, but the modal never adapts. Survey-specific fields show for desk research. File type filtering doesn't narrow. The researcher must mentally skip irrelevant fields.

With the interview guide removed, `/qori-discover` is a clean synthesis surface. All three types follow the same pattern: upload documents → analyze → emit cascade variables. The differences are in what documents, what fields, and what outputs.

### The 6 audited pain points (from Phase 1)

1. No progress notification after submit
2. Survey name required-but-marked-optional
3. File type mismatch not caught early
4. No way to see what discovery already exists
5. Single-pass synthesis (no iteration/append)
6. No next-step guidance after synthesis

---

## Approach A: Adaptive single modal (views.update on type change)

Keep the single-modal pattern but make it responsive. When the researcher selects a discovery type, `views.update` replaces the form fields with type-specific blocks. One modal, three field sets.

### Entry state (before type selection)

```
┌─────────────────────────────────────────────────────────┐
│  Discovery research                          [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  Pre-study research that informs your brief. Upload     │
│  documents and Qori synthesizes themes, barriers, and   │
│  recommendations.                                       │
│ ─────────────────────────────────────────────────────── │
│  What kind of discovery?                                │
│  ┌───────────────────────────────────┐                  │
│  │ Select discovery type...       ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  _Select a type above to see the form._                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

No submit button until type is selected (modal has no `input` blocks yet, so Slack allows omitting `submit` — the only block is a `static_select` inside an `input`, which does require submit... so this won't work as drawn).

**Problem:** Slack requires `submit` if any `input` block exists. The type selector IS an `input` block. So the modal must always have `submit`. The researcher could submit with only the type selected and no files — handler would need to validate.

### After selecting "Desk research"

```
┌─────────────────────────────────────────────────────────┐
│  Discovery research                          [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📄 *Desk research*                                     │
│  Upload reports, competitive analysis, or background     │
│  docs. Qori extracts barriers, metrics, and gaps.       │
│ ─────────────────────────────────────────────────────── │
│  What kind of discovery?                                │
│  ┌───────────────────────────────────┐                  │
│  │ Desk research                  ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  What topic are you exploring?                          │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Veteran telehealth barriers │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name                              │
│                                                         │
│  What are these documents about?            (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Upload files                                           │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  PDF, Word, text, or markdown — up to 10 files          │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

### After selecting "Survey synthesis"

```
┌─────────────────────────────────────────────────────────┐
│  Discovery research                          [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📊 *Survey synthesis*                                  │
│  Upload survey exports. Qori identifies themes,          │
│  findings, and demographic patterns.                    │
│ ─────────────────────────────────────────────────────── │
│  What kind of discovery?                                │
│  ┌───────────────────────────────────┐                  │
│  │ Survey synthesis               ▼  │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  What topic are you exploring?                          │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name                              │
│                                                         │
│  What's the survey called?                              │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Post-launch satisfaction    │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Which questions should Qori focus on?      (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Q5, Q8, open-ended         │                  │
│  │ responses                         │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Upload survey data                                     │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  CSV or Excel files — up to 10 files                    │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

### Implementation

- Register `discovery_type` action in events.ts
- On action fire: read selected type, rebuild blocks with type-specific fields, call `views.update`
- `file_input` `filetypes` parameter narrows per type (PDF/DOCX for desk/stakeholder, CSV/XLSX for survey)
- Survey name becomes a required `input` block (not optional-but-validated-in-handler)
- Description field omitted for survey (not useful)
- Submission handler unchanged — already branches on discovery type

### Discovery visibility add-on

Before the type selector, inject existing discovery context if any artifacts exist:

```
│  📋 *Existing discovery for your team:*                 │
│  📄 veteran-telehealth-barriers (desk, May 15) · 5 vars │
│  🎙 claims-process-stakeholders (stakeholder, May 18)   │
│  _These feed into your brief automatically._            │
│ ─────────────────────────────────────────────────────── │
```

Uses `loadDiscoveryArtifacts()` — same function the brief handler already uses. Loaded in the command handler before opening the modal.

---

## Approach B: Sections-with-accessories hub

Like the `/qori-plan` study setup hub. `/qori-discover` opens a hub listing the 3 discovery types as sections with "Start" buttons. Each button opens a type-specific modal via `views.push`.

### Hub modal

```
┌─────────────────────────────────────────────────────────┐
│  Discovery research                          [Close]    │
├─────────────────────────────────────────────────────────┤
│  Pre-study research that informs your brief. Upload     │
│  documents and Qori synthesizes themes, barriers, and   │
│  recommendations.                                       │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│  📄 *Desk research*                          [Start]    │
│  Reports, competitive analysis, background docs         │
│                                                         │
│  🎙 *Stakeholder synthesis*                  [Start]    │
│  Transcripts from internal interviews                   │
│                                                         │
│  📊 *Survey synthesis*                       [Start]    │
│  Survey exports (CSV, Excel)                            │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│  📋 *Your team's discovery so far*                      │
│                                                         │
│  📄 veteran-telehealth-barriers · May 15 · 5 variables  │
│  🎙 claims-process-stakeholders · May 18 · 6 variables  │
│  📊 post-launch-survey · May 20 · 4 variables           │
│                                                         │
│  _These feed into your brief automatically when you     │
│  run /qori-brief._                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**No submit button needed.** Hub has no `input` blocks — the sections use `button` accessories (not `input` blocks). The "Start" buttons are actions that open type-specific modals. "Close" closes the hub.

Wait — the plan modal hub HAS a submit button because the study selector is an `input` block. But the discovery hub has no study selector and no input blocks. **This hub can omit submit.** Each action button handles its own flow.

### Type-specific modal (desk research example, via views.push)

```
┌─────────────────────────────────────────────────────────┐
│  Desk research                               [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📄 Upload reports, competitive analysis, or background  │
│  docs. Qori extracts barriers, metrics, and knowledge   │
│  gaps.                                                  │
│ ─────────────────────────────────────────────────────── │
│  What topic are you exploring?                          │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Veteran telehealth barriers │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name                              │
│                                                         │
│  What are these documents about?            (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Upload files                                           │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  PDF, Word, text, or markdown — up to 10 files          │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

### Type-specific modal (survey synthesis)

```
┌─────────────────────────────────────────────────────────┐
│  Survey synthesis                            [Cancel]   │
├─────────────────────────────────────────────────────────┤
│  📊 Upload survey exports. Qori identifies themes,       │
│  findings, and demographic patterns.                    │
│ ─────────────────────────────────────────────────────── │
│  What topic are you exploring?                          │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│  Used as the artifact name                              │
│                                                         │
│  What's the survey called?                              │
│  ┌───────────────────────────────────┐                  │
│  │ e.g., Post-launch satisfaction    │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
│  Which questions should Qori focus on?      (optional)  │
│  ┌───────────────────────────────────┐                  │
│  │                                   │                  │
│  └───────────────────────────────────┘                  │
│ ─────────────────────────────────────────────────────── │
│  Upload survey data                                     │
│  ┌───────────────────────────────────┐                  │
│  │ 📎 Drag or click to upload        │                  │
│  └───────────────────────────────────┘                  │
│  CSV or Excel — up to 10 files                          │
│                                                         │
│                                    [Analyze]            │
└─────────────────────────────────────────────────────────┘
```

### Implementation

- `/qori-discover` command handler opens the hub modal (no `input` blocks, no submit)
- 3 new action registrations: `discover_desk_research`, `discover_stakeholder_synthesis`, `discover_survey_synthesis`
- Each action opens a type-specific modal via `views.push` (or `views.update` — hub is replaced)
- 3 separate modal definitions (or 1 factory function with type parameter)
- 3 separate view submission handlers (or reuse existing `handleDiscoverSubmission` with the type extracted from `private_metadata` instead of form values)
- Hub loads existing discovery artifacts via `loadDiscoveryArtifacts()` for the visibility section
- `file_input` `filetypes` is type-specific at modal build time — no runtime filtering needed
- Survey name is a required `input` block in the survey modal only — no conditional-required hack

---

## Tradeoff table

| Criterion | A: Adaptive single modal | B: Sections-with-accessories hub |
|---|---|---|
| **Researcher mental model** | Familiar — same modal, content changes. But "type selector that rebuilds the form" is unusual in Slack. Researchers may not expect the modal to change on selection. | Familiar — matches `/qori-plan` hub pattern researchers already use. "Pick a type, get a focused form" is a common Slack pattern (Donut, Polly). |
| **Block Kit constraints** | Requires `discovery_type` action registration + `views.update` handler. `submit` must always be present (type selector is an `input` block). File upload filetypes update requires rebuilding the `file_input` block. | Hub has no `input` blocks → no `submit` required (avoids the "Done" button problem). Type-specific modals are static — no dynamic block updates. File types are hardcoded per modal. |
| **Pain point 1: No progress notification** | Same fix either way — handler posts "Generating..." message. | Same. |
| **Pain point 2: Survey name required-but-optional** | **Solved.** Survey name only appears when survey is selected, marked required. | **Solved.** Survey name is in the survey-only modal, marked required. |
| **Pain point 3: File type mismatch** | **Solved.** `file_input` filetypes narrow when type is selected via `views.update`. | **Solved.** Each modal has its own `file_input` with type-specific filetypes. |
| **Pain point 4: No discovery visibility** | Can inject existing artifacts context block at top of modal. Loaded in command handler. | **Natural fit.** Hub shows existing artifacts as a section — researchers see what exists before choosing what to add. |
| **Pain point 5: No iteration/append** | Neither approach solves this — it's a handler/variable-store concern, not a modal concern. | Same. |
| **Pain point 6: No next-step guidance** | Handler can add "Next: run /qori-discover again for stakeholder interviews" to the success message. | Hub naturally shows all options — researcher sees what other types are available. Hub can show "recommended next" based on what's been done. |
| **Number of modals** | 1 (dynamic) | 4 (1 hub + 3 type-specific) |
| **Number of action registrations** | 1 (discovery_type action for views.update) | 3 (one per type button) |
| **Handler complexity** | Single handler branches on type (current pattern). Type selector action handler adds complexity for views.update. | Can reuse single handler if type is in `private_metadata`. Or split into 3 focused handlers. |
| **Code simplicity** | More complex — dynamic block rebuilding, action handler for type change, submit always present. | Simpler — static modals, no dynamic updates. Hub is a new modal but trivial (no input blocks). |
| **Future extensibility** | Adding a 4th discovery type means adding a select option + field set in the views.update logic. | Adding a 4th type means adding a section to the hub + a new modal definition. More files, but each is isolated. |
| **Cascade visibility** | Possible but fights for space in the same modal. | **Natural.** Hub is the right place to show "what discovery exists" — it's a dashboard, not a form. |

---

## Recommendation signal (not a decision)

Approach B (hub) has stronger alignment across all criteria. Key reasons:

1. **Matches existing pattern.** Researchers already use the `/qori-plan` hub. `/qori-discover` hub would feel consistent.
2. **Avoids Block Kit friction.** No dynamic `views.update`, no always-present submit button, no runtime filetype switching.
3. **Discovery visibility is natural.** The hub is the right surface to show "here's what your team has discovered so far" — it's a dashboard moment before the researcher commits to an action.
4. **Each type gets a focused modal.** Survey fields only appear in the survey modal. Desk research fields only in desk research. No conditional logic, no mental filtering.
5. **Simpler code.** Static modals vs. dynamic block rebuilding. The hub is trivial (no input blocks). The type-specific modals are small and isolated.

Approach A is viable and has fewer moving parts (one modal vs. four). If the team prefers fewer files and a more compact UX, it works. The `views.update` pattern is proven in the codebase (plan modal opener already does it for cascade readiness blocks).

The tradeoff is: **A is fewer files but more runtime complexity. B is more files but each one is simple and static.**

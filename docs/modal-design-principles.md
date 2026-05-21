# Qori Modal Design Principles

**Last updated:** 2026-05-21
**Status:** Reference document for modal design and review
**Companion to:** Slack Block Kit design guidelines (https://api.slack.com/block-kit/designing)

This document captures the design principles Qori's modals should follow. It's a working reference, not a rigid spec — the goal is internal consistency across modals and a feel that matches what researchers expect from polished Slack apps like Donut, Polly, and Linear.

The principles below combine Slack's official guidelines with patterns observed in well-designed Slack apps and Qori-specific learnings from the cascade architecture.

---

## Core principles

### 1. One primary action per modal

Each modal does one thing. Plan modal generates a plan. Brief modal captures a brief. Outreach modal records outreach. Don't combine multiple primary actions into one modal — split into separate flows or use `views.push` for confirmation steps.

The submit button label should match the action. "Generate plan" not "Submit." "Approve brief" not "OK." "Record outreach" not "Save."

### 2. Defaults are confidence, not laziness

Every field that can be pre-filled should be. The cascade architecture exists specifically to enable this — brief commitments flow to plan defaults, plan decisions flow to fieldwork defaults, fieldwork decisions flow to analysis defaults.

A researcher opening the plan modal after approving a brief should see most fields already filled with the brief's values. The modal's job is to let them confirm and tweak, not enter from scratch.

When defaults come from cascade, surface that gently: "Pre-filled from brief" as help text, not a banner. Researchers should be able to override without ceremony.

When no cascade exists, fall back to "researcher's last study used X." Then to "most common choice across the team's studies." Then to a sensible system default. Avoid blank fields — they make the modal feel like a form rather than a tool.

### 3. Help text below, not in placeholders

Placeholders disappear when typing. Help text persists. Use Slack's `hint` field for instructions that researchers might need while filling out the field.

Good help text is specific. "e.g., '8-12 veterans, including 3 screen reader users'" is more useful than "Enter participant composition." When the help text is doing real work, researchers don't need to ask "wait, what goes in this field?"

Avoid help text that just restates the label. The label says "Recruitment sources." Help text shouldn't say "Where will you recruit from?" — that's redundant. Help text should clarify scope or give a concrete example.

### 4. Conditional fields appear conditionally

When a field is only relevant in certain contexts, hide it until that context exists. Use `views.update` to revise the modal when a triggering choice is made. Don't show every possible field upfront and ask researchers to skip the irrelevant ones.

Example: `/qori-discover` uses a hub modal with three "Start" buttons (desk research, stakeholder synthesis, survey synthesis). Each opens a type-specific modal with only the fields relevant to that type. Survey-specific fields (survey name, question focus) only appear in the survey modal. File type filtering narrows per type.

The cost is one extra interaction (the type selection). The benefit is researchers see only the fields that apply to them. The cost is worth paying.

### 5. Visual hierarchy through section headers

Use Block Kit's `header` blocks to group related fields, not just `divider` blocks. Headers create scannability — researchers can find the section they need without reading every field.

A brief modal might have headers for: Study basics, Research scope, Participants, Timeline & budget. A plan modal might have: Study, Sessions, Risks. Each header is 2-4 fields underneath.

Avoid more than 3-4 section headers per modal. If you need more, the modal is doing too much and should be split.

### 6. Copy reads like a person wrote it

The Slack apps that feel polished use conversational copy. Donut asks "What do you want to call it?" not "Channel Name." Polly's surveys feel like a conversation, not a database form.

Qori's labels should follow the same pattern:
- "What's this study about?" not "Study description"
- "Who are you researching with?" not "Participant criteria"
- "When do you need to decide?" not "Decision deadline"
- "What's the budget?" not "Total budget amount"

Question form invites engagement. Noun form invites compliance. Researchers prefer engaging tools.

Where formal language is required (regulatory contexts, federal customer documents), use formal language. Internal modals where researchers do their work don't need formality.

### 7. Emoji as semantic punctuation, not decoration

Emojis work in Slack modals when they carry meaning. Donut's "✨ Intros" and "💧 Watercooler" buttons use emojis to differentiate two modes at a glance. The emoji is part of the meaning.

Avoid emojis as decoration ("📝 Enter your notes:"). The emoji adds noise without adding information.

Good uses for Qori:
- Status indicators: ✅ approved, ⚠️ needs review, ⏸ paused, 🚀 launched
- Type differentiation: 📋 brief, 🎯 plan, 🔍 discovery, 📊 synthesis
- Feedback callouts: 💡 tip, ⚡ shortcut, 🎉 success

Bad uses:
- Decorating every label with an emoji
- Emojis that don't carry meaning ("📥 Submit" — what does the inbox emoji add?)
- Multiple emojis in one button or header

### 8. Destructive actions confirm; constructive actions don't

Deleting a study, archiving fieldwork, or rejecting a brief should require confirmation via `views.push`. The confirmation modal asks "Are you sure you want to delete X?" with a clear destructive button and an obvious escape.

Constructive actions (generating, approving, saving) shouldn't require confirmation. Friction on the right action is friction on the work. Researchers should be able to flow through the approve-and-generate sequence without "are you sure?" prompts.

### 9. Errors surface contextually, not generically

When a researcher submits a modal with missing required fields or invalid input, Slack shows the error attached to the specific field. Use this pattern consistently. Don't show a generic "Please fill out all required fields" — show which field, why, and what to do.

For cascade contract violations (brief is missing required upstream data), the cascade context block at the top of the modal should surface the specific gap with the recovery action, as discussed in the cascade UI redesign. Generic "cannot generate" errors are noise.

For external API failures (Slack API down, GitHub API rate-limited), show a friendly error with what happened and what to try. "Something went wrong on our end. We've logged it — try again in a minute, and if it keeps happening, message #qori-help."

### 10. Submit, then close — don't make researchers wait

When a modal submits and triggers a long-running operation (LLM generation, file processing), close the modal immediately and surface progress in the channel. Don't make researchers stare at a loading modal for 30 seconds.

The pattern: submit ack closes the modal. A "Generating your plan..." message appears in the channel. When generation completes, the message updates with the result and a CTA. Researchers can do other things during the wait.

This pattern is implemented via `ack()` returning quickly, then the handler doing the slow work asynchronously and updating the channel via `chat.postMessage` or `chat.update`.

---

## Specific patterns to emulate

### Donut's mode toggle pattern

The "Start a Donut Channel" modal shows two big toggle buttons at the top: "✨ Intros" and "💧 Watercooler." One is selected (highlighted background); one is not. This makes the mode choice visually obvious and easy to switch.

Qori can use this for:
- Method override in `/qori-plan` (Use brief's method, Override)
- Outreach type in outreach modal (DM, Email, Phone)

Note: `/qori-discover` used to be a candidate for this pattern but was redesigned as a hub modal instead — the sections-with-accessories pattern (see below) fit better when each mode has entirely different fields.

The pattern: 2-4 toggle buttons at the top, one selected by default (the most common choice or the cascade-suggested choice), researcher can switch with one tap. The rest of the modal updates to reflect the chosen mode.

### Suggested-value hint pattern

Donut shows a suggestion below the channel name input: "We suggest something like #watercooler-chats or #virtual-watercooler". The hint uses `#code` styling to make it copy-able.

Qori can use this for:
- Study name field (suggest from discovery topic)
- Recruitment sources (suggest based on past studies)
- File naming (show what the auto-generated filename will be)

The pattern: free-form input with help text below showing concrete suggestions. Researchers can take the suggestion (one tap), modify it, or ignore it.

### Soft secondary action pattern

Donut's "♻️ Use existing channel instead" is a soft secondary action — same row as the primary input, but visually subordinate (icon-prefixed, no fill, smaller). It's an escape hatch for researchers whose situation doesn't fit the primary path.

Qori can use this for:
- "Use existing study instead" when creating a new study with a name that exists
- "Load from past brief" when starting a brief from scratch but a similar brief exists
- "Skip discovery, go straight to brief" for researchers who already have context

The pattern: primary path is obvious and confident. Secondary path is available but visually quiet.

### Encouragement-style notifications

Donut's badge notification reads warmly: "Nice work, Lapedra! You unlocked the First Bite badge..." Second-person address by name, specific accomplishment, clear CTA.

Qori's success notifications can adopt this tone:
- "Nice work, Lapedra! Your brief is approved and ready for the plan."
- "Plan generated. The team has it in #va-mobile-adoption."
- "Outreach recorded. PT-003 status updated to contacted."

The pattern: address the researcher by name when appropriate, name the specific accomplishment, provide a clear next step or context.

---

## Qori-specific anti-patterns to avoid

### The "everything visible at once" modal

Plan modal v1 showed every possible field upfront: methodology selection, recruitment, session count, note-taker, observer, operational risks, materials, etc. Researchers had to scroll past most of them on every plan generation.

Fix: hide fields that flow from cascade (cascade UI redesign). Hide conditional fields until the trigger appears. Show only fields the researcher needs to provide for this specific plan.

### The "useless cascade recap" block

Plan modal v1 showed a recap of all cascade variables at the top, regardless of state. Green checkmarks for everything present, even when everything was present. Researchers saw the same recap every time.

Fix: hide when complete, surface only problems (already approved as cascade UI redesign workstream).

### The "form ID field" pattern

Some modals show database-style fields like "Study ID" or "Channel ID" that researchers have no business typing. These should be auto-populated, not user-entered.

Fix: any field a researcher can't reasonably know shouldn't be a field. Compute it from context.

### The "everything required" pattern

When every field is marked required, researchers can't make progress until they have answers to everything. This forces premature decisions or blocks workflow.

Fix: only mark required what's genuinely required for the cascade contract or downstream action. Everything else is optional. Researchers can come back and refine later.

---

## How to use this document

When designing or refining a Qori modal:

1. Check which principles apply to the modal's use case
2. Look for anti-patterns in the current design
3. Reference Donut, Polly, or Linear for similar interaction patterns
4. Prototype in Block Kit Builder before implementation
5. Test with a researcher (or yourself) — does the flow feel like work, or does it feel like tooling?

When in doubt: favor defaults over fields, conversational copy over formal labels, visible hierarchy over uniform flatness, and trust over confirmation.

Block Kit Builder: https://app.slack.com/block-kit-builder/
Slack design guidelines: https://api.slack.com/block-kit/designing

---

## Pre-merge anti-pattern checklist

Run this checklist during audits (before design), implementation (during code review), and PR review (before merge). Every modal change should pass all four checks.

### 1. Form ID fields

**Detection:** Any `input` block where the researcher types or confirms a value the system already knows — study name from a previous selection, channel ID, database record identifier.

**Fix:** Replace with a non-editable `context` block for display. Handler reads from `private_metadata` (already set by the opener), not from form values.

**Examples:**
- Plan modal `study_folder_block` → context block (PR #156)
- Discussion guide `study_name` → context block (PR #159)
- Discovery hub has no study selector at all — discovery is pre-study

**How to spot it:** If the opener sets `initial_value` on a text input from metadata or a previous selection, the field is a form ID field. The researcher isn't providing new information — they're confirming what the system already knows. Convert to context display.

### 2. Cascade-blank inputs

**Detection:** Any field that starts blank when upstream cascade variables contain the answer. The researcher is retyping what the brief (or other upstream template) already produced.

**Fix:** Opener loads study variables via `readStudyVariables()`, formats the cascade data, and sets `initial_value` on the field. The researcher sees the pre-fill and can edit/refine.

**Examples:**
- Discussion guide "Research focus" pre-filled from `research_objectives` (PR #159)
- Discussion guide "Research questions" pre-filled from `research_questions` with RQ IDs (PR #159)
- Discussion guide "Methodology" pre-selected from `methodology_selection` via explicit enum map (PR #159)

**How to spot it:** Compare the modal's fields against the YAML template's `consumes` block. Any consumed variable that has a matching modal field should be pre-filled. If the `yamlProcessor` auto-loads the variable for the LLM but the modal doesn't show it to the researcher, the researcher is blind to data the system already has.

### 3. Formal labels

**Detection:** Labels in noun form ("Research method", "Session duration", "Stakeholder role") rather than question form.

**Fix:** Rewrite as questions: "How are you running this session?", "How long is each session?", "What's their role?"

**Examples:**
- Plan modal: "Lead researcher" → "Who's leading this study?" (PR #156)
- Discussion guide: "Research goal / focus" → "What should this session focus on?" (PR #159)
- Discovery hub: "Topic" → "What topic are you exploring?" (PR #163)

**How to spot it:** Read each label aloud. If it sounds like a database column name, it's formal. If it sounds like something a colleague would ask, it's conversational. Exceptions: select dropdowns where the options speak for themselves (methodology, session length) — conversational labels are nice but the options do the real work.

### 4. Missing cascade gates

**Detection:** A modal shows the full form when required cascade variables are missing. The researcher fills out the form, submits, and gets a `TemplateContractError` DM — wasted time.

**Fix:** Opener checks cascade readiness via `buildCascadeReadiness()`. When required variables are missing, show a warning-only view: study name context block + specific warning listing what's missing and how to fix it. No form fields, no submit button.

**Examples:**
- Plan modal: gates on `research_objectives`, `research_questions`, `methodology_selection`, `target_barriers` (PR #156)
- Discussion guide: same gate pattern (PR #159)
- Discovery hub: no gate needed — discovery is the cascade root, nothing upstream

**How to spot it:** Check the YAML template's `consumes` block for `required: true` variables. If any are required, the modal needs a gate. If all consumed variables are optional, no gate needed (handler fallbacks cover it).

**When NOT to gate:** Discovery modals, stakeholder modals where all upstream is optional, any modal where the researcher is providing genuinely new information (not consuming cascade data).

### How to use this checklist

**During audit:** Run all 4 checks against the current modal. Document findings in the audit doc (see `docs/qori-plan-modal-audit.md` and `docs/qori-discussion-guide-modal-audit.md` for format).

**During implementation:** Before writing code, verify the proposed modal design passes all 4 checks. The check often reveals fields to remove, pre-fills to add, or labels to rewrite.

**During PR review:** Reviewer runs the 4 checks against the diff. Any new `input` block should be evaluated: is it a form ID field? Could it be pre-filled? Is the label conversational? Does the modal need a gate?

### Precedents

Three modal redesigns have proven these patterns:

| Modal | PRs | Patterns applied |
|---|---|---|
| Plan modal (`/qori-plan`) | #156, #158 | Form ID → context block, cascade gate, conversational copy, `users_select` for people fields |
| Discussion guide (`/qori-plan` → Create) | #157, #159, #160 | Cascade pre-fill (focus, questions, methodology), cascade gate, enum normalization, generating notification |
| Discovery hub (`/qori-discover`) | #163 | Hub pattern (no input blocks → no submit), type-specific modals with narrowed file types, discovery visibility, next-step guidance |

### Future modal work to audit

These modals haven't been through the anti-pattern checklist yet:

- **`/qori-brief` modal** — the largest modal in the system. Has the discovery checkbox section which should get the D6 indicator. Formal labels throughout.
- **`/qori-analyze` session summary modal** — file selection may be a manual-selection-when-cascade-knows anti-pattern.
- **`/qori-synthesis` modals** — 7 synthesis types, each with file selection. The synthesis ordering modal shows recommended analysis order but the individual modals may have cascade-blank fields.
- **`/qori-fieldwork` modals** — participant tracker, observer, outreach. The `users_select` conversion is done (PR #157) but other anti-patterns haven't been audited.
- **Outreach modals** — the `basicInfoBlock` was simplified (PR #157) but the full outreach flow hasn't been audited.

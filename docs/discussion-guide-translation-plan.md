# Discussion Guide Translation Plan

**Date:** 2026-04-30
**Status:** Phase 1 — Investigation complete, awaiting authorization
**Source:** `docs/design-references/discussion_guide_reference.md` (locked design, ~333 lines)
**Target:** `config/prompts/discussion_guide.yaml` (current v6.1 → proposed v6.2)
**Modal:** `backend/src/helpers/slack/ui/discussionGuideModal.js`
**Handler:** `backend/src/helpers/slack/events.js` lines 1690-1818
**Pattern:** C (document-level footer only — planning document)

---

## Section A: Output design diff

### Current output (v6.1): 4 AI tasks, ~250 rendered lines

| Section | Current | Locked design | Status |
|---------|---------|---------------|--------|
| Title + context | `# Discussion Guide` + AI-generated study name + timing table + research objectives | `# Discussion Guide: [Study Title]` + masthead + Summary + metadata table + session timing table | **RESTRUCTURED** |
| Introduction script | Welcome/Purpose/Consent/Ground Rules as bold sub-headings | `## 01 &nbsp;&nbsp; Introduction and consent` with H4 sub-sections (Welcome, Session purpose, Consent, Ground rules, Confirm checklist) | **RESTRUCTURED** — editorial numbering + script as blockquotes |
| Warm-up | Numbered questions with "Why this matters" notes | `## 02 &nbsp;&nbsp; Warm-up` with numbered questions + "Why this matters" italics + AT conditional section | **PRESERVED** — mostly same, editorial numbering added |
| Main activities | Jinja2-branched by method (usability/interviews/concept/fallback) | `## 03 &nbsp;&nbsp; Tasks` with per-task blocks (Scenario/Instruction/Success criteria/Observe/Probe) | **RESTRUCTURED** — more structured task blocks |
| Post-session | 8 questions with follow-ups | `## 04 &nbsp;&nbsp; Retrospective` — 6 questions, cleaner format | **RESTRUCTURED** — fewer questions, no follow-up notes |
| Closing | Thank you/Next steps/Compensation/Follow-up | `## 05 &nbsp;&nbsp; Closing` with Thank you/What happens next/Compensation/Final question + confirm checklist | **PRESERVED** — mostly same |
| Synthesis prompts | After-session self-reflection questions | After-session debrief (same concept) | **PRESERVED** — renamed |
| Emergency procedures | Technical/Distress/Privacy | Same | **PRESERVED** |
| Checklists | Before/After session checklists | Moved into section confirm blocks (Introduction, Closing) | **RESTRUCTURED** |
| **NEW: Research Objectives** | In current output | **REMOVED** as separate section — objectives inform warm-up/tasks | — |
| **NEW: Session timing** | In current output | Cleaner table with "Running" column | **RESTRUCTURED** |
| **NEW: Approval section** | Not in current | Not in locked design | **Not adding** |

### Key structural changes

1. **Editorial numbering** — `## 01 &nbsp;&nbsp; Introduction and consent` through `## 05 &nbsp;&nbsp; Closing`. The discussion guide IS a sequential document.
2. **Script text in blockquotes** — `> Hi [participant], thank you...` — visually distinguishes what to read aloud from researcher instructions.
3. **Tasks have consistent sub-structure** — Scenario (blockquote) → Instruction (blockquote) → Success criteria → Observe → Probe. Each task is `### Task 01 ·&nbsp; X min ·&nbsp; [Name]`.
4. **Confirm checklists** — `- [ ]` items in Introduction and Closing sections for session protocol.
5. **After-session debrief** — separate section after Closing, not in appendix.
6. **Emergency procedures** — stays as a standalone section.

---

## Section B: Existing Jinja2 conditional analysis

### Current conditionals in v6.1 (in task `section_2_activities`)

```
{% if research_method == "usability_testing" %}
  → Generates Task 1/2/3 format with Scenario/Instruction/Success Criteria/Observe/Probe
{% elif research_method == "user_interviews" %}
  → Generates Topic Area 1/2/3 with Primary Question/Follow-up Probes/Listen For
{% elif research_method == "concept_testing" %}
  → Generates Concept 1/2 with Show/Initial Reaction/Comprehension/Value/Comparison
{{else}}
  → Generates generic Activity 1/2 with Setup/Instructions/What to Capture
{% endif %}
```

**Variables driving branching:** `research_method` (from modal static_select)
**Source:** Modal input, not AI-task output
**Conditions currently supported:** 4 (usability_testing, user_interviews, concept_testing, fallback)

### What's missing from current conditionals
- Card sorting
- Tree testing
- Contextual inquiry
- Mixed methods (treated as fallback currently)

---

## Section C: New conditional logic design

### Two axes of variation

**Axis 1: Methodology** — determines the structure of Section 03 (Tasks/Questions/Activities):

| Method | Section 03 structure |
|--------|---------------------|
| Usability testing | Task blocks: Scenario → Instruction → Success criteria → Observe → Probe |
| User interviews | Topic blocks: Primary question → Follow-up probes → Listen for |
| Card sorting | Setup → Sort instructions → Reflection questions |
| Concept testing | Concept blocks: Reveal → Reaction → Comprehension → Value |
| Contextual inquiry | Observation blocks: Activity → What to observe → When to probe |
| Tree test | Setup → Tree question blocks: Question → Expected path → Record |
| Mixed methods | Hybrid: Tasks + Interview topics (split session) |

**Axis 2: Number of tasks/topics** — `task_count` from modal (3/5/7):

The LLM generates the specified number of task/topic/concept blocks. The prompt instruction references `{{task_count}}` to control quantity.

### Proposed Jinja2 logic

Keep Jinja2 conditionals in the prompt (same approach as current v6.1). The branching is clean and each method produces a distinct structure. Single prompt task with Jinja2 branching is simpler than multiple tasks.

**New approach:** Consolidate from 4 AI tasks → 1 comprehensive task (like affinity mapping v3.0). The 4-task split was to prevent truncation, but with `max_tokens: 8192` this is no longer necessary. A single task produces a more coherent document.

**Variables needed:**
- `research_method` — from modal
- `task_count` — from modal (new field)
- `session_length` — from modal
- `research_focus` — from modal
- `research_questions` — from modal
- `lead_researcher` — from modal (auto-filled)
- `selected_study` — from study selector

---

## Section D: Modal field analysis

### Current modal (discussionGuideModal.js, 238 lines)

| Field | Block ID | Action ID | Type | Keep? |
|-------|----------|-----------|------|-------|
| Study name | `study_name` | `value` | text (auto-filled) | **Yes** |
| Research focus | `research_focus_block` | `research_focus` | textarea | **Yes** — rename label to "Research goal / focus" |
| Research questions | `research_questions_block` | `research_questions` | textarea | **Yes** |
| Participants | `participants_block` | `participants` | textarea | **Remove** — not used in locked design output |
| Research method | `research_method_block` | `research_method` | static_select (4 options) | **Yes** — expand to 7 options |
| Session length | `session_length_block` | `session_length` | static_select (4 options) | **Yes** |
| Testing URL | `testing_url_block` | `testing_url` | text (optional) | **Remove** — not in locked design |

### Proposed modal fields

| Field | Block ID | Type | Required? | Notes |
|-------|----------|------|-----------|-------|
| Study name | `study_name` | text (auto-filled) | Yes | Preserved from current |
| Research goal / focus | `research_focus_block` | textarea | Yes | Relabeled |
| Research questions | `research_questions_block` | textarea | Yes | Preserved |
| Methodology | `research_method_block` | static_select | Yes | Expanded to 7 options |
| Session length | `session_length_block` | static_select | Yes | Preserved (30/45/60/90) |
| Number of tasks | `task_count_block` | static_select | Yes | **NEW** — 3/5/7 options |
| Lead moderator | `lead_moderator_block` | text | Yes | **NEW** — auto-fill from Slack profile |

### Dependency check on removed fields

| Removed field | Used elsewhere? | Safe to remove? |
|---------------|----------------|-----------------|
| `participants` | Passed to YAML as `participants` / `who_are_your_participants`. Used in current prompt but NOT in locked design output. | **Yes** — research plan already has participant info |
| `testing_url` | Passed to YAML as `testing_url`. Referenced in task 2 prompt but NOT in locked design. | **Yes** |

### Handler changes needed

The handler at `events.js:1774-1798` extracts fields and builds `guideData`. Changes:
- Remove `_participants` and `_testingUrl` extracts
- Add `task_count` extract from new `task_count_block`
- Add `lead_researcher` from `lead_moderator_block` (or auto-fill + extract)
- Add Slack profile fallback for lead moderator (same pattern as research plan)

---

## Section E: Handler analysis

**File:** `backend/src/helpers/slack/events.js`
**Modal open:** Lines 1690-1735 — `create_discussion_guide` action handler. Opens modal with study name pre-populated.
**Submission:** Lines 1737-1818 — `discussion_guide_modal` view handler.

### Current extract() calls

```js
_whatAreYouResearching = extract("research_focus_block", "research_focus");
_specificQuestions = extract("research_questions_block", "research_questions");
_participants = extract("participants_block", "participants");          // REMOVE
_researchMethod = extract("research_method_block", "research_method");
_sessionLength = extract("session_length_block", "session_length");
_testingUrl = extract("testing_url_block", "testing_url");             // REMOVE
```

### Proposed extract() calls

```js
research_focus = extract("research_focus_block", "research_focus");
research_questions = extract("research_questions_block", "research_questions");
research_method = extract("research_method_block", "research_method");
session_length = extract("session_length_block", "session_length");
task_count = extract("task_count_block", "task_count");                 // NEW
lead_researcher = extract("lead_moderator_block", "lead_moderator");    // NEW
```

### guideData object changes

```js
const guideData = {
  selected_study: studyName,
  study_name: studyName,
  research_focus,
  research_questions,
  research_method,
  session_length,
  task_count: task_count || '5',
  lead_researcher: lead_researcher || slackUserName,
};
```

---

## Section F: Inputs and rationale

### Required inputs
- Study metadata (from modal selector)
- Methodology (from modal)
- Session duration (from modal)
- Number of tasks (from modal)
- Research goal/focus (from modal)
- Lead moderator (auto from Slack)

### Recommended inputs
- Research plan (if exists) — helps ground warm-up and retrospective in study objectives. However, the discussion guide handler does NOT currently pull the research plan. This would be a follow-up enhancement.

### Excluded inputs
- All synthesis-layer files (don't exist when guide is created)
- Session summaries, affinity maps, personas (don't exist yet)
- Participant details — research plan already has this

---

## Section G: Pattern C application

- No per-finding Confidence indicators
- No per-finding Sources lines
- No References list (the guide IS the methodology tool)
- No Related Artifacts appendix (minimal — could reference research plan if present, but optional)
- Backend footer only (remove `*Generated by Qori*` from prompt output)

---

## Section H: Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Jinja2 branch for new methods untested** | Medium | Wrong structure for card sort/tree test | Test each methodology individually after deploy |
| **Single-task consolidation truncates** | Low | 333-line locked design is within 8192 token budget | Monitor output completeness; if truncated, split back to 2 tasks |
| **task_count field not intuitive for interviews** | Medium | Interviews have "topics" not "tasks" — field label may confuse | Label as "Number of tasks / topics" with methodology-aware hint |
| **Modal + handler + YAML coordination** | High if not simultaneous | Any mismatch crashes the flow | Single commit — non-negotiable |
| **Methodology fallback** | Low | Unlisted method gets generic structure | Fallback branch produces reasonable Activity 1/2/3 |

---

## Section I: Implementation order

All four steps ship in a **single commit**:

| Step | What | Effort |
|------|------|--------|
| 1 | Modal: reduce fields, add task_count + lead_moderator, expand methodology options | S |
| 2 | Handler: update extract() calls, add Slack profile lookup, add task_count | S |
| 3 | YAML: consolidate 4 tasks → 1, rewrite Jinja2 branches for 7 methods, new output_template matching locked design | L |
| 4 | Test across at least 2 methodologies | S |

**Total: L** (same scope as research plan translation)

---

## Section J: Flagged decisions

### Decision 1: Number of tasks — conditional visibility?

**Recommendation: Always show, label as "Number of tasks / topics".**

Hiding the field based on methodology would require a dispatch_action on the methodology select + a views.update call to rebuild the modal — significantly more complexity. The field is useful for all methods:
- Usability testing → number of tasks
- Interviews → number of topic areas
- Card sorting → number of sort exercises
- Concept testing → number of concepts

Label: "Number of tasks / topics" with hint: "How many main activities in the session (typically 3–7)."

### Decision 2: Task content approach

**Recommendation: Option 2 — grounded in research goal.**

The LLM generates task scenarios grounded in the research focus and research questions. The locked design demonstrates this: tasks like "Prescription refill" and "Appointment discovery" are specific to the VA mobile app navigation study, not generic placeholders.

Prompt instruction: "Generate tasks that are specific to {{research_focus}}. Each task scenario should test one of the research questions. Tasks should be realistic scenarios a participant would encounter in their actual use of the product."

### Decision 3: Methodology fallback

**Recommendation: Generic "Activity" format.**

If methodology doesn't match a known branch, the fallback produces:
```
### Activity 01 · X min · [Activity Name]
#### Setup
[How to introduce this activity]
#### Instructions
> "[What to say to participant]"
#### What to capture
- [Key observations]
```

This is functional for any method. The `{{else}}` branch in the current v6.1 already does this.

### Decision 4: Research plan integration

**Recommendation: Defer to follow-up.**

Pulling the research plan into the discussion guide would require: fetching it from GitHub, injecting its objectives/questions into the guide's warm-up and retrospective. The current handler doesn't do this. The researcher can reference their research plan while editing the generated guide. Not worth the implementation complexity for v6.2.

### Decision 5: Conditional implementation approach

**Recommendation: Jinja2 conditionals (current approach).**

The existing `{% if research_method == "usability_testing" %}` pattern works and is proven. A single prompt with conditional branches is cleaner than 7 separate prompts. The LLM sees the full context (method, session length, task count, research focus) and generates the appropriate structure.

Alternative (structured prompts where the LLM decides) would be less deterministic — the Jinja2 approach guarantees the right structure.

### Decision 6: Approval section

**Recommendation: No approval section for discussion guides.**

The locked design doesn't include one. Discussion guides are living documents — researchers modify them during the study as they learn. An approval checklist implies a formal sign-off that doesn't match how guides are used in practice. The research plan has the formal approval gate.

---

## Section K: Standards-level question

### Should planning docs use editorial numbering when sequential?

**Recommendation: Yes, when the document has inherent sequence.**

- Discussion guide: YES — sections are chronological (Introduction → Warm-up → Tasks → Retrospective → Closing). Numbering maps to the session flow.
- Research plan: NO — sections are categorical (Background, Objectives, Method). Order is flexible.

**Proposed addition to Section 4.2 of standards:**

> Editorial numbering is used on documents with inherent sequence: numbered findings in readouts, chronological sections in discussion guides, sequential steps in procedures. Not used on categorical documents (research plans, briefs) where section order is flexible.

---

## Summary

The discussion guide translation is a coordinated modal + handler + YAML change (same pattern as research plan v4.6). The main work is:

1. **YAML consolidation** — 4 AI tasks → 1 comprehensive task with Jinja2 branching for 7 methodologies
2. **New output format** — editorial numbering, script blockquotes, task sub-structure (Scenario/Instruction/Success criteria/Observe/Probe)
3. **Modal simplification** — remove participants and testing_url, add task_count and lead_moderator
4. **New methodology branches** — card sorting, tree test, contextual inquiry, mixed methods

All ship in a single commit. Effort: L.

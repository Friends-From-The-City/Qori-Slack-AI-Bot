# Research Plan Translation Plan

**Date:** 2026-04-30
**Status:** Phase 1 — Investigation complete, awaiting authorization
**Source:** `docs/design-references/research_plan_reference.md` (locked design, ~145 lines)
**Target:** `config/prompts/research_plan.yaml` (current v4.5 → proposed v4.6)
**Modal:** `backend/src/helpers/slack/ui/researchPlanGeneratorModal.js` + `events.js` handler
**Pattern:** C (document-level footer only — planning document, no findings traceability)

---

## Section A: Output design diff

### Current output (v4.5): ~292 rendered lines, 15 AI tasks

| Section | Lines | Status in locked design |
|---------|-------|------------------------|
| H1 + Product Area + Researcher + Date | 6 | **RESTRUCTURED** → H1 + masthead with Status field |
| Background | 8 | **PRESERVED** — renamed from decision_context expansion |
| OCTO Priorities | ~15 | **REMOVED** — VA-specific, not template-appropriate |
| User Journey | ~15 | **REMOVED** — assumptions before research happens |
| Research Goals | ~12 | **RESTRUCTURED** → "Objectives" with learning verbs |
| Success Criteria & Deliverables | ~20 | **SPLIT** — Deliverables separate section, Success Criteria removed |
| Methodology | ~20 | **RESTRUCTURED** → "Method" with bold-em-dash format |
| Detailed Research Protocols `<details>` | ~30 | **REMOVED** — belongs in discussion guide |
| Recruitment (participants + demographics) | ~25 | **RESTRUCTURED** → "Participants" with simpler composition |
| Project Timeline | ~15 | **PRESERVED** — cleaner table, keeps `> [!NOTE]` |
| Risk Management | ~20 | **RESTRUCTURED** → "Risks and mitigations" as clean table |
| Implementation Plan | ~15 | **REMOVED** — belongs in research readout |
| Research Team | ~8 | **RESTRUCTURED** → "Team and roles" table |
| | | |
| **NEW: Summary** | ~12 | **ADDED** — narrative + at-a-glance metadata table |
| **NEW: Research questions** | ~8 | **ADDED** — specific questions the research will answer |
| **NEW: Deliverables** | ~10 | **ADDED** — separate section listing all expected outputs |
| **NEW: Approval** | ~6 | **ADDED** — checkbox working agreement |

### Locked design: ~145 lines, proposed ~5-7 AI tasks

The locked design is **dramatically leaner**. It reads like a stakeholder-facing document, not an internal process dump.

### Section-by-section mapping

| Locked design section | Source | AI task needed? |
|----------------------|--------|----------------|
| H1: `# Research Plan: [Title]` | `project_title` from modal | No — template variable |
| Masthead with Status: Draft | `study_name`, `researcher_contact`, `current_date` | No — template variables + hardcoded "Draft" |
| Summary (narrative + metadata table) | LLM synthesizes from business context + methodology + participants | **Yes — 1 task** |
| Background | `decision_context` from modal, expanded by LLM | **Yes — 1 task** (existing `background` task, simplified) |
| Objectives | `research_goal` from modal, reformulated as learning verbs | **Yes — 1 task** (existing `research_goals` task, restructured) |
| Research questions | LLM derives from objectives + business context | **Yes — 1 task** (new) |
| Method | `methodology` from modal, expanded by LLM | **Yes — 1 task** (existing `methodology_details` task, simplified) |
| Participants | `target_participants` + `participant_count` from modal | **Yes — 1 task** (existing, simplified — no demographic sub-tables) |
| Timeline | `start_date` + `timeline_preference` from modal | **Yes — 1 task** (existing `timeline` task, preserved) |
| Deliverables | LLM generates based on methodology | **Partially** — could be static template with methodology-specific items |
| Team and roles | `lead_researcher` from modal | No — template variable |
| Risks and mitigations | LLM generates based on methodology + participants | **Yes — 1 task** (existing `risks` task, simplified to table) |
| Approval checkboxes | Static | No — hardcoded in template |
| Footer | Backend `buildTraceabilityFooter` | No |

**Proposed task count: 7** (down from 15). Removed tasks: `clean_product_area`, `product_description`, `octo_priorities`, `user_journey`, `success_criteria`, `deliverables`, `demographics`, `next_steps`, `detailed_protocols`, `formatted_participants`.

---

## Section B: Modal field analysis

### Current modal fields (from `researchPlanGeneratorModal.js`, ~606 lines)

| Field | Block ID | Type | Used in output? | Keep? |
|-------|----------|------|-----------------|-------|
| Study title | `study_title_block` | text | H1 title | **Yes** |
| Product area | `product_area_block` | text | Background, methodology, throughout | **Merge into business_context** |
| Decision context | `decision_block` | textarea | Background section | **Rename → business_context** |
| Research goal | `research_goal_block` | textarea | Objectives section | **Yes** |
| Methodology | `methodology_block` | multi_static_select | Method section | **Yes — change to single select** |
| Target participants | `target_participants_block` | textarea | Participants section | **Yes** |
| Participant count | `num_participants_block` | static_select | Participants section | **Yes** |
| Session duration | `session_duration_block` | static_select | **Dead key — never in output** | **Remove** |
| Incentive | `incentive_block` | static_select | **Dead key — never in output** | **Remove** |
| Start date | `start_date_block` | date_picker | Timeline section | **Yes** |
| Timeline preference | `timeline_block` | radio_buttons | Timeline section | **Yes** |
| Lead researcher | `lead_researcher_block` | text | Team section, masthead | **Yes** |
| Researcher title | `researcher_title_block` | text | **Dead key — never in output** | **Remove** |
| Researcher email | `researcher_email_block` | text | **Dead key — never in output** | **Remove** |
| Team office | `team_office_block` | text | Team section | **Remove** (simplify — auto from study) |

### Proposed modal fields (lean)

| Field | Type | Required? | Notes |
|-------|------|-----------|-------|
| Study title | text | Yes | Maps to `project_title` |
| Business context | textarea | Yes | Replaces `decision_context` + `product_area` — "What problem does this research inform? What decision will it support? 2-3 sentences." |
| Research goal | textarea | Yes | "What do you want to learn?" |
| Methodology | single select | Yes | Options: Usability Testing, User Interviews, Survey Research, Card Sorting, Concept Testing, Mixed Methods, Contextual Inquiry, Tree Test |
| Target participants | textarea | Yes | "Who should participate and why?" |
| Participant count | select | Yes | 5-8, 8-10, 10-15, 15+ |
| Start date | date_picker | Yes | When planning begins |
| Timeline preference | radio | Yes | Standard (5 weeks), Accelerated (2 weeks), Extended (8 weeks) |
| Lead researcher | text | Yes | Auto-filled from Slack profile if possible |

**Fields removed:** session_duration, incentive, researcher_title, researcher_email, team_office, product_area (merged into business_context).

### Dependency check on removed fields

| Removed field | Used elsewhere? | Safe to remove? |
|---------------|----------------|-----------------|
| `session_duration` | Not referenced in any YAML or handler | **Yes** |
| `incentive` | Not referenced in any YAML or handler | **Yes** |
| `researcher_title` | Not referenced in any YAML or handler | **Yes** |
| `researcher_email` | Study model has its own `researcher_email` set at creation. Not set from this modal. | **Yes** |
| `team_office` | Only in research_plan output_template. No downstream dependency. | **Yes** |
| `product_area` | Used by 8 of 15 current AI tasks. All of those tasks are being removed or restructured. The `business_context` field absorbs this information. | **Yes — but verify the handler `extract()` call still works** |

**Critical handler dependency:** The handler at `events.js:1247` extracts `product_area` from `product_area_block`. If we remove this block from the modal, the handler will get `undefined`. The handler itself needs updating to match the new modal field set.

---

## Section C: Inputs and rationale

### Required inputs
- **Study name and metadata** (from modal)
- **Researcher identity** (auto from Slack)
- **Business context** (from modal — what problem this research informs)
- **Methodology selection** (from modal)
- **Participant criteria** (from modal)
- **Timeline preference** (from modal)

### Recommended inputs
- None — research plan is the FIRST document in a study, no prior synthesis exists yet

### Excluded inputs
- Session summaries — don't exist when the plan is created
- Affinity maps, journey maps, personas — same reason
- All synthesis-layer files — research plan is forward-looking, not findings-grounded

---

## Section D: Pattern C application

Per Section 6 of standards:

- **No per-finding Confidence indicators** — no findings yet
- **No per-finding Sources lines** — no evidence yet
- **No "References" list** — the plan IS the methodology
- **No Related Artifacts appendix** — no related artifacts yet (this is the first doc)
- **Just the document-level footer** — handled by backend `buildTraceabilityFooter()`
- **No methodology section** — the plan IS the methodology (standard 4.10: "Planning documents... No methodology section (the document IS the methodology)")

---

## Section E: Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Modal simplification breaks handler** | High if not coordinated | Handler crashes on missing block_ids | Update handler `extract()` calls in the same commit as modal changes |
| **Removing product_area loses context** | Medium | Background section less specific | business_context textarea instruction explicitly asks for product/feature context |
| **7 tasks produce inconsistent output** | Low | Tasks run in parallel, each is independent | Each task gets the same input variables, no cross-task dependencies |
| **Content compression** | Medium | LLM pads output to fill expectations | Explicit prompt: "Be concise. This document should be ~2 pages when printed, not 5." |
| **Researchers ask "where did OCTO Priorities go?"** | Medium | Confusion during transition | Add a note in CLAUDE.md: OCTO Priorities were removed from the research plan template because they're VA-internal process, not research methodology. If needed, they can be added to a separate compliance addendum. |
| **Approval checkboxes — do they render?** | Low | GitHub renders `- [ ]` as clickable checkboxes | Already proven in other documents (follow-up research task lists) |
| **Status: Draft in masthead** | Low | Researchers need to know they can change it | Add `> [!NOTE]` after approval section: "Update the Status field in the masthead when this plan is approved" |

---

## Section F: Implementation order

| Step | What | Effort | Dependency |
|------|------|--------|------------|
| 1 | **Modal simplification** — reduce fields, update labels | M | None — but must be coordinated with step 2 |
| 2 | **Handler update** — update `extract()` calls to match new modal fields | S | Depends on step 1 field names |
| 3 | **YAML template restructure** — rewrite output_template + reduce to ~7 tasks | L | Depends on step 2 (variable names) |
| 4 | **Test end-to-end** — modal → handler → YAML → GitHub output | S | All previous steps |
| 5 | **Update CLAUDE.md** — document OCTO removal reasoning | XS | After testing |

**Steps 1-3 MUST ship in a single commit** to avoid broken intermediate states. The modal, handler, and YAML are tightly coupled — changing one without the others causes crashes.

**Total effort: L** (larger than previous template translations because of the modal + handler changes).

---

## Flagged decisions

### Decision 1: Approval checkboxes

**Options:**
- **A: Markdown checkboxes** — `- [ ] Reviewed by lead researcher`. GitHub renders these as clickable. Interactive, visual, but someone could accidentally click without understanding the implication.
- **B: Static "Sign-off" section** — Prose paragraph: "This plan requires review and approval by the lead researcher and product stakeholder before recruitment begins."

**My recommendation: Option A (checkboxes).** They match the locked design. GitHub's clickable checkboxes create a lightweight approval workflow without building custom infrastructure. The visual progress of checking boxes is motivating. Add a line above: "Check each item when complete — this plan becomes a working agreement once all items are checked."

### Decision 2: Status field

**Recommendation: Hardcode "Draft" in the template.** Don't add a modal field.

Researchers edit the markdown on GitHub to change status after approval. This is intentional friction — changing status should be a deliberate act, not a casual modal click. The masthead pattern already supports it: `**Status:** Draft`.

If we later want a `/qori-approve` flow that programmatically changes status, that's a separate feature.

### Decision 3: Timeline presets

**Proposed date math:**

| Preset | Total | Planning | Recruit | Fieldwork | Analysis | Reporting |
|--------|-------|----------|---------|-----------|----------|-----------|
| Standard (5 weeks) | 35 days | 1 week (7d) | 1.5 weeks (10d) | 1 week (7d) | 3 days | 2 days |
| Accelerated (2 weeks) | 14 days | 2 days | 4 days | 4 days | 2 days | 2 days |
| Extended (8 weeks) | 56 days | 2 weeks (14d) | 2 weeks (14d) | 2 weeks (14d) | 1 week (7d) | 1 week (7d) |

The timeline task already uses the Standard preset math. Accelerated and Extended just need different durations in the prompt. The `start_date` + preset → LLM calculates end dates for each phase.

### Decision 4: Business context field

**Recommendation: One textarea is sufficient.** Researchers naturally write what they need:

> "The VA Health & Benefits Mobile App's navigation currently produces a 45% task abandonment rate. We need to identify which navigation pathways cause abandonment and what IA changes will reduce it. Findings will inform the Q3 2026 redesign sprint."

This naturally includes: what the product is, what the problem is, and what decision the research informs. Splitting into 3 separate fields (`product_area`, `decision_context`, `research_goal`) creates artificial boundaries that don't match how researchers think.

The placeholder text guides: "What problem does this research address? What product or feature is involved? What decision will the findings inform? (2-3 sentences)"

### Decision 5: Modal field validation

**Recommendation:**
- **Required:** Study title, business context, methodology, target participants, participant count, start date, timeline preference, lead researcher
- **Optional:** None — all fields contribute to a usable plan. Making everything required ensures the LLM has enough context to generate a substantive document.

---

## What's preserved from current v4.5

- Timeline task with {% raw %}`{{start_date}}`{% endraw %} date logic
- Background expansion from decision context
- Risk assessment generation
- Participant criteria formatting
- Lead researcher in team table
- `processYamlTemplate` pipeline (no backend architecture changes)

## What's removed

| Removed | Reason |
|---------|--------|
| OCTO Priorities task + section | VA-internal process, not research methodology |
| User Journey task + section | Assumptions before research — belongs in findings |
| Success Criteria task + section | Generic project management, not research-specific |
| Detailed Research Protocols `<details>` | Belongs in discussion guide |
| Implementation Plan / Next Steps | Belongs in research readout (post-research) |
| Demographics task with sub-categorization tables | Over-specified; "Participants" section handles composition |
| `clean_product_area` and `product_description` tasks | product_area merged into business_context |
| `formatted_participants` task | Unnecessary formatting step |
| `deliverables` task | Can be methodology-driven in output template |
| `diff` code blocks for timeline phases | Visual noise |
| `> [!WARNING]` and `> [!CAUTION]` on risks | Risks table is cleaner |
| Effort dots (🔵⚪) | Text labels |

## What's added

| Added | Reason |
|-------|--------|
| Summary section with metadata table | Design language standard |
| Research questions section | Core planning artifact — what specific questions will the research answer |
| Deliverables section | Lists expected outputs so stakeholders know what to expect |
| Approval checkboxes | Lightweight working agreement |
| Status: Draft in masthead | Document lifecycle tracking |
| `> [!NOTE]` on timeline | Contextual guidance |

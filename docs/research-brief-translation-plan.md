# Research Brief Translation Plan

**Template:** `config/prompts/research_brief.yaml`
**Current version:** v4.2
**Target version:** v5.0
**Pattern:** C (document-level footer only, BUT with Approval section as primary gate)

---

## Section A: Output Design Diff

### Removed Entirely

| Section | Rationale |
|---------|-----------|
| **Hypotheses** | Belongs in research plan — brief sets scope, plan tests hypotheses |
| **Success Criteria** | Belongs in research plan — execution-level concern |
| **Expected Outcomes** | Belongs in research plan — execution-level concern |
| **Next Steps table** | Belongs in research plan — execution-level concern |
| **User Journeys in Scope** | Too detailed for brief — belongs in discussion guide or plan |
| **Target Barriers (categorized table)** | Too detailed for brief — belongs in plan |
| **Team table** | Lives in research plan — brief is stakeholder-facing approval doc |
| **Participant Criteria (structured)** | Lives in research plan — brief just states high-level target |

### Added

| Section | Rationale |
|---------|-----------|
| **Summary** | Narrative 2-3 sentences + at-a-glance metadata table (same pattern as research_plan v4.7) |
| **"What we'll learn"** | Consolidates objectives + questions into scannable bullets |
| **Out of scope** | Industry-standard — sets explicit boundaries, prevents scope creep |
| **Approval section** | Brief = approval gate per new architecture. Checkboxes for stakeholder sign-off |

### Restructured

| Section | Current | New |
|---------|---------|-----|
| **Masthead** | Two lines with pipe separators | Single line: `**Study:** X \| **Researcher:** X \| **Requested by:** X \| **Date:** X \| **Status:** Draft` |
| **Business Context** | Standalone section | Renamed to **Problem statement** — clearer language |
| **Methodology** | Table with Method/Rationale/Sample Size | Bold-em-dash format: `**Approach** — [Method]` + `**Why this method** — [Rationale]` |
| **Timeline** | Static week phases | Real dates derived from `start_date` + `timeline_preference` (same as research_plan) |
| **Constraints & Risks** | Freeform textarea dump | Clean 2-row table: top 2 risks only, with mitigation |

### Footer

Backend `buildTraceabilityFooter()` handles all traceability. Remove from output_template:
- {% raw %}`*Created by {{lead_researcher}} • {{current_date}}*`{% endraw %}
- `> **Status:** Pending stakeholder approval` (moved to Approval section)

---

## Section B: Modal Field Analysis

### Current Modal Fields (~15 fields)

| Block ID | Field | Type | Required |
|----------|-------|------|----------|
| `study_title_block` | Study title | text | Yes |
| `stakeholder_block` | Stakeholder who requested | text | Yes |
| `lead_researcher_block` | Lead researcher | text | Yes |
| `research_team_block` | Research team | text | No |
| `business_context_block` | Business context | textarea | Yes |
| `objectives_block` | Research objectives | textarea | Yes |
| `research_questions_block` | Research questions | textarea | Yes |
| `user_journeys_block` | User journeys in scope | textarea | Yes |
| `target_barriers_block` | Target barriers | textarea | Yes |
| `hypotheses_block` | Hypotheses | textarea | No |
| `research_method_block` | Research method | select | Yes |
| `sample_size_block` | Sample size | text | Yes |
| `method_rationale_block` | Method rationale | textarea | Yes |
| `participant_criteria_block` | Participant criteria | textarea | Yes |
| `timeline_block` | Timeline (weeks) | text | Yes |
| `deadline_block` | Hard deadline | datepicker | No |
| `constraints_block` | Constraints | textarea | No |

### Proposed Lean Modal (7 required fields)

| Block ID | Field | Type | Required | Notes |
|----------|-------|------|----------|-------|
| `study_selection` | Study selector | dropdown | Yes | **NEW — fixes missing selected_study bug** |
| `stakeholder_block` | Requested by | text | Yes | Stakeholder name (variable name preserved) |
| `problem_statement_block` | Problem statement | textarea | Yes | Replaces `business_context` |
| `learning_objectives_block` | What we'll learn | textarea | Yes | Replaces objectives + questions (researcher writes 4-6 bullets) |
| `research_method_block` | Method | select | Yes | Same options as research plan |
| `out_of_scope_block` | Out of scope | textarea | Yes | **NEW** — what research won't cover |
| `decision_deadline_block` | Decision deadline | datepicker | Yes | When approval/decision needed by |

### Auto-filled from Slack/System

- `lead_researcher` — Slack profile display name (same pattern as research_plan v4.7)
- `current_date` — System date
- `selected_study` — From study selector (provides study name + path)

### Removed Fields (and disposition)

| Field | Disposition |
|-------|-------------|
| `project_title` | Replaced by study selector — title comes from study record |
| `research_objectives` | Merged into "What we'll learn" |
| `research_questions` | Merged into "What we'll learn" |
| `user_journeys_in_scope` | Cut from output entirely |
| `target_barriers` | Cut from output entirely |
| `hypotheses` | Belongs in plan |
| `method_rationale` | Folded into Method section as "Why this method" — single textarea |
| `participant_criteria` | Lives in plan (brief just references "8-10 veterans who...") |
| `sample_size` | Lives in plan |
| `timeline_weeks` | Replaced by start_date + timeline_preference (like research_plan) |
| `constraints` | Folded into Risks section |
| `research_team` | Lives in plan |
| `research_request_link` | No longer needed — Slack thread serves as source |

### Downstream Dependencies Check

| Removed Field | Used Elsewhere? | Action |
|---------------|-----------------|--------|
| `project_title` | Used in filename, output template | Replace with `selected_study` or study name from selector |
| `hypotheses` | AI task `success_criteria` references it | Remove AI task |
| `research_objectives` | Multiple AI tasks reference it | Consolidate to single task using `learning_objectives` |
| `research_questions` | Multiple AI tasks reference it | Consolidate to single task using `learning_objectives` |
| `timeline_weeks` | Output template references it | Replace with timeline_preference + start_date |

---

## Section C: Handler Analysis

### Current Handler Flow (events.js:1441-1623)

1. **Extract metadata** (line 1445-1446): Gets `channelId`, `studyName`, `isFromRequest` from `private_metadata`
2. **Extract form values** (lines 1467-1502): Maps modal fields to `data` object
3. **Fetch YAML** (line 1504): Gets `research_brief.yaml` from config repo
4. **Branch on isFromRequest** (lines 1510-1523):
   - If `isFromRequest=true`: Uses sanitized `project_title` as path
   - If `isFromRequest=false`: Fetches study via `getResearchStudyWithRoles(studyName)`
5. **Generate blocks** (line 1562): Creates Slack notification blocks
6. **Send notifications** (lines 1564-1623): Different paths for request vs. existing study

### Root Cause of Scenario A Bug

**Primary issue:** The modal has NO study selector. `studyName` comes entirely from metadata, which depends on how the modal was opened.

**Flow analysis:**
1. User opens `/plan-study` (studySetupModal) which HAS a study selector
2. User selects a study in the dropdown
3. User clicks "Create Research Brief" button
4. Handler at line 1316-1439 tries to read `body.view?.state?.values?.study_selection?.study_select?.selected_option`
5. It stores `studyName` in metadata at line 1431
6. Brief modal opens (researchBriefModal.js) — which has NO study selector
7. User fills out brief and submits
8. Handler at line 1446 extracts `studyName` from metadata

**The bug:** If the metadata chain breaks (e.g., `isFromRequest` is set somewhere), the handler takes the wrong path at line 1511. The `isFromRequest` path at line 1515 passes `"01-planning"` as extraFolder, and the YAML has `path: "01-planning/"`, resulting in doubled path: `title/01-planning/01-planning/filename.md`.

**Secondary issue:** When `isFromRequest=false` (line 1520), if `studyName` is null/undefined, `getResearchStudyWithRoles(studyName)` will throw, but the error might not propagate cleanly.

### Fix Requirements

1. **Add study selector to brief modal** — Makes study selection explicit, not metadata-dependent
2. **Remove `isFromRequest` branching** — Brief always requires a study (brief comes AFTER study creation)
3. **Update extract() calls** to match new modal fields
4. **Add Slack profile lookup** for lead_researcher (same as research_plan handler)
5. **Add methodology label mapping** — Convert `usability_testing` → "Usability Testing"

---

## Section D: Inputs and Rationale

### Required Inputs
- **Study metadata** — From selector (provides study name + path for file output)
- **Stakeholder name** — From modal (who requested the research)
- **Problem statement** — From modal (what we're solving)
- **Learning objectives** — From modal (what we'll learn, as bullets)
- **Method selection** — From modal (methodology)
- **Out of scope** — From modal (explicit boundaries)
- **Decision deadline** — From modal (when approval needed)
- **Lead researcher** — Auto from Slack profile

### Recommended Inputs
- None — research brief is the FIRST document in a study, no prior synthesis exists yet

### Excluded Inputs
- All synthesis-layer files (don't exist yet)
- Research plan (brief comes BEFORE plan)
- Discussion guide (brief comes BEFORE guide)
- Session summaries (don't exist yet)

**Key insight:** Research brief is unique among Qori templates — it has NO prior inputs. It's the genesis document that kicks off a study. This should be documented in standards Section 7.

---

## Section E: Pattern C Application

Per `docs/qori-template-standards.md` Section 6, Pattern C means:

| Requirement | Status |
|-------------|--------|
| No per-finding Confidence indicators | ✅ N/A (brief has no findings) |
| No per-finding Sources lines | ✅ N/A |
| No References list | ✅ N/A |
| Backend footer only | ✅ Remove {% raw %}`*Created by {{lead_researcher}}*`{% endraw %} from template |
| Document-level metadata table | ✅ Backend buildTraceabilityFooter handles |

**Exception:** Brief DOES include an Approval section (unlike other Pattern C docs) because brief IS the approval gate per new architecture.

---

## Section F: Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Modal simplification breaks handler | High | Coordinate changes — modal + handler + YAML in single commit |
| Removed fields losing context | Medium | Verify all downstream references, update AI tasks |
| Existing broken state (Scenario A) | High | Fix is part of this work — study selector addition |
| Single-commit risk | Medium | Test end-to-end before pushing |
| Methodology label mapping bug | Low | Add mapping in handler (same as research_plan) |
| `isFromRequest` path still triggered | Medium | Remove flag entirely — brief always requires study |

---

## Section G: Implementation Order

**All steps in SINGLE commit:**

### Step 1: Modal Simplification
- Add study selector (copy pattern from research_plan modal)
- Reduce to 7 required fields
- Remove sections: user journeys, barriers, hypotheses, participant criteria, sample size, research team
- Rename: business_context → problem_statement, objectives+questions → learning_objectives
- Add: out_of_scope, decision_deadline

### Step 2: Handler Update
- Add study selector extraction
- Remove `isFromRequest` branching (brief always requires study)
- Update extract() calls to match new modal fields
- Add Slack profile lookup for lead_researcher
- Add methodology label mapping (`usability_testing` → "Usability Testing")
- Fix path: use `study.path` directly, let YAML `path: "01-planning/"` handle subfolder

### Step 3: YAML Restructure
- Update version to v5.0
- Simplify AI tasks: 8 → ~3-4
  - `summary` (narrative)
  - `formatted_learning` (bullet formatting)
  - `timeline_table` (date calculation from start_date + preference)
  - `risks` (2-row table)
- New output_template with locked design language
- Pattern C treatment (backend footer only)
- Add Approval section with checkboxes

### Step 4: End-to-End Test
- Verify file lands in {% raw %}`qori-studies/{{selected_study}}/primary-research/01-planning/`{% endraw %}
- Verify filename: {% raw %}`{{study_name}}-research-brief-{{current_date_iso}}.md`{% endraw %}
- Verify Slack notification with approval buttons
- Verify methodology shows display label not raw value

**Commit message:** `"Translate research_brief to v5.0 with locked design language, simplified modal, fix study scoping bug"`

---

## Section H: Decisions to Flag

### 1. "What we'll learn" field format
**Options:**
- A) Single textarea — researcher writes 4-6 bullets (more flexible)
- B) Structured 4-field input — one per learning objective (more guidance)

**My instinct:** Single textarea (A). Matches research_plan approach. Researchers know their questions better than a form can structure.

**Decision needed:** _______________

### 2. Hypotheses
**Options:**
- A) Fully removed (belongs in plan)
- B) Kept as optional textarea for researchers who want it

**My instinct:** Fully removed (A). Clear separation: brief = scope, plan = execution + hypotheses.

**Decision needed:** _______________

### 3. Constraints/Budget
**Options:**
- A) Folded into Risks section as proposed
- B) Separate "Budget" line in summary table (if researcher provides)

**My instinct:** Separate budget line (B) if provided — it's distinct from risks.

**Decision needed:** _______________

### 4. Timeline format
**Options:**
- A) Same preset approach as research plan (Standard/Accelerated/Extended + start_date)
- B) Custom date entry (more flexible but less consistent)

**My instinct:** Same preset approach (A). Consistency with plan, calculated dates.

**Decision needed:** _______________

### 5. Filename pattern
**Current:** {% raw %}`{{project_title}}_research_brief_{{current_date}}.md`{% endraw %}
**Proposed:** {% raw %}`{{study_name}}-research-brief-{{current_date_iso}}.md`{% endraw %}

Matches research_plan convention (hyphens, ISO date, study name instead of project title).

**Decision needed:** _______________

### 6. File output path
**YAML says:** `path: "01-planning/"`
**output_use text says:** `"Outputs to 00-planning/ for the study repository"`

The `config/templates/primary-research/` folder structure shows `01-planning/` exists. The YAML path is correct; `output_use` text is stale.

**Proposed:** Keep `01-planning/` — verify research_plan uses same path. Full path: {% raw %}`{{study.path}}/primary-research/01-planning/{{filename}}`{% endraw %}

**Decision needed:** _______________

---

## Section I: Standards Update

**Add to Section 7 (Inputs and Rationale):**

> **First-document pattern:** Some templates are "genesis documents" that kick off a study lifecycle and have no prior inputs. Research brief is the canonical example — it defines scope before any research artifacts exist. For these templates, the "Recommended inputs" and "Excluded inputs" sections should explicitly note "None — this is a first document" to clarify that the empty input list is intentional, not an oversight.

---

## Appendix: Locked Design Reference

**Awaiting content from:** `docs/design-references/research-brief-reference.md`

The locked design document will provide the exact output structure, section order, and formatting conventions for v5.0. Implementation should match this reference exactly.

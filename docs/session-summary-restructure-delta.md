# Session Summary Restructure Delta: v2.0 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Implemented (2026-05-21)
**Reference:** `research_readout.yaml` v7.0 (extraction pattern), `designer_readout.yaml` v7.0 (structural), ADR 0005/0016

---

## 1. Current state of session_summary

Same "single LLM" pattern as the pre-restructure readouts:

```handlebars
{{ai_generated.analyze_and_extract}}
```

One task generates the entire document — title (`# Session Summary: {{participant_id}}`), masthead, summary callout, participant context, pain points (numbered), what worked, key insights, recommended actions table, barrier validation (conditional on upstream), methodology + references, upstream context (conditional), appendix (sources + validity checklist), and quality checks.

### Architecture

One AI task: `analyze_and_extract` (~320 lines of prompt — longer than any readout). Handler: `analyzeNotesHandler.ts`. The handler implements progressive-disclosure modal (study selection -> session selection -> notes/transcript selection) and detects cascade context from upstream brief variables.

### Cascade contract — consumes

| Variable | Source | Required | inject_as |
|----------|--------|----------|-----------|
| `target_barriers` | research_brief | No | grounding |
| `research_questions` | research_brief | No | context |
| `methodology_selection` | research_brief | No | context |

3 upstream variables, 0 required. All optional — session_summary works without a brief, but produces richer output (TB/RQ citation markers, barrier validation section) when brief variables are present.

### Cascade contract — emits

| Variable | Pool | Pool Strategy | Schema | Downstream consumers |
|----------|------|---------------|--------|---------------------|
| `atomic_nugget_core` | Yes | append_or_replace_per_participant | 6 required fields | affinity_mapping, journey_mapping, persona_generator, research_readout, (usability_issues, jobs_to_be_done, design_opportunities via `atomic_nuggets`) |
| `atomic_nugget_detail` | Yes | append_or_replace_per_participant | 1 required + 10 nullable | research_readout, journey_mapping, persona_generator |
| `participant_metadata` | Yes | append_or_replace_per_participant | 1 required + 7 optional | persona_generator, research_readout |
| `task_completion_records` | Yes | append_or_replace_per_participant | 7 required + 4 optional | research_readout (optional) |
| `barrier_validations` | Yes | append_or_replace_per_participant | 5 required + 3 nullable | affinity_mapping, research_readout (optional) |

**5 pool emits, all Sonnet, all append_or_replace_per_participant.** This is the most emission-heavy template in the system. Every synthesis template downstream depends on at least `atomic_nugget_core`. Re-analysis of one participant replaces only that participant's entries — other participants' data is preserved.

### Schema field counts

| Schema | Required fields | Optional/nullable fields | Total |
|--------|:-:|:-:|:-:|
| atomic_nugget_core | 6 | 0 | 6 |
| atomic_nugget_detail | 1 (id) | 10 | 11 |
| participant_metadata | 1 (participant_id) | 7 | 8 |
| task_completion_record | 7 | 4 | 11 |
| barrier_validation | 5 | 3 | 8 |
| **Total** | **20** | **24** | **44** |

44 total fields extracted across 5 variables by Sonnet. This is the highest extraction complexity in the system (readouts extract 1-2 variables each). The core/detail split was specifically designed for extraction reliability — keeping the 6-field core lean while detail carries the enrichment.

### What the LLM controls that it shouldn't

| Element | Current | Should be |
|---------|---------|-----------|
| Document title + masthead | LLM generates `# Session Summary: {{participant_id}}` | Handlebars |
| Summary callout box | LLM generates `> [!IMPORTANT]` | Keep in LLM — analytical synthesis |
| Participant context section | LLM generates from sources | Keep in LLM — extraction/synthesis |
| Pain points (numbered) | LLM generates with editorial numbering | Keep in LLM — extraction/analysis |
| What worked | LLM generates | Keep in LLM — extraction |
| Key insights | LLM generates | Keep in LLM — synthesis/inference |
| Recommended actions table | LLM generates | Keep in LLM — analytical |
| Barrier validation table (conditional) | LLM generates | Keep in LLM — analytical. **Handlebars controls the conditional wrapper** |
| Methodology + references | LLM generates mechanical prose + references list | **Split:** Handlebars renders references (static), LLM writes methodology prose |
| Upstream context table (conditional) | LLM generates | Handlebars (mechanical, conditional) |
| Appendix: sources analyzed | LLM generates | Handlebars (mechanical — file paths known at render time) |
| Validity checklist | LLM generates with hardcoded checkmarks | Handlebars (static content) |
| Quality checks | LLM generates then suppresses | Move to prompt instructions only (already marked "do not include in output") |
| Cascade summary | **Missing entirely** | Handlebars (standard v7.0 format — all 5 emits + 3 consumes) |

### Anti-fabrication guards

**Present and appropriate.** 7 numbered rules under "CRITICAL GROUNDING RULES":

1. Pain points and quotes must be explicitly stated in sources
2. Opportunities can be inferred from participant struggles/requests
3. Insights can be inferred from observed behavior/statements
4. Every finding must trace to source evidence
5. When in doubt about pain points/quotes, OMIT
6. When in doubt about opportunities/insights, INCLUDE with evidence link
7. No participant real names — use PT-XXX throughout

Plus confidence assessment requirement (Strong/Moderate/Limited with parenthetical reasoning) and quote rules (verbatim only, timestamps when available).

**Assessment:** These are fieldwork-appropriate guards — correctly distinguishing between extraction (strict: pain points, quotes) and inference (permissive: insights, opportunities). Preserved as-is.

### Cascade-aware generation instructions

**Present (v2.0 addition).** When upstream brief variables exist, the prompt instructs:

1. Reference target barriers by ID ([TB-001], [TB-002])
2. Reference research questions by ID ([RQ-001], [RQ-002])
3. Use methodology to frame observations (card sorting vs. usability vs. interview language)
4. Cite verbatim quotes with [verbatim] tag
5. Use only observations from the session

**Assessment:** These are correctly scoped cascade instructions. Preserved as-is within the AI task.

### Notable structural differences from readouts

1. **Fieldwork template, not synthesis.** Operates on raw session data (transcript + observer notes), not on pre-extracted variables.
2. **Pool emits, not singletons.** Each run adds to a growing pool. Re-analysis replaces per-participant.
3. **5 extraction targets** vs readouts' 1-2. Extraction complexity is 3-4x higher.
4. **Progressive-disclosure modal.** Study -> session -> notes cascade in the handler. No changes needed.
5. **Conditional sections.** Barrier validation and upstream context only appear when brief variables exist. The LLM currently controls the conditionals — Handlebars should.
6. **Pain points use editorial numbering** (`### 01 &nbsp;&nbsp;`) — same pattern as research_readout findings.
7. **No cascade summary section.** Missing entirely — needs to be added.
8. **No tickets.** Document-only (like leadership), but emits pool variables consumed by everything downstream.

### Handler concerns

`analyzeNotesHandler.ts` handles progressive-disclosure modal, cascade context detection, and session data assembly. No changes needed for the YAML restructure — handler logic is independent of prompt structure.

---

## 2. Target state

Same pattern as other v7.0 templates: single `analysis_body` task + Handlebars for mechanical structure.

### Task split

Session summary has strong cross-section coherence — the summary callout references pain points, insights reference pain points, recommended actions address pain points by number, barrier validation cross-references findings. One task preserves this coherence.

**Recommended split:**

1. `analysis_body` — Summary (narrative + callout), participant context, pain points (editorial numbered with confidence), what worked, key insights, recommended actions table, barrier validation (conditional content — the LLM generates the table rows; Handlebars wraps the conditional section heading), methodology prose (1-2 paragraphs). One task.

2. Handlebars renders:
   - **Masthead:** `# Session Summary: {{participant_id}}` + study/researcher/date line
   - **Barrier validation section wrapper:** `{{#if upstream_target_barriers}}## Barrier validation ... {{/if}}` — LLM generates table content via `analysis_body`, Handlebars controls whether the section appears
   - **Upstream context** (in `<details>` toggle, conditional on upstream variables)
   - **Appendix: sources analyzed** (mechanical — file paths/status)
   - **Validity checklist** (static content in `<details>` toggle)
   - **Cascade summary** (standard v7.0 format — 5 emits + 3 consumes)
   - **References** (static list — Nielsen Norman, Krug, Hall, WCAG 2.2)

### Decision: barrier validation conditional handling

**Option (a):** Handlebars wraps the entire barrier validation section including content. The AI task always generates barrier validation content, and Handlebars shows/hides it. Risk: LLM generates barrier content even without upstream barriers, wasting tokens.

**Option (b):** The AI task prompt uses `{% if upstream_target_barriers %}` to conditionally include barrier validation instructions. Handlebars wraps the section heading. LLM only generates barrier content when barriers exist. This is the current pattern and it works.

**Recommendation:** Option (b) — keep the conditional in the AI prompt. This matches the current behavior and avoids wasted generation.

### Decision: methodology and references split

Currently the LLM generates methodology prose AND the static references list (Nielsen Norman, Krug, Hall, WCAG 2.2). The references never change.

**Recommendation:** Move references to Handlebars (static). Keep methodology prose in the AI task (it varies per session — moderated vs. unmoderated, task list, source count, limitations).

---

## 3. Specific changes required

### 3a. YAML changes

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — Summary (narrative + `> [!IMPORTANT]` callout), participant context, pain points (editorial numbered, confidence metadata), what worked, key insights, recommended actions table, barrier validation content (conditional on upstream), methodology prose. USE `##` headings. Do not generate title, masthead, references, appendix, cascade summary, or upstream context.

**Handlebars renders:**

- **Masthead:**
  ```handlebars
  # Session Summary: {{participant_id}}

  **Study:** {{study_name}} &nbsp; | &nbsp; **Analyzer:** {{analyzer}} &nbsp; | &nbsp; **Date:** {{session_date}}
  ```
- **AI body:** `{{ai_generated.analysis_body}}`
- **References** (static, always present):
  ```markdown
  ### References

  - Nielsen Norman Group -- Moderated usability testing methodology
  - Krug, S. -- *Rocket Surgery Made Easy* (2010)
  - Hall, E. -- *Just Enough Research* (2nd ed., 2019)
  - W3C Web Content Accessibility Guidelines (WCAG) 2.2
  ```
- **Upstream context** (`<details>` toggle, conditional):
  ```handlebars
  {{#if upstream_target_barriers}}
  <details>
  <summary><strong>Upstream context</strong></summary>
  ...variable table...
  </details>
  {{/if}}
  ```
- **Appendix** (sources analyzed — mechanical):
  ```handlebars
  <details>
  <summary><strong>Sources analyzed</strong></summary>
  | Source | Location | Status |
  |--------|----------|--------|
  | {{participant_id}} transcript | 03-fieldwork/transcripts/ | Analyzed |
  | Observer notes | 03-fieldwork/session-notes/ | Analyzed |
  </details>
  ```
- **Validity checklist** (`<details>` toggle, static):
  ```handlebars
  <details>
  <summary><strong>Validity checklist</strong></summary>
  | Criterion | Verified |
  |-----------|:--------:|
  | All quotes verbatim from session transcript | |
  | Pain points grounded in specific observed behaviors | |
  | Inferences (insights, opportunities) traced to evidence | |
  | Confidence levels declared per pain point | |
  | Source documents listed in methodology | |
  </details>
  ```
- **Cascade summary** (standard v7.0 format — NEW):
  ```markdown
  ## Cascade summary

  This session summary emits pool variables consumed by downstream synthesis templates.

  | Variable | Pool | Strategy | Description |
  |----------|:----:|----------|-------------|
  | atomic_nugget_core | Yes | append_or_replace_per_participant | Core observation fields (6 required) |
  | atomic_nugget_detail | Yes | append_or_replace_per_participant | Enrichment fields linked by id (10 nullable) |
  | participant_metadata | Yes | append_or_replace_per_participant | Demographics and session context |
  | task_completion_records | Yes | append_or_replace_per_participant | Per-task success/failure records |
  | barrier_validations | Yes | append_or_replace_per_participant | Target barrier confirmation/refutation |

  **Consumed from upstream:**

  | Variable | Source | Role |
  |----------|--------|------|
  | target_barriers | research_brief | Barrier validation grounding |
  | research_questions | research_brief | Question framing |
  | methodology_selection | research_brief | Observation framing |
  ```

**Clean up:**
- OUTPUT BOUNDARIES instruction: do not generate title, masthead, references, appendix, cascade summary, upstream context section, or validity checklist
- Remove quality checks section (move critical checks into prompt instructions only — they're already marked "do not include in output")
- Validity checklist checkmarks removed — these are reviewer prompts, not auto-populated (per v1.1-followups decision)
- Update version to v7.0
- Remove dead metadata sections (`slack_command`, `external_data_sources`, `slack_ui`, `processing_rules`, `validation_rules`, `quality_assurance`) — these are documentation-only, never read by the backend, and several are stale

### 3b. Handler changes

None. `analyzeNotesHandler.ts` is independent of prompt structure. Progressive-disclosure modal, cascade context detection, and session data assembly are all handler concerns that don't change.

### 3c. Cascade contract changes

None. All 5 emit schemas unchanged. All 3 consumes unchanged. Pool strategy unchanged.

---

## 4. Risks

### Risk 1: extraction reliability (5 pool variables, 44 total fields, Sonnet)

This is the highest extraction load in the system. Current extraction works — the concern is whether restructuring the AI task (removing structural elements it currently generates) changes the output enough to degrade extraction.

**Mitigation:** The extraction targets (`extract_from` fields) reference content sections (findings, task observations, participant context) not structural elements (masthead, references). Removing structural generation from the AI task should improve extraction — the LLM focuses on analytical content, the extraction model has less noise to parse.

### Risk 2: barrier validation conditional in split template

The barrier validation section is conditional on `upstream_target_barriers`. Currently the LLM handles this conditional entirely. In v7.0, the LLM still handles the conditional content generation (via `{% if %}` in the prompt), but Handlebars needs to NOT add a duplicate section wrapper.

**Mitigation:** The `analysis_body` prompt includes barrier validation instructions conditionally. The output_template does NOT wrap barrier validation in its own conditional — it's part of the `analysis_body` output. This is the same pattern as leadership_readout's conditional "Decisions required" section.

### Risk 3: pool merge integrity after restructure

`append_or_replace_per_participant` depends on extracted items containing a `participant` or `participant_id` field. If the restructured prompt changes how participant IDs appear in the output, extraction might miss the participant field, breaking the merge strategy.

**Mitigation:** The prompt explicitly instructs `{{participant_id}}` usage throughout. The `extract_from` fields reference sections that contain participant data. The merge strategy extracts participant from the first item in the array (`firstItem?.participant || firstItem?.participant_id`). No structural change affects this.

### Risk 4: dead metadata removal

Several YAML sections (`slack_command`, `external_data_sources`, `slack_ui`, `processing_rules`, `validation_rules`, `quality_assurance`) are documentation-only — the backend's YAML processor doesn't read them. Removing them reduces file size but risks losing documentation.

**Mitigation:** These sections describe modal behavior that's implemented in `analyzeNotesHandler.ts`, not in the YAML. The handler is the source of truth. The `notes:` field preserves version history. If documentation is needed, it belongs in a design reference doc, not in dead YAML blocks.

---

## 5. Implementation sequence

1. Handlebars skeleton (masthead, references, upstream context toggle, sources appendix, validity checklist, cascade summary)
2. Split AI task (single `analysis_body` replacing `analyze_and_extract`)
3. Add OUTPUT BOUNDARIES instruction
4. Remove dead metadata sections and quality checks
5. Verify extraction: all 5 pool variables (atomic_nugget_core, atomic_nugget_detail, participant_metadata, task_completion_records, barrier_validations)
6. Cross-check: regenerate a downstream consumer (affinity_mapping or research_readout) to confirm pool variables are intact

**Estimated effort:** 1 session. Larger than readouts due to extraction verification for 5 variables, but structurally the same pattern.

---

## 6. Downstream impact assessment

Session summary is the most upstream fieldwork template. Changes here ripple to:

| Downstream template | Variables consumed | Risk |
|---------------------|-------------------|------|
| affinity_mapping | atomic_nugget_core, atomic_nugget_detail, barrier_validations | Low — consumes extracted variables, not document format |
| persona_generator | atomic_nugget_core, atomic_nugget_detail, participant_metadata | Low — same |
| journey_mapping | atomic_nugget_core, atomic_nugget_detail | Low — same |
| research_readout | atomic_nugget_core, atomic_nugget_detail, participant_metadata, task_completion_records, barrier_validations | Low — same |
| usability_issues | atomic_nuggets (generic) | Low — same |
| jobs_to_be_done | atomic_nuggets (generic) | Low — same |
| design_opportunities | atomic_nuggets (generic) | Low — same |

**All downstream risk is low** because downstream templates consume extracted Postgres variables, not the rendered document. The restructure changes document format but not extraction schemas.


# Research Readout Restructure Delta: v6.0 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `designer_readout.yaml` v7.0, `affinity_mapping.yaml` v7.0, ADR 0005/0016

---

## 1. Current state of research_readout

Same "single LLM" pattern as all pre-restructure templates:

```handlebars
{{ai_generated.research_readout_complete}}
```

One task generates the entire document — title, masthead, summary (with cascade summary count table), "Why we conducted this research" section, editorial-numbered findings (01–05) with evidence/confidence/sources/recommendations, brief commitments addressed table, what's working section, recommended actions (immediate/short-term/future/follow-up), participants table, methodology section, appendix (related artifacts, validity checklist, upstream context).

### Architecture

One AI task: `research_readout_complete` (~500 lines of prompt — the largest prompt in the system). Routed through `readoutHandler.ts` — user selects "Research Readout" in `/qori-report` modal. Same handler as designer_readout but different code path (line 600 `else` branch).

### Cascade contract — consumes

**17 upstream variables — the richest consume set of any template.**

| Variable | Source | Required | inject_as |
|----------|--------|----------|-----------|
| `research_objectives` | research_brief | No | commitment |
| `research_questions` | research_brief | No | commitment |
| `target_barriers` | research_brief | No | grounding |
| `business_context` | research_brief | No | context |
| `atomic_nugget_core` | session_summary | **Yes** | reference |
| `atomic_nugget_detail` | session_summary | **Yes** | reference |
| `participant_metadata` | session_summary | **Yes** | reference |
| `task_completion_records` | session_summary | No | reference |
| `barrier_validations` | session_summary | No | grounding |
| `validated_themes` | affinity_mapping | No | reference |
| `prioritized_issues` | usability_issues | No | reference |
| `personas` | persona_generator | No | reference |
| `persona_design_implications` | persona_generator | No | reference |
| `journey_stages` | journey_mapping | No | reference |
| `stakeholder_constraints` | stakeholder_synthesis | No | context |
| `alignment_gaps` | stakeholder_synthesis | No | context |

3 required, 14 optional. The required variables are all from session_summary (which is on the restructure queue but already emits correctly).

### Cascade contract — emits

**4 emitted variables — the most critical emits in the system.**

| Variable | Schema | Model | Downstream consumers |
|----------|--------|-------|---------------------|
| `prioritized_findings` | `$ref: schemas/prioritized_finding.yaml` (17 fields) | Sonnet | designer_readout (required), engineering_readout (required), accessibility_readout (required), leadership_readout (required) |
| `prioritized_recommendations` | `$ref: schemas/prioritized_recommendation.yaml` (10 fields) | Sonnet | designer_readout (required), engineering_readout (required), leadership_readout (required) |
| `decision_inputs` | `$ref: schemas/decision_input.yaml` (7 fields) | Sonnet | leadership_readout (optional) |
| `study_methodology` | `$ref: schemas/study_methodology.yaml` (7 fields) | — | None (orphaned per v1.1-followups) |

**`prioritized_findings` is consumed by all 4 audience readouts as required/grounding.** This is the most downstream-critical variable in the system. `prioritized_recommendations` is consumed by 3 of 4 (accessibility_readout doesn't need it). Extraction regression here would break every audience readout.

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Document title + masthead | LLM generates `# Research Report` + metadata line | Handlebars |
| Cascade summary count table (after Summary) | LLM computes counts from upstream data | Handlebars (mechanical, conditional on data) |
| Methodology section | LLM generates from inferred data | Partially Handlebars — static framework/references, LLM writes study-specific approach |
| References list | LLM generates | Handlebars (static) |
| Validity checklist | LLM generates with hardcoded checkmarks | Handlebars (static, empty cells per v7.0 pattern) |
| Related artifacts appendix | LLM generates from `{{detected_files}}` | Handlebars (mechanical — file list is handler-provided) |
| Upstream context table | LLM generates with Available/Missing status | Handlebars (conditional on data) |
| "Why we conducted this research" section | LLM extracts from research plan + upstream variables | Keep in LLM — this is synthesis, not mechanical |

### Anti-fabrication guards

**Present and strong — the strongest of any template.** 7 absolute requirements plus a forbidden terms list and per-finding confidence/source requirements:

1. ONLY use findings from source data
2. NEVER invent quotes, participants, or findings
3. NEVER mention products/features not in source data
4. If source data insufficient, say so
5. Use PT-### format
6. Counts must be accurate
7. NEVER use participant real names

Plus forbidden hallucination indicators (checkout process, conversion rates, e-commerce, etc.) and mandatory per-finding confidence assessment (Strong/Moderate/Limited with parenthetical reasoning) and source citation.

**Assessment:** These guards are excellent and should be preserved as-is in the restructured prompt. The confidence/source/evidence-chain requirements are the reference standard for all downstream templates.

### Cascade summary status

**LLM-generated, wrong format.** Same issue as designer_readout v1.1 — the cascade summary is a count table embedded in the Summary section:

```markdown
| Source | Count | Coverage |
|--------|:-----:|----------|
| Atomic nuggets | [N] | [nugget IDs used / total available] |
```

This is useful data but belongs in Summary prose. The v7.0 cascade summary should document the emits/consumes contract.

### Ticket body quality

**Research readout does NOT emit ticket-shaped variables.** It emits `prioritized_findings` and `prioritized_recommendations` — these are synthesis variables that the audience-specific readouts translate into tickets. The research readout is pure synthesis feeding downstream ticket generators.

`decision_inputs` is consumed only by leadership_readout (optional). `study_methodology` is orphaned (no downstream consumer).

### Handler concerns

`readoutHandler.ts` is generic — no template-specific data assembly needed. Same handler path as designer_readout. No changes required.

### Version numbering

v6.0, last updated 2026-05-06. Extensive changelog in notes section (v5.2 through v6.0).

### Notable structural differences from other templates

1. **Largest prompt in the system** (~500 lines). The output format section alone is ~280 lines.
2. **Inline recommendations per finding.** Each finding has its own `#### Recommendation` subsection. This is different from synthesis templates where recommendations are a separate section.
3. **"Brief commitments addressed" section.** Unique to research_readout — maps RQ-XXX and objectives to findings, flags gaps. This is a commitment accountability mechanism.
4. **"Why we conducted this research" section.** Extracts business context, objectives, and research questions from upstream variables and research plan. Synthesis, not mechanical.
5. **Recommended actions with timeline bucketing.** Immediate (2 weeks), short-term (1-2 months), future, follow-up research. More granular than other templates.
6. **Related artifacts appendix.** Populated from `{{detected_files}}` — this is mechanical (file list rendering) that the LLM currently handles.
7. **`core_files`, `optional_files`, `auto_variables` blocks.** These are documentation-only metadata (never read by backend, same as `derived_variables`). Should be preserved as documentation.

---

## 2. Target state

Same pattern as designer_readout v7.0: single `analysis_body` task + Handlebars for structure.

### Task split

Research readout has strong cross-section coherence requirements — finding numbering (## 01–05), evidence chain IDs, recommendation→finding tracing, brief commitment→finding mapping, and recommended actions→finding addressing all cross-reference each other. The analytical core stays in one task.

**Recommended split:**
1. `analysis_body` — Summary (with bottom-line callout + priority table), "Why we conducted this research" (objectives, questions), editorial-numbered findings (01–05, each with evidence, confidence, sources, evidence chain, recommendation), brief commitments addressed table, what's working section, recommended actions (immediate/short-term/future/follow-up), participants table + sample composition. One task preserves cross-referencing.
2. Handlebars — masthead, cascade summary (standard v7.0 format), methodology (static framework + references in toggle, study-specific approach stays in AI), related artifacts (mechanical file list in toggle), validity checklist (toggle, empty cells), upstream context (toggle, conditional on data).

### What changes from the current prompt

The analytical content and anti-fabrication guards are strong. The main changes are structural:

1. **Remove structural elements from prompt.** Title, masthead, methodology references, validity checklist, related artifacts, upstream context — all move to Handlebars.
2. **Add OUTPUT BOUNDARIES.** Explicit instruction not to generate structural elements.
3. **Add `##` heading instruction.** Same pattern as all v7.0 templates.
4. **Move cascade summary from count table to contract table.** Count table content moves to Summary section prose.
5. **Remove internal quality checklist.** Redundant with the strong anti-fabrication rules already in the prompt.
6. **Move related artifacts to Handlebars.** This is mechanical — `{{detected_files}}` rendered as a table. The LLM currently does this but shouldn't.
7. **Keep methodology split.** Static framework/references move to Handlebars toggle. Study-specific approach (research type, sessions, recruitment) stays in AI output since it requires inference from source data.

### Special consideration: related artifacts

The related artifacts appendix currently instructs the LLM to "Populate this table with ALL artifacts from `{{detected_files}}`." This is fully mechanical — the handler provides the file list, the LLM renders it as a table. In the restructured template, Handlebars should render this directly.

However, the `detected_files` input is a formatted string (bullet list), not structured data. Handlebars can render it as-is inside a `<details>` toggle without needing to parse it into a table. The table formatting (with categories and status columns) is LLM work that adds marginal value — the raw file list serves the same purpose.

**Decision needed:** (a) Keep as LLM-formatted table categorized by type, or (b) render raw `{{detected_files}}` list via Handlebars. Option (b) is simpler and fully mechanical.

---

## 3. Specific changes required

### 3a. YAML changes

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — Summary (bottom-line callout + priority table + upstream data counts in prose), "Why we conducted this research" (business context, objectives, questions), findings (## 01–05 with evidence, confidence, sources, evidence chain, recommendation per finding), brief commitments addressed table (conditional on upstream), what's working section, recommended actions (immediate/short-term/future/follow-up), participants table + sample composition. USE `##` headings.

**Handlebars renders:**

- **Masthead:** `# Research Report: {{study_name}}`
  - Study, researcher, date in metadata line
- **Cascade summary** (always present, standard v7.0 format):
  - Emits table: `prioritized_findings`, `prioritized_recommendations`, `decision_inputs`, `study_methodology`
  - Consumes table: all 17 upstream variables with source and role
- **Methodology** (in `<details>` toggle):
  - Static references (NNG, Krug, Hall, WCAG)
  - Study-specific approach stays in AI output (rendered inline before the toggle)
- **Related artifacts** (in `<details>` toggle):
  - Render `{{detected_files}}` directly
- **Upstream context** (in `<details>` toggle, conditional on data):
  - Variable table with source and role
  - Citation marker legend
- **Validity checklist** (in `<details>` toggle):
  - Standard criteria table with empty Verified cells (v7.0 pattern)

**Clean up:**
- OUTPUT BOUNDARIES with `##` heading instruction
- Remove 10-point quality checklist from prompt (redundant with anti-fabrication rules)
- Remove `core_files`, `optional_files`, `auto_variables` blocks (documentation-only, never read by backend — preserve in notes)
- Fix version to v7.0
- Add `selected_study` to input_variables (same fix as designer_readout — Handlebars needs it for masthead)

### 3b. Handler changes

Verify `readoutHandler.ts` passes `selected_study` in reportData. Already fixed in the designer_readout PR — same handler, same data object. Confirm the fix is in place.

### 3c. Cascade contract changes

None. All 4 emit schemas unchanged. All 17 consume declarations unchanged. The 4 downstream audience readouts are unaffected.

---

## 4. Risks

### Risk 1: prioritized_findings extraction — highest-stakes extraction in the system

`prioritized_findings` has 17 fields and is consumed as **required/grounding** by all 4 audience readouts. Extraction regression here cascades to every readout. The `prioritized_finding.yaml` schema includes nested arrays (`supporting_themes`, `supporting_nuggets`, `affected_personas`) and nullable fields.

**Mitigation:** The schema hasn't changed. The findings section format (## 01 with evidence, confidence, sources, evidence chain, recommendation) hasn't changed — only the surrounding structural elements move to Handlebars. Extraction targets the findings sections, which remain in the AI-generated portion. Verify extraction immediately after restructure.

### Risk 2: prioritized_recommendations extraction

10-field schema, consumed as required/grounding by 3 of 4 audience readouts. Same risk profile as prioritized_findings but smaller schema.

**Mitigation:** Same as Risk 1 — recommendations section format unchanged, only surrounding structure moves.

### Risk 3: decision_inputs extraction

7-field schema, consumed only by leadership_readout (optional). Lower stakes but worth verifying.

**Mitigation:** Verify extraction along with findings and recommendations.

### Risk 4: prompt length after restructure

The current prompt is ~500 lines. Moving ~150 lines of structural content to Handlebars reduces the prompt to ~350 lines. This is still the largest prompt but well within model limits. Not a real risk.

### Risk 5: related artifacts rendering change

If switching from LLM-categorized table to raw `{{detected_files}}` list, the output format changes. Researchers may notice the difference.

**Mitigation:** The categorized table is a cosmetic enhancement. The raw file list provides the same information. If categorization is important, keep it as a lightweight instruction in the prompt ("list the files above, grouped by Planning/Fieldwork/Analysis/Reference").

---

## 5. Implementation sequence

1. Handlebars skeleton (masthead, cascade summary in standard v7.0 format, methodology toggle with static references, related artifacts toggle, upstream context toggle, validity checklist toggle)
2. Split AI task (single `analysis_body` replacing `research_readout_complete`)
3. Add OUTPUT BOUNDARIES with `##` heading instruction
4. Move upstream data counts from cascade summary to Summary section prose
5. Remove internal quality checklist from prompt
6. Decide on related artifacts rendering (LLM-categorized table vs. raw file list)
7. Verify `selected_study` is in handler data (already fixed)
8. Verify extraction: `prioritized_findings` (17 fields, Sonnet), `prioritized_recommendations` (10 fields, Sonnet), `decision_inputs` (7 fields, Sonnet), `study_methodology`
9. **Critical:** regenerate a downstream readout (designer or engineering) to verify the extracted findings/recommendations still work

**Estimated effort:** 1 session. Slightly larger than designer_readout due to prompt size and extraction verification scope.

---

## 6. Downstream impact assessment

Research readout is the cascade bottleneck — every audience readout depends on it. The restructure must preserve extraction quality for the two critical variables.

**Downstream dependency chain:**

```
research_readout
  ├── prioritized_findings (required by ALL 4 audience readouts)
  ├── prioritized_recommendations (required by 3 of 4)
  ├── decision_inputs (optional, leadership_readout only)
  └── study_methodology (orphaned — no consumers)
```

**Verification plan after restructure:**
1. Generate research readout on Railway
2. Confirm extraction logs: `Extract: Got 4 variables for research_readout`
3. Query Postgres to verify `prioritized_findings` array has expected field coverage
4. Generate designer_readout against the new extraction — verify it still works
5. If designer_readout renders correctly, the extraction is proven for all downstream readouts (they consume the same variables with the same schema)

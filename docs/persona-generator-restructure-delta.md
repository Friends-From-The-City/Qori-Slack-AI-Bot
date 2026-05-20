# Persona Generator Restructure Delta: v5.0 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `affinity_mapping.yaml` v7.0, ADR 0005/0016

---

## 1. Current state of persona generator

Same "single LLM" pattern as affinity_mapping pre-restructure:

```handlebars
{{ai_generated.personas_complete}}
```

One task generates the entire document — masthead, summary, cascade summary, per-persona sections (with "who they are", "what blocks them", "how they cope", theme grounding, barrier marking), design priorities, methodology, upstream context, appendix, and validity checklist.

### Architecture

One AI task: `personas_complete` (~390 lines of prompt). Same handler path as affinity_mapping — `researchSynthesisHandler.ts` builds a generic `SynthesisTemplateInput`.

### Cascade contract — consumes

| Variable | Source | Required |
|----------|--------|----------|
| `atomic_nugget_core` | session_summary | Yes |
| `atomic_nugget_detail` | session_summary | Yes |
| `validated_themes` | affinity_mapping | No |
| `participant_metadata` | session_summary | Yes |
| `target_barriers` | research_brief | No |
| `research_questions` | research_brief | No |

Consumes 6 upstream variables — the richest consume set of any template. Loaded automatically by yamlProcessor's transform phase.

### Cascade contract — emits

| Variable | Schema | Model | Downstream consumers |
|----------|--------|-------|---------------------|
| `personas` | `$ref: schemas/persona.yaml` (17+ fields) | Sonnet | `design_opportunities`, `research_readout`, `designer_readout`, `engineering_readout`, `accessibility_readout`, `journey_mapping` |
| `persona_design_implications` | `$ref: schemas/persona_design_implication.yaml` (7 fields) | Sonnet | `design_opportunities`, `research_readout` |

`personas` is consumed by 6 downstream templates. Both emits use Sonnet. The `persona.yaml` schema has nested objects (`demographics`, `context`) and arrays of objects (`frustrations` with `evidence_nugget`, `behaviors` with `context`).

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Masthead (study, researcher, date) | LLM generates | Handlebars |
| Cascade summary table | LLM generates (conditional) | Handlebars (always present) |
| Methodology section | LLM generates boilerplate | Handlebars (static) |
| References list | LLM generates fixed list | Handlebars (static) |
| Validity checklist | LLM generates fixed table | Handlebars (static) |
| Appendix structure | LLM generates HTML | Handlebars (static) |
| Upstream context | LLM generates (conditional) | Handlebars (conditional on data) |

### Anti-fabrication guards

**Present and strong.** Five explicit rules plus 10-point cascade-aware generation block:
1. No hallucination — extractor, not generator
2. No real names — archetype names only
3. VA context only
4. Aggregate — no 1:1 participant mapping
5. Fewer personas than participants

Plus a 15-point quality checklist (internal, not rendered).

### Cascade summary

**Partially present.** Only renders when upstream `atomic_nugget_core` is available (conditional). Since nuggets are required, it effectively always appears — but should be Handlebars-owned.

### Handler concerns

Same as affinity_mapping — routes through `researchSynthesisHandler.ts`, no handler changes needed. No `focus_area`, `topic_slug`, or `derived_variables` issues.

---

## 2. Target state

Same pattern as affinity_mapping v7.0: single `analysis_body` task + Handlebars for structure.

### Task split

Persona generator has the same cross-section coherence requirement as affinity_mapping — persona numbering, participant coverage, theme/barrier references flow across sections. The analytical core stays in one task.

**Recommended split:**
1. `analysis_body` — Summary, per-persona sections, design priorities. One task preserves persona numbering and cross-persona pattern consistency.
2. Handlebars — masthead, cascade summary (always), methodology toggle, references toggle, upstream context toggle, appendix structure, validity checklist toggle.

Recommendations kept (same rationale as affinity_mapping — persona design implications are evidence-grounded and feed into readout templates).

---

## 3. Specific changes required

### 3a. YAML changes

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — Summary + "Most actionable insight" callout + at-a-glance table + per-persona sections (all subsections) + design priorities table. USE `##` headings.

**Handlebars renders:**
- Masthead: `# Personas: {{selected_study}}`
- Cascade summary (always present, documents both consumes and emits)
- Methodology (in `<details>` toggle)
- References (in `<details>` toggle)
- Upstream context (in `<details>` toggle, conditional on data)
- Appendix related artifacts
- Validity checklist (in `<details>` toggle)

**Clean up:**
- OUTPUT BOUNDARIES with `##` heading instruction
- Remove LLM-generated quality checklist (internal, never rendered)
- Cascade summary always renders

### 3b. Handler changes

None. Same `researchSynthesisHandler.ts` generic handler.

### 3c. Cascade contract changes

None. Both emit schemas unchanged. 6 downstream consumers unaffected.

---

## 4. Risks

### Risk 1: personas consumed by 6 downstream templates

Same risk as `validated_themes` — extraction regression would cascade. Both emits use Sonnet. The `persona.yaml` schema has nested objects which are more complex than `validated_theme.yaml`.

**Mitigation:** Verify extraction after restructure. The schema complexity hasn't changed — only the document structure around it.

### Risk 2: persona_design_implications orphaned concern

`persona_design_implications` is listed as consumed by `design_opportunities` and `research_readout`, but the v1.1 followups note it as potentially orphaned. Verify whether downstream templates actually reference it.

**Mitigation:** Keep the emit. Even if currently orphaned, the schema is well-designed and the data is valuable for future readout templates.

---

## 5. Implementation sequence

1. Handlebars skeleton (masthead, cascade summary, methodology toggle, references toggle, upstream context toggle, appendix, validity checklist toggle)
2. Split AI task (single `analysis_body` replacing `personas_complete`)
3. Add OUTPUT BOUNDARIES with `##` heading instruction
4. Add recommendations rationale comment (same as affinity_mapping)
5. Verify extraction: `personas` (17+ fields, Sonnet) and `persona_design_implications`

**Estimated effort:** 1 session. Same scope as affinity_mapping.

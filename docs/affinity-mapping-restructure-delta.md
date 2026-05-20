# Affinity Mapping Restructure Delta: v4.0 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `stakeholder_synthesis.yaml` v7.0, `desk_research.yaml` v7.0, ADR 0005/0016

---

## 1. Current state of affinity mapping

The affinity mapping template (v4.0) uses the **same "single LLM" pattern**. The output template is:

```handlebars
{{ai_generated.affinity_complete}}
```

One task generates the entire document — masthead, cascade summary, "At a Glance" table, per-theme sections with evidence tables, "What's Working" section, cross-theme connections, recommended actions, methodology, upstream context, and references.

### Architecture

One AI task: `affinity_complete` (~280 lines of prompt). The prompt contains the full document skeleton. Same pattern as stakeholder/survey pre-restructure.

### Handler routing

Affinity mapping routes through `researchSynthesisHandler.ts` — a shared handler for all synthesis methods (affinity_mapping, journey_mapping, persona_generation, jobs_to_be_done, usability_issues, design_opportunities, service_blueprint). The handler builds a generic `SynthesisTemplateInput` with `selected_study`, `combined_file_content`, `researcher_contact`, `detected_files`, and file selection metadata. It does not compute any analysis-specific values.

This is a different handler path than the discovery templates (which use `discoverHandler.ts`).

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Masthead (study, researcher, date) | LLM generates from prompt template | Handlebars: `{{selected_study}}`, `{{researcher_contact}}`, `{{current_date}}` |
| Cascade summary table (when upstream exists) | LLM generates counts | Partially mechanical: count of nuggets, participants could come from handler if upstream data is structured |
| Methodology section | LLM generates boilerplate | Handlebars: static text |
| References list | LLM generates fixed list | Handlebars: static list |
| "At a Glance" table structure | LLM generates | Template structure, LLM fills content |
| Theme numbering (01, 02, etc.) | LLM generates | Could be handler-assigned but themes are LLM-discovered (not pre-computed) |

### Cascade contract — consumes

| Variable | Source | Required | Shape |
|----------|--------|----------|-------|
| `atomic_nugget_core` | session_summary | Yes | `{id, nugget_type, severity, text, participant, session}[]` |
| `atomic_nugget_detail` | session_summary | Yes | `{id, verbatim_quote, observed_behavior, inferred_meaning, emotional_state, ...}[]` |
| `target_barriers` | research_brief | No | `{id, barrier, source}[]` |
| `research_questions` | research_brief | No | `{id, question, priority}[]` |
| `participant_metadata` | session_summary | No | Demographics for cross-participant analysis |

The consumes are loaded automatically by yamlProcessor's transform phase (step 3.5), not manually by the handler. The cascade contract is well-defined with `inject_as` roles (reference, grounding, context).

### Cascade contract — emits

| Variable | Schema | Extraction model | Downstream consumers |
|----------|--------|-----------------|---------------------|
| `validated_themes` | `$ref: schemas/validated_theme.yaml` (17 fields, Sonnet) | Sonnet | `journey_mapping`, `persona_generator`, `usability_issues`, `jobs_to_be_done`, `design_opportunities`, `research_readout`, `designer_readout` |
| `unexpected_patterns` | `$ref: schemas/unexpected_pattern.yaml` (5 fields, Sonnet) | Sonnet | None currently (orphaned but valuable for readouts) |

`validated_themes` is the most heavily consumed variable in the cascade — 7 downstream templates depend on it. Both emits use Sonnet extraction due to schema complexity.

### Anti-fabrication guards

**Present and strong.** Six explicit rules:
1. No hallucination — extractor, not generator
2. Inductive clustering (KJ Method — themes emerge from data)
3. VA government context
4. Cite everything (PT-XXX, timestamps)
5. Themes must be distinct
6. Specific theme names (not generic UX jargon)

Plus an 8-point cascade-aware generation block and a 12-point quality checklist.

### Cascade summary section

**Partially present.** Only renders when upstream `atomic_nugget_core` is available (conditional in the LLM prompt). Since affinity mapping always consumes nuggets (they're required), the cascade summary effectively always appears — but it should be a Handlebars section, not LLM-generated.

### Handler bugs

**`focus_area` variable never provided.** Line 207 of the prompt references `{{focus_area}}` but the `SynthesisTemplateInput` interface doesn't include it, and `researchSynthesisHandler.ts` never passes it. Renders as empty string in the output. Likely a remnant from an earlier modal that had a focus area field.

### No topic_slug or derived_variables issues

Affinity mapping is study-scoped (not discovery-scoped), so it doesn't use `topic_slug` or `derived_variables`. The filename uses `{{selected_study}}` which is handler-provided.

### What's missing vs. v7.0

| v7.0 feature | Status |
|--------------|--------|
| Interleaved Handlebars + bounded LLM slots | No — single LLM blob |
| Computed values rendered mechanically | No — everything through LLM |
| Anti-fabrication guards | Present and strong |
| Cascade summary (always present) | Partial — conditional on upstream, LLM-generated |
| Handler assembles mechanical data | No — generic synthesis handler passes raw data |

---

## 2. Target state

Follow the stakeholder synthesis pattern: Handlebars for structure, 1-2 bounded AI tasks for analytical content.

### Key design question: task split

Affinity mapping has the same cross-section coherence requirement as stakeholder synthesis — theme numbering, nugget references, and barrier validation markers flow across the "At a Glance" table and per-theme sections. The analysis should stay in one task.

**Recommended split:**
1. `analysis_body` — "At a Glance" table + per-theme sections + "What's Working" + cross-theme connections + recommended actions. One task preserves theme numbering and nugget ID consistency.
2. Handlebars — masthead, cascade summary (always), methodology toggle, references toggle, upstream context toggle

Same 2-task pattern as stakeholder synthesis. The analytical core stays coherent; boilerplate moves to Handlebars.

### Recommendations section treatment

The "Recommended Actions" section has the same issue as desk research and survey synthesis — the LLM suggests specific product actions. However, unlike discovery templates (where the brief is where actions live), synthesis templates feed directly into readouts which DO contain recommendations. The readout is the researcher's presentation to stakeholders.

**Recommendation:** Keep "Recommended Actions" in affinity mapping. Unlike discovery templates, synthesis recommendations are grounded in session evidence (nuggets) rather than extrapolated from literature. The readout templates consume `validated_themes` to generate audience-specific recommendations — having analysis-level recommendations in the affinity map helps researchers review before generating readouts.

---

## 3. Specific changes required

### 3a. YAML changes (`affinity_mapping.yaml`)

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — "At a Glance" table, per-theme sections (pattern, evidence table, coverage, confidence, implication), "What's Working", cross-theme connections, recommended actions. USE `##` headings (matching the heading fix applied to stakeholder/survey).

**Handlebars renders:**
- Masthead: `# Affinity Map` + study/researcher/date line
- Summary blockquote (theme count, participant count, evidence count — from AI output, not handler)
- Cascade summary (always present, listing consumes and emits)
- Methodology section (in `<details>` toggle)
- References (in `<details>` toggle)
- Upstream context (in `<details>` toggle, conditional on upstream data)

**Remove:**
- LLM-generated masthead
- LLM-generated methodology boilerplate
- LLM-generated references
- LLM-generated quality checklist (internal, never rendered)
- `focus_area` reference (dead variable)

**Add:**
- OUTPUT BOUNDARIES rule with `##` heading instruction
- Cascade summary always rendered (not conditional)

### 3b. Handler changes

**None needed.** The `researchSynthesisHandler.ts` is a generic handler for all synthesis methods. Adding affinity-specific data assembly would require either:
- Special-casing affinity_mapping in the handler (breaks the generic pattern)
- Creating a dedicated handler (same issue as deskResearchHandler vs discoverHandler)

The handler already passes `selected_study`, `researcher_contact`, `combined_file_content`, and `detected_files`. yamlProcessor's transform phase handles cascade variable injection. No handler changes needed.

**Clean up `focus_area`:** Remove the `{{focus_area}}` reference from the prompt since it's never provided.

### 3c. Cascade contract changes

None. Both emitted variable shapes (`validated_themes`, `unexpected_patterns`) stay the same. The 7 downstream consumers are unaffected.

---

## 4. Cascade contract impact

### Downstream consumers

`validated_themes` is consumed by 7 templates — the most heavily consumed variable in the cascade. No shape changes. The extraction uses Sonnet and the `extract_from` hint references "ALL theme sections." With `##` headings rendered consistently, extraction should be at least as reliable as v4.0.

### Extraction impact

Positive. Section headings in `##` format (from the heading instruction) are more consistent than the v4.0 LLM-varied format. The `extract_from` hints reference generic section descriptions ("ALL theme sections"), not specific heading text, so no hint changes needed.

---

## 5. Risks

### Risk 1: validated_themes is the cascade's most consumed variable

7 downstream templates depend on `validated_themes`. Any extraction regression would cascade to journey maps, personas, readouts, etc.

**Mitigation:** Verify extraction after restructure. The schema is complex (17 fields) and uses Sonnet extraction — it was already working in v4.0 with LLM-generated structure. Handlebars structure should make it more reliable, not less.

### Risk 2: Generic handler can't pre-compute analysis-specific values

Unlike briefHandler (which computes timeline, compensation, IDs) or discoverHandler (which computes document inventory), researchSynthesisHandler is generic. It can't pre-compute theme counts, nugget counts, or participant counts because those require analyzing the input data — which is what the LLM does.

**Mitigation:** Accept this. The "At a Glance" summary values remain LLM-computed, same as survey synthesis's response/theme counts. The restructure focuses on extracting boilerplate, not analysis values.

### Risk 3: Recommended Actions section staying in synthesis

Discovery templates removed recommendations (renamed to Knowledge Gaps). Keeping them in synthesis is a conscious deviation. If a reviewer sees the inconsistency, the rationale is: discovery → informs brief → brief decides. Synthesis → informs readout → readout decides. Synthesis recommendations are evidence-grounded, not extrapolated.

---

## 6. Implementation sequence

1. Handlebars skeleton (masthead, cascade summary always-render, methodology toggle, references toggle, upstream context toggle)
2. Split AI task (single `analysis_body` replacing `affinity_complete`)
3. Add OUTPUT BOUNDARIES with `##` heading instruction
4. Clean up dead references (`focus_area`)
5. Verify extraction: `validated_themes` (17 fields, Sonnet) and `unexpected_patterns`

**Estimated effort:** 1 session. Same scope as stakeholder synthesis.

# Leadership Readout Restructure Delta: v1.0 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `designer_readout.yaml` v7.0 (structural), `research_readout.yaml` v7.0 (synthesis pattern), ADR 0005/0016

---

## 1. Current state of leadership_readout

Same "single LLM" pattern:

```handlebars
{{ai_generated.leadership_readout_complete}}
```

One task generates the entire document — title, masthead, cascade summary (count table), bottom line (BLUF), key findings (bulleted), recommended actions table, decisions required (conditional), business impact, risks if inaction, methodology summary, appendix (detailed findings toggle, upstream context toggle).

### Architecture

One AI task: `leadership_readout_complete` (~200 lines of prompt — the shortest readout). Same `readoutHandler.ts` routing. Both "Executive Leadership" and "Product Leadership" checkbox options map to `leadership_readout.yaml`.

### Cascade contract — consumes

| Variable | Source | Required | inject_as |
|----------|--------|----------|-----------|
| `prioritized_findings` | research_readout | Yes | grounding |
| `prioritized_recommendations` | research_readout | Yes | grounding |
| `decision_inputs` | research_readout | No | grounding |
| `business_context` | research_brief | No | context |
| `methodology_selection` | research_brief | No | context |

5 upstream variables, 2 required. **Does consume `decision_inputs`** — unique among readouts. This is the only readout that uses the decision frame extracted by research_readout (decision questions with recommended paths and evidence summaries).

### Cascade contract — emits

| Variable | Schema | Model | Downstream consumers |
|----------|--------|-------|---------------------|
| `exec_summary_points` | `$ref: schemas/exec_summary_point.yaml` (7 fields) | Sonnet | **None** (document-only) |

**No downstream consumers.** The schema explicitly states "Consumed by: none (document-only, no downstream tickets)". `ticketHandler.ts` has no leadership audience config — the Step 1 modal explicitly says "Leadership readouts are document-only — no tickets."

### exec_summary_points schema — 7 fields

**Required (3):**
- `id` — Format: exec-point-001, exec-point-002
- `point` — Executive-level statement (1-2 sentences)
- `supporting_findings` — Finding IDs (finding-XX)

**Optional (4):**
- `category` — Enum: risk, opportunity, decision_required, validation, recommendation
- `business_implication` — Why this matters at executive level
- `recommended_action` — What leadership should do
- `effort_summary` — Resource implication summary

**Assessment:** The schema is lightweight and appropriate for its purpose. 7 fields is intentionally minimal — executive summary points don't need the depth of ticket schemas. The `category` enum effectively sorts points for leadership scanning. No alignment needed — this is a different pattern from tickets entirely.

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Document title + masthead | LLM generates | Handlebars |
| Cascade summary (count table) | LLM computes counts | Handlebars (mechanical) |
| Methodology summary | LLM generates 1 paragraph | Keep in LLM — leadership-appropriate synthesis |
| Upstream context table | LLM generates with Available/Missing | Handlebars (conditional) |

**Note:** Leadership readout intentionally keeps methodology in the main body (1 paragraph) rather than a toggle — leadership wants to see how conclusions were reached, but briefly. This stays in the AI task.

### Anti-fabrication guards

**Present and leadership-appropriate.** 8 numbered rules:

1. Bottom Line Up Front
2. Decisions, not data
3. Business impact in leadership language
4. Brevity over completeness
5. Decision points explicit
6. **Anti-fabrication: Don't invent business metrics, financial implications, or strategic priorities not in upstream.** If business_context mentions specific pressures, reference them. Otherwise stay descriptive.
7. Privacy — PT-XXX only, aggregate where possible
8. No raw JSON

**Assessment:** Rule 6 is critical for leadership audiences — LLMs commonly invent ROI figures, strategic priorities, and budget implications. The guard correctly instructs: reference upstream business_context when available, otherwise stay descriptive. Preserved as-is.

### Cascade summary status

**LLM-generated, wrong format.** Same as other readouts — count table instead of v7.0 contract format.

### Notable structural differences from other readouts

1. **BLUF-style architecture.** Bottom Line section leads — no methodology preamble. 2-3 pages max.
2. **No tickets.** Document-only. No ticket candidates section, no sequencing, no dependency graph.
3. **"Decisions required" section** (conditional). Explicit decision questions with recommended paths and "impact of delay." Unique to leadership.
4. **"Risks if inaction" section.** Frames consequences of not acting on findings. Business risk, compliance risk, user impact at scale.
5. **"Business impact" section.** Connects findings to business outcomes from upstream business_context. Strategic language.
6. **Methodology in main body** (1 paragraph, not toggle). Leadership sees how conclusions were reached but briefly.
7. **Detailed findings in appendix toggle.** Inverse of other readouts where findings are in the main body.
8. **Shortest prompt** (~200 lines vs designer's ~300, engineering's ~300, accessibility's ~310).

### Handler concerns

Same `readoutHandler.ts`. `selected_study` already fixed. No changes needed.

---

## 2. Target state

Same pattern: single `analysis_body` task + Handlebars for structure.

### Task split

Leadership readout has cross-section coherence — bottom line references key findings, recommended actions reference finding IDs, decisions required trace to findings, business impact references findings. One task preserves coherence.

**Recommended split:**
1. `analysis_body` — Bottom line (BLUF), key findings (bulleted with finding IDs), recommended actions table, decisions required (conditional), business impact, risks if inaction, methodology summary (1 paragraph), detailed findings appendix content. One task.
2. Handlebars — masthead, cascade summary (standard v7.0 format), upstream context (toggle, conditional), validity-level checklist not needed for leadership (document is too short for a checklist to add value — omit).

**Decision: omit validity checklist for leadership.** The other readouts have validity checklists because they generate structured data (tickets) where verification matters. Leadership brief is a narrative document — a validity checklist adds noise for no value. The anti-fabrication guards in the prompt serve the same purpose.

---

## 3. Specific changes required

### 3a. YAML changes

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — Bottom line, key findings, recommended actions, decisions required (conditional), business impact, risks if inaction, methodology summary (1 paragraph), detailed findings (for appendix toggle content). USE `##` headings.

**Handlebars renders:**

- **Masthead:** `# Leadership Brief: {{selected_study}}`
  - Study, audience, researcher, date
- **Cascade summary** (standard v7.0 format):
  - Emits table: `exec_summary_points`
  - Consumes table: all 5 upstream variables
- **Upstream context** (in `<details>` toggle, conditional):
  - Variable table with source and role
- **No validity checklist** (intentional — document too short for checklist to add value)

**Clean up:**
- OUTPUT BOUNDARIES with `##` heading instruction
- Remove quality checklist
- Move detailed findings appendix content into the AI task output, wrapped by Handlebars `<details>` toggle
- Fix version to v7.0

### 3b. Handler changes

None. Same `readoutHandler.ts`. `selected_study` already in place.

### 3c. Cascade contract changes

None. `exec_summary_points` emit schema unchanged (7 fields). No downstream consumers to affect.

---

## 4. Risks

### Risk 1: exec_summary_points extraction (7 fields, Sonnet)

Smallest schema of any readout emit. Low extraction risk. The `category` enum and `supporting_findings` array are straightforward.

**Mitigation:** Schema unchanged. Verify after restructure.

### Risk 2: document length after restructure

Leadership brief is intentionally short (2-3 pages). Moving structural elements to Handlebars might make the AI output feel disconnected from the frame. The BLUF pattern requires tight integration between bottom line → findings → actions → decisions.

**Mitigation:** The AI task generates all analytical content in one pass. Handlebars only wraps with masthead and appendix toggles. The analytical flow is unbroken.

---

## 5. Implementation sequence

1. Handlebars skeleton (masthead, cascade summary, upstream context toggle — no validity checklist)
2. Split AI task (single `analysis_body` replacing `leadership_readout_complete`)
3. Add OUTPUT BOUNDARIES with `##` heading instruction
4. Remove internal quality checklist
5. Verify extraction: `exec_summary_points` (7 fields, Sonnet)

**Estimated effort:** 1 session. Smaller than other readouts due to shorter prompt.

---

## 6. Ticket alignment assessment

**Not applicable.** Leadership readout does not emit tickets. The `exec_summary_points` schema is intentionally different from ticket schemas:

- 7 fields vs designer's 15 / engineering's 21 / accessibility's 18
- No acceptance criteria, no affected components, no testing approach
- Purpose is executive distillation, not work item generation
- `ticketHandler.ts` explicitly excludes leadership: "Leadership readouts are document-only — no tickets"

The v1.1-followups ticket alignment item is now fully resolved — all 3 ticket-generating readouts confirmed production-ready, and leadership confirmed as a different pattern entirely. The followup can be closed.

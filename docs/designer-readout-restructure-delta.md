# Designer Readout Restructure Delta: v1.1 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Implemented (2026-05-20). Confirmed by conformance audit 2026-08-04 — all 10 proposed changes applied.
**Reference:** `affinity_mapping.yaml` v7.0, `persona_generator.yaml` v7.0, ADR 0005/0016

---

## 1. Current state of designer_readout

Same "single LLM" pattern as all pre-restructure templates:

```handlebars
{{ai_generated.designer_readout_complete}}
```

One task generates the entire document — title, masthead, cascade summary (count table), design challenges (editorial numbering), personas-to-design-for table, journey stages table, ticket candidates (3-8 structured tickets), recommended sequencing table, methodology, references, validity checklist, upstream context appendix.

### Architecture

One AI task: `designer_readout_complete` (~310 lines of prompt). Routed through `readoutHandler.ts` — generic handler for all readout audiences. User selects "Design Team" checkbox in `/qori-report` modal; handler fetches `designer_readout.yaml` and calls `processYamlTemplate`.

### Cascade contract — consumes

| Variable | Source | Required | inject_as |
|----------|--------|----------|-----------|
| `prioritized_findings` | research_readout | Yes | grounding |
| `prioritized_recommendations` | research_readout | Yes | grounding |
| `personas` | persona_generator | Yes | reference |
| `journey_stages` | journey_mapping | No | reference |
| `validated_themes` | affinity_mapping | No | reference |
| `target_barriers` | research_brief | No | context |

6 upstream variables — same count as persona_generator. The 3 required variables all come from templates already on v7.0 (research_readout is not yet restructured but its emit schema is stable). The 3 optional variables include `journey_stages` from `journey_mapping` (not yet restructured).

### Cascade contract — emits

| Variable | Schema | Model | Downstream consumers |
|----------|--------|-------|---------------------|
| `design_ticket_candidates` | `$ref: schemas/design_ticket_candidate.yaml` (15 fields) | Sonnet | `ticketHandler.ts` (GitHub Issues creation) |

**Single downstream consumer** — `ticketHandler.ts` queries `design_ticket_candidates` from Postgres, presents tickets in a Step 2 modal with priority/effort metadata, and creates GitHub Issues via `formatIssueBody()`. The `formatIssueBody` function builds full issue bodies with Current Design State, Affected Personas, Acceptance Criteria, Design Artifacts, Collaboration, Dependencies, and Linked Findings sections.

This is the only readout template with a live downstream consumer. The others (engineering, accessibility, leadership) presumably emit their own ticket variables but those consumers may not be built yet.

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Document title + masthead | LLM generates | Handlebars |
| Cascade summary (count table) | LLM computes counts from upstream data | Handlebars (mechanical, conditional on data availability) |
| Methodology section | LLM generates static text | Handlebars (static) |
| References list | LLM generates fixed list | Handlebars (static) |
| Validity checklist | LLM generates with hardcoded checkmarks | Handlebars (static, empty cells per v7.0 pattern) |
| Upstream context table | LLM generates with Available/Missing status | Handlebars (conditional on data) |
| "Do NOT output a footer" instruction | LLM told not to generate | Handlebars simply doesn't include it |

### Anti-fabrication guards

**Present but embedded in monolithic prompt.** Six numbered rules:
1. Translate findings into design language (don't reproduce readout bullets)
2. Personas drive priority
3. Each ticket addresses specific findings (addresses_findings must reference real finding IDs)
4. Acceptance criteria in design terms, not engineering
5. Design artifacts needed per ticket
6. Anti-fabrication: all references must trace to upstream variables

Plus a 9-point quality checklist ("do not include in output") at the end of the prompt.

**Assessment:** Guards are adequate for the analytical content. The main gap is that the LLM generates the cascade summary count table (findings: X, personas: X) — these counts are mechanical and should be Handlebars-computed. The LLM also generates the upstream context status table with Available/Missing markers — also mechanical.

### Cascade summary status

**LLM-generated, wrong format.** The current cascade summary is a count table:

```markdown
| Source | Count |
|--------|-------|
| Findings from research readout | [count] |
| Personas available | [count] |
```

This is different from the v7.0 standard cascade summary which documents emits and consumes:

```markdown
| Variable | Description |
|----------|-------------|
| design_ticket_candidates | Actionable design tickets with persona impact and finding traceability |
```

The count table is useful information but belongs in the Summary section, not the cascade summary. The cascade summary should document the contract (what flows in, what flows out), not runtime data.

### Ticket body quality

**Assessment: production-ready schema, prompt needs tightening.**

The `design_ticket_candidate.yaml` schema is comprehensive (15 fields including current_design_state, affected_screens, acceptance_criteria, design_artifacts_needed, collaboration_needed, blocked_by, related_engineering_tickets). The downstream `ticketHandler.ts` `formatIssueBody()` function renders all fields into well-structured GitHub Issues.

**What's good:**
- Schema covers all fields a design ticket needs
- `formatIssueBody` renders rich GitHub Issues with proper sections
- Priority (P0-P3) and effort (High/Medium/Low) are enums
- `addresses_findings` creates traceability back to research
- `acceptance_criteria` scoped to design ("Mockup demonstrates..."), not engineering

**What needs work:**
- The prompt says "Generate 3-8 tickets depending on finding count" — this is a range, not a rule. The LLM may over-generate tickets with thin descriptions or under-generate with fat ones. The v7.0 pattern would add a count heuristic: "one ticket per finding that requires design work, merge findings that map to the same design intervention."
- `related_engineering_tickets` is always empty array (prompt says "Leave empty for now"). Worth keeping the field but adding a comment that cross-template ticket linking is a future enhancement.
- `current_design_state` prompt says "If not documented, write 'Not documented in upstream research.'" — this is correct and production-ready.
- Ticket numbering (design-ticket-001) is LLM-assigned. Stable enough for extraction but could drift if the LLM skips numbers.

### Handler concerns

`readoutHandler.ts` is generic — routes by audience selection, no template-specific data assembly. Same pattern as `researchSynthesisHandler.ts`. No handler changes needed for v7.0 restructure.

### Version numbering

Notes say "v1.0: Initial designer readout template" but YAML header says `version: "v1.1"`. No v1.1 changelog. Cosmetic — bump to v7.0 on restructure.

---

## 2. Target state

Same pattern as affinity_mapping and persona_generator v7.0: single `analysis_body` task + Handlebars for structure.

### Task split

Designer readout has the same cross-section coherence requirement — design challenge numbering (## 01, ## 02), ticket numbering (design-ticket-001), persona-to-challenge mapping, and sequencing all cross-reference each other. Splitting into multiple tasks would break these references.

**Recommended split:**
1. `analysis_body` — Summary, design challenges (editorial numbered), personas-to-design-for table, journey stages table (conditional), ticket candidates, recommended sequencing. One task preserves cross-referencing.
2. Handlebars — masthead, cascade summary (standard format: emits + consumes tables), methodology (toggle), references (toggle), upstream context (toggle, conditional on data), validity checklist (toggle).

### What changes from the current prompt

The analytical content of the prompt is strong. The main changes are:

1. **Remove structural elements from prompt.** Title, masthead, cascade summary, methodology, references, validity checklist, upstream context — all move to Handlebars.
2. **Add OUTPUT BOUNDARIES.** Explicit instruction not to generate structural elements.
3. **Add `## ` heading instruction.** Same pattern as affinity_mapping and persona_generator.
4. **Move cascade summary from count table to contract table.** Count table content moves to Summary section as a natural part of the summary prose.
5. **Move quality checklist out of prompt.** The 9-point internal checklist is noise in the prompt — the anti-fabrication rules already cover these. Remove.
6. **Tighten ticket count heuristic.** "One ticket per finding requiring design work; merge findings mapping to the same design intervention" instead of "3-8 tickets."

---

## 3. Specific changes required

### 3a. YAML changes

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — Summary (including upstream data counts), design challenges (## 01 numbered), personas-to-design-for table, journey stages table (conditional), ticket candidates (design-ticket-XXX formatted), recommended sequencing table. USE `##` headings.

**Handlebars renders:**

- **Masthead:** `# Designer Readout: {{selected_study}}`
  - Study, audience, date, status in metadata line
- **Cascade summary** (always present, standard v7.0 format):
  - Emits table: `design_ticket_candidates`
  - Consumes table: all 6 upstream variables with source and role
- **Methodology** (in `<details>` toggle):
  - Framework, approach (static text)
  - References (static list: Cooper, NNG, Kalbach)
- **Upstream context** (in `<details>` toggle, conditional on data):
  - Source table with status
  - Citation marker legend
- **Validity checklist** (in `<details>` toggle):
  - Standard criteria table with empty Verified cells (v7.0 pattern)

**Clean up:**
- OUTPUT BOUNDARIES with `##` heading instruction
- Remove 9-point quality checklist from prompt (redundant with anti-fabrication rules)
- Tighten ticket count heuristic
- Fix version to v7.0

### 3b. Handler changes

None. `readoutHandler.ts` is generic — no template-specific data assembly.

### 3c. Cascade contract changes

None. `design_ticket_candidates` emit schema unchanged. `ticketHandler.ts` (sole downstream consumer) unaffected.

---

## 4. Risks

### Risk 1: design_ticket_candidates extraction complexity

The `design_ticket_candidate.yaml` schema has 15 fields including nested arrays (acceptance_criteria, design_artifacts_needed, affected_screens, etc.). Sonnet extraction on a complex schema from a restructured document could regress.

**Mitigation:** The schema itself doesn't change. The ticket candidates section format in the prompt is unchanged — only the surrounding structural elements move to Handlebars. Extraction targets the ticket sections, which remain in the AI-generated portion. Same risk level as persona_generator (17+ field schema, Sonnet, confirmed working).

### Risk 2: cross-reference integrity between challenges and tickets

Design challenges (## 01, ## 02) and tickets (design-ticket-001, design-ticket-002) reference each other via `addresses_findings` and challenge numbers. Keeping both in one task preserves this. No additional risk from restructure.

### Risk 3: ticketHandler.ts depends on extraction quality

`ticketHandler.ts` reads `design_ticket_candidates` from Postgres and renders them into GitHub Issues. If extraction quality drops, `formatIssueBody()` will produce incomplete issues. This is the only readout with a live downstream consumer pipeline.

**Mitigation:** The extraction path is unchanged — Sonnet extracts from ticket sections, same as today. Verify extraction after restructure by running a test readout and checking `study_variables` rows.

---

## 5. Implementation sequence

1. Handlebars skeleton (masthead, cascade summary in standard v7.0 format, methodology toggle, references toggle, upstream context toggle, validity checklist toggle)
2. Split AI task (single `analysis_body` replacing `designer_readout_complete`)
3. Add OUTPUT BOUNDARIES with `##` heading instruction
4. Move upstream data counts from cascade summary to Summary section
5. Tighten ticket count heuristic
6. Remove internal quality checklist from prompt
7. Verify extraction: `design_ticket_candidates` (15 fields, Sonnet)

**Estimated effort:** 1 session. Same scope as persona_generator.

---

## 6. Ticket body quality assessment

The product backlog notes that readout templates "need ticket bodies iterated to production-grade." For designer_readout specifically:

**Already production-grade:**
- Schema covers all necessary fields (15 fields)
- `ticketHandler.ts` `formatIssueBody()` renders complete GitHub Issues
- Acceptance criteria scoped to design ("Mockup demonstrates..."), not engineering
- Traceability: `addresses_findings` links back to research readout
- Privacy: PT-XXX codes only
- Priority (P0-P3) and effort (High/Medium/Low) as enums

**Minor improvements bundled with restructure:**
- Ticket count heuristic tightened (finding-driven instead of arbitrary 3-8 range)
- `related_engineering_tickets` documented as future enhancement (empty array is correct)

**Not in scope for restructure (future work):**
- Cross-readout ticket linking (design-ticket-001 → eng-ticket-001) — requires a ticket coordination layer
- Ticket deduplication across readout regenerations — currently `pool_strategy: replace` handles this at the variable level, but GitHub Issues would need reconciliation

**Verdict:** Designer readout ticket bodies are the most production-ready of any readout. The schema, prompt instructions, and downstream `formatIssueBody()` pipeline are all aligned. The v7.0 restructure doesn't need to touch ticket quality — only structural architecture.

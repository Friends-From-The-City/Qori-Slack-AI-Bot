# Engineering Readout Restructure Delta: v1.1 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `designer_readout.yaml` v7.0, ADR 0005/0016

---

## 1. Current state of engineering_readout

Same "single LLM" pattern as designer_readout pre-restructure:

```handlebars
{{ai_generated.engineering_readout_complete}}
```

One task generates the entire document — title, masthead, cascade summary (count table), summary, technical challenges (editorial numbered), architecture context (conditional on stakeholder_constraints), ticket candidates (3-8 engineering tickets), implementation sequencing with dependency graph, technical risks table, methodology, references, validity checklist, upstream context.

### Architecture

One AI task: `engineering_readout_complete` (~300 lines of prompt). Routed through `readoutHandler.ts` — same generic handler as designer_readout. User selects "Engineering Team" checkbox in `/qori-report` modal.

### Cascade contract — consumes

| Variable | Source | Required | inject_as |
|----------|--------|----------|-----------|
| `prioritized_findings` | research_readout | Yes | grounding |
| `prioritized_recommendations` | research_readout | Yes | grounding |
| `stakeholder_constraints` | stakeholder_synthesis | No | grounding |
| `personas` | persona_generator | No | reference |
| `target_barriers` | research_brief | No | context |
| `methodology_selection` | research_brief | No | context |

6 upstream variables. 2 required (same as designer_readout). `stakeholder_constraints` is unique to engineering — it's grounding (not reference), informing implementation feasibility and effort estimates.

### Cascade contract — emits

| Variable | Schema | Model | Downstream consumers |
|----------|--------|-------|---------------------|
| `engineering_ticket_candidates` | `$ref: schemas/engineering_ticket_candidate.yaml` (21 fields) | Sonnet | `ticketHandler.ts` (GitHub Issues creation) |

**Single downstream consumer** — same `ticketHandler.ts` as designer_readout. The handler has full first-class support for engineering tickets: `AUDIENCE_CONFIG.engineering` maps to `engineering_ticket_candidates`, and `formatIssueBody` has engineering-specific sections (Definition of Done, Affected Components, Technical Constraints, Testing Approach, Dependencies with enables/blocked_by, Effort with rationale and sprint estimates).

### Ticket body quality — already ahead of designer_readout

**Significant finding: engineering_readout does NOT need ticket alignment to designer's reference.** The v1.1-followups note about "readout ticket body alignment" assumed designer_readout was the ceiling. Engineering is actually ahead:

| Dimension | Designer (15 fields) | Engineering (21 fields) |
|-----------|---------------------|------------------------|
| Required fields | 6 | 6 (same) |
| Acceptance criteria | `acceptance_criteria` (generic) | `technical_acceptance_criteria` (scoped) |
| Components | `affected_screens` | `affected_components` |
| Effort detail | `effort` enum only | `effort` + `effort_rationale` + `effort_estimate_sprints` |
| Dependencies | `blocked_by` only | `blocked_by` + `enables` |
| Cross-readout links | `related_engineering_tickets` | `related_design_tickets` + `related_accessibility_tickets` |
| Impact metrics | — | `user_impact_metrics` |
| Testing | — | `testing_approach` |
| Constraints | — | `technical_constraints` |
| Current state | `current_design_state` | `current_behavior` |

Engineering has 6 fields designer lacks (testing_approach, enables, user_impact_metrics, effort_rationale, effort_estimate_sprints, technical_constraints). The `formatIssueBody` rendering in `ticketHandler.ts` handles all 21 fields with engineering-specific GitHub Issue sections.

**Verdict:** Engineering ticket quality is production-ready. The v1.1-followups alignment note applies to accessibility and leadership readouts, not engineering.

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Document title + masthead | LLM generates | Handlebars |
| Cascade summary (count table) | LLM computes counts | Handlebars (mechanical) |
| Methodology section | LLM generates static text | Handlebars (static) |
| References list | LLM generates fixed list | Handlebars (static) |
| Validity checklist | LLM generates with hardcoded checkmarks | Handlebars (static, empty cells) |
| Upstream context table | LLM generates with Available/Missing | Handlebars (conditional on data) |

### Anti-fabrication guards

**Present and engineering-appropriate.** 8 numbered rules plus a quality checklist:

1. Translate findings into technical work
2. Stakeholder constraints inform implementation
3. Acceptance criteria in technical terms
4. Affected components — be specific
5. Effort grounded in stakeholder data
6. Anti-fabrication — no invented components, libraries, or sprint estimates
7. Privacy — PT-XXX only
8. No raw JSON

Plus rule 9 (misnumbered): populate production fields per ticket (current_behavior, effort_rationale, user_impact_metrics, related cross-readout tickets).

**Assessment:** Guards are adequate. The "don't invent technical components" rule is important for engineering — LLMs tend to hallucinate library names and system boundaries.

### Cascade summary status

**LLM-generated, wrong format.** Same issue as designer_readout v1.1 — count table instead of v7.0 contract format.

### Notable structural differences from designer_readout

1. **Architecture context section** (conditional on `stakeholder_constraints`). Groups constraints by type with impact-on-implementation column. Unique to engineering readout.
2. **Technical risks section.** Risk/likelihood/impact/mitigation table. Not present in designer_readout.
3. **Implementation sequencing** uses "Phase" column (vs designer's "Sequence") and has a "Dependencies" column plus "Foundation work vs feature work" distinction.
4. **Ticket format** has engineering-specific fields: current_behavior, user_impact, acceptance_criteria (technical), affected_components, technical_constraints, testing_approach, dependencies (blocked_by + enables + related cross-readout), effort with rationale.

### Handler concerns

Same `readoutHandler.ts` generic handler. No changes needed. `selected_study` already fixed in PR #142.

---

## 2. Target state

Same pattern as designer_readout v7.0: single `analysis_body` task + Handlebars for structure.

### Task split

Engineering readout has the same cross-section coherence requirements — technical challenge numbering (## 01, ## 02), ticket numbering (eng-ticket-001), architecture context→ticket constraint references, implementation sequencing→ticket dependencies, and technical risks→ticket impact all cross-reference each other.

**Recommended split:**
1. `analysis_body` — Summary (with upstream data counts in prose), technical challenges (editorial numbered), architecture context (conditional), ticket candidates, implementation sequencing, technical risks. One task preserves cross-referencing.
2. Handlebars — masthead, cascade summary (standard v7.0 format), methodology (toggle), references (toggle), upstream context (toggle, conditional on data), validity checklist (toggle).

### What changes from the current prompt

1. **Remove structural elements from prompt.** Title, masthead, cascade summary, methodology, references, validity checklist, upstream context — all move to Handlebars.
2. **Add OUTPUT BOUNDARIES.** Explicit instruction not to generate structural elements.
3. **Add `##` heading instruction.**
4. **Move cascade summary to standard v7.0 format.**
5. **Remove internal quality checklist.**
6. **Tighten ticket count heuristic.** Same as designer: "one ticket per finding requiring engineering work, merge findings mapping to same technical change."
7. **Fix dependency placeholder.** Same issue as designer_readout pre-fix: `[Leave empty for now]` renders literally. Change to `— None at this time`.

---

## 3. Specific changes required

### 3a. YAML changes

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — Summary (with upstream data counts), technical challenges (## 01 numbered), architecture context (conditional on stakeholder_constraints), ticket candidates (eng-ticket-XXX), implementation sequencing, technical risks. USE `##` headings.

**Handlebars renders:**

- **Masthead:** `# Engineering Readout: {{selected_study}}`
  - Study, audience, researcher, date
- **Cascade summary** (always present, standard v7.0 format):
  - Emits table: `engineering_ticket_candidates`
  - Consumes table: all 6 upstream variables
- **Methodology** (in `<details>` toggle):
  - Framework, approach (static), references
- **Upstream context** (in `<details>` toggle, conditional):
  - Variable table with source and role
  - Citation marker legend
- **Validity checklist** (in `<details>` toggle):
  - Empty Verified cells (v7.0 pattern)

**Clean up:**
- OUTPUT BOUNDARIES with `##` heading instruction
- Remove quality checklist
- Fix dependency placeholder text
- Tighten ticket count heuristic
- Fix misnumbered rule 9 → proper sequence

### 3b. Handler changes

None. Same `readoutHandler.ts`. `selected_study` already in place.

### 3c. Cascade contract changes

None. `engineering_ticket_candidates` emit schema unchanged (21 fields). `ticketHandler.ts` unaffected.

---

## 4. Risks

### Risk 1: engineering_ticket_candidates extraction complexity

21-field schema (more complex than designer's 15). Sonnet extraction on nested arrays (`technical_acceptance_criteria`, `affected_components`, `testing_approach`). Same risk profile as designer_readout but slightly larger schema.

**Mitigation:** Schema hasn't changed. Ticket sections format unchanged — only surrounding structural elements move to Handlebars. Extraction targets ticket sections, which remain in AI output. Verify after restructure.

### Risk 2: stakeholder_constraints conditional content

The architecture context section and constraint references in tickets are conditional on `stakeholder_constraints` availability. The prompt must handle both paths cleanly — with constraints (reference constraint IDs) and without (skip architecture context section, omit constraint references in tickets).

**Mitigation:** The conditional logic already exists in the v1.1 prompt (`{% if upstream_stakeholder_constraints %}`). Preserved in restructured prompt.

---

## 5. Implementation sequence

1. Handlebars skeleton (masthead, cascade summary, methodology toggle, references toggle, upstream context toggle, validity checklist toggle)
2. Split AI task (single `analysis_body` replacing `engineering_readout_complete`)
3. Add OUTPUT BOUNDARIES with `##` heading instruction
4. Fix dependency placeholder text (`— None at this time`)
5. Tighten ticket count heuristic
6. Remove internal quality checklist
7. Verify extraction: `engineering_ticket_candidates` (21 fields, Sonnet)

**Estimated effort:** 1 session. Same scope as designer_readout.

---

## 6. Ticket body alignment assessment

**Engineering does NOT need alignment to designer_readout's reference.** Engineering's 21-field schema is already more comprehensive than designer's 15. The `formatIssueBody` rendering in `ticketHandler.ts` handles all engineering fields with audience-specific GitHub Issue sections.

The v1.1-followups "readout ticket body alignment" note should be narrowed: it applies to accessibility_readout and leadership_readout only. Engineering is already production-ready.

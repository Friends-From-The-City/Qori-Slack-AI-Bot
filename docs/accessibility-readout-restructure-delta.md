# Accessibility Readout Restructure Delta: v1.1 to v7.0 Conformance

**Date:** 2026-05-20
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `designer_readout.yaml` v7.0, `engineering_readout.yaml` v7.0, ADR 0005/0016

---

## 1. Current state of accessibility_readout

Same "single LLM" pattern:

```handlebars
{{ai_generated.accessibility_readout_complete}}
```

One task generates the entire document — title, masthead, cascade summary (count table with accessibility filtering), summary, accessibility findings (editorial numbered), affected AT user populations table, WCAG/Section 508 compliance implications table, ticket candidates (a11y-ticket-XXX), recommended AT testing matrix, methodology, references, validity checklist, upstream context.

### Architecture

One AI task: `accessibility_readout_complete` (~310 lines of prompt). Same `readoutHandler.ts` routing — user selects "Accessibility Team" checkbox.

### Cascade contract — consumes

| Variable | Source | Required | inject_as |
|----------|--------|----------|-----------|
| `prioritized_findings` | research_readout | Yes | grounding |
| `atomic_nugget_core` | session_summary | No | reference |
| `atomic_nugget_detail` | session_summary | No | reference |
| `personas` | persona_generator | No | reference |
| `target_barriers` | research_brief | No | context |

5 upstream variables, 1 required. **Notably does NOT consume `prioritized_recommendations`** — unlike designer (requires it) and engineering (requires it). Accessibility readout filters findings for AT impact and maps to WCAG criteria; it doesn't need the recommendation translation layer.

Also consumes `atomic_nugget_core` and `atomic_nugget_detail` directly (optional) — unique among readouts. These provide verbatim AT user quotes as compliance evidence.

### Cascade contract — emits

| Variable | Schema | Model | Downstream consumers |
|----------|--------|-------|---------------------|
| `accessibility_ticket_candidates` | `$ref: schemas/accessibility_ticket_candidate.yaml` (18 fields) | Sonnet | `ticketHandler.ts` (GitHub Issues creation) |

**Single downstream consumer** — `ticketHandler.ts` has full first-class accessibility support: `AUDIENCE_CONFIG.accessibility`, dedicated `formatIssueBody` sections (WCAG Criterion, Section 508, Priority Rationale, AT Users, Evidence Nuggets, Recommended Testing, Regression Risk, Compliance Deadline), and `buildLabels` creating `wcag:X.X.X` labels plus `compliance` label for P0_legal tickets.

### Ticket body quality — already appropriately specialized

**18-field schema (between designer's 15 and engineering's 21).** The schema is compliance/AT-focused by design, not a gap:

| Aspect | Designer (15) | Engineering (21) | Accessibility (18) |
|--------|--------------|-------------------|-------------------|
| Required fields | id, title, description, addresses_findings, priority, effort | Same + effort | id, title, description, wcag_criterion, priority |
| Priority enum | P0-P3 | P0-P3 | **P0_legal, P0_severe**, P1-P3 |
| Effort required? | Yes | Yes | **No** |
| addresses_findings required? | Yes | Yes | **No** |
| Compliance fields | 0 | 0 | **7** (wcag_criterion, section_508_implication, affected_at_users, evidence_nuggets, recommended_testing, compliance_priority_rationale, regression_risk) |
| Cross-readout links | related_engineering_tickets | related_design_tickets + related_accessibility_tickets | related_engineering_tickets |

**Verdict: Accessibility does NOT need alignment to designer or engineering.** The schema differences are intentional — WCAG-first, not effort-first. The `P0_legal` vs `P0_severe` distinction is a domain-specific priority system that shouldn't be flattened to match the generic P0. The `wcag_criterion` as required (instead of effort) reflects compliance-driven prioritization.

The v1.1-followups note should be updated: accessibility ticket alignment is complete as-is. Only leadership_readout remains to audit.

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Document title + masthead | LLM generates | Handlebars |
| Cascade summary (count table with accessibility filtering) | LLM computes counts | Handlebars (mechanical) |
| Methodology section | LLM generates static text | Handlebars (static) |
| References list | LLM generates fixed list | Handlebars (static) |
| Validity checklist | LLM generates with hardcoded checkmarks | Handlebars (static, empty cells) |
| Upstream context table | LLM generates with Available/Missing | Handlebars (conditional on data) |

### Anti-fabrication guards

**Present and accessibility-appropriate.** 8 numbered rules plus quality checklist:

1. Filter findings for AT impact (not all findings need tickets)
2. Verbatim AT user quotes are compliance evidence
3. WCAG criterion specificity — specific criterion or null, never guess
4. Priority distinguishes P0_legal from P0_severe
5. Personas with AT context referenced explicitly
6. Anti-fabrication — no invented WCAG criteria, ATs, or Section 508 deadlines
7. Privacy — PT-XXX only, AT details anonymized
8. No raw JSON

Plus rule 9 (misnumbered): populate production fields (regression_risk, compliance_priority_rationale, related_engineering_tickets).

**Assessment:** Strong. The "don't guess WCAG criteria" rule is critical — LLMs commonly fabricate criterion numbers. Preserved as-is.

### Cascade summary status

**LLM-generated, wrong format.** Same as other readouts. Count table with accessibility-specific filtering (findings with accessibility impact, nugget_type=accessibility_issue count, personas with AT context, accessibility-flagged barriers).

### Notable structural differences from designer/engineering readouts

1. **"Affected AT user populations" table.** Persona ID → AT setup → barriers → impact severity. Unique to accessibility.
2. **"WCAG / Section 508 compliance implications" table.** Finding → WCAG criterion → principle → level → status. Unique to accessibility.
3. **"Recommended AT testing matrix."** AT type → platform → tool → tickets to validate. Unique to accessibility.
4. **Ticket format** uses `a11y-ticket-XXX` IDs and includes compliance-specific fields (wcag_criterion, section_508_implication, compliance_deadline, regression_risk, recommended_testing with specific AT setups).
5. **No "recommended sequencing" or "implementation sequencing."** Accessibility tickets are prioritized by compliance urgency, not dependency chains.

### Handler concerns

Same `readoutHandler.ts`. No changes needed. `selected_study` already fixed.

---

## 2. Target state

Same pattern as designer/engineering v7.0: single `analysis_body` task + Handlebars for structure.

### Task split

Accessibility readout has cross-section coherence requirements — finding numbering, WCAG mapping table → ticket criterion references, AT testing matrix → ticket validation, and AT user populations → ticket affected_at_users all cross-reference.

**Recommended split:**
1. `analysis_body` — Summary (with upstream data counts including accessibility filtering), accessibility findings (editorial numbered), affected AT user populations table, WCAG/Section 508 compliance implications table, ticket candidates (a11y-ticket-XXX), recommended AT testing matrix. One task preserves cross-referencing.
2. Handlebars — masthead, cascade summary (standard v7.0 format), methodology (toggle), references (toggle), upstream context (toggle, conditional), validity checklist (toggle).

---

## 3. Specific changes required

### 3a. YAML changes

**Split into 1 AI task + Handlebars structure:**

1. `analysis_body` — Summary, accessibility findings (## 01 numbered), affected AT user populations, WCAG/Section 508 table, ticket candidates (a11y-ticket-XXX), AT testing matrix. USE `##` headings.

**Handlebars renders:**

- **Masthead:** `# Accessibility Readout: {{selected_study}}`
  - Study, audience, researcher, date
- **Cascade summary** (standard v7.0 format):
  - Emits table: `accessibility_ticket_candidates`
  - Consumes table: all 5 upstream variables
- **Methodology** (in `<details>` toggle):
  - Framework, approach (static), references (WCAG 2.2, ARIA APG, Section 508, NNG)
- **Upstream context** (in `<details>` toggle, conditional):
  - Variable table with source and role
  - Citation marker legend
- **Validity checklist** (in `<details>` toggle):
  - Empty Verified cells (v7.0 pattern)

**Clean up:**
- OUTPUT BOUNDARIES with `##` heading instruction
- Remove quality checklist
- Fix dependency placeholder: `— None at this time`
- Fix misnumbered rule 9

### 3b. Handler changes

None. Same `readoutHandler.ts`. `selected_study` already in place.

### 3c. Cascade contract changes

None. `accessibility_ticket_candidates` emit schema unchanged (18 fields). `ticketHandler.ts` unaffected.

---

## 4. Risks

### Risk 1: accessibility_ticket_candidates extraction (18 fields, Sonnet)

Accessibility schema includes nullable fields like `wcag_criterion`, `compliance_deadline`, `regression_risk` that may be null in many cases. Extraction must handle null values correctly. Same risk profile as designer/engineering.

**Mitigation:** Schema unchanged. Ticket sections format unchanged. Verify after restructure.

---

## 5. Implementation sequence

1. Handlebars skeleton (masthead, cascade summary, methodology toggle with accessibility-specific references, upstream context toggle, validity checklist toggle)
2. Split AI task (single `analysis_body` replacing `accessibility_readout_complete`)
3. Add OUTPUT BOUNDARIES with `##` heading instruction
4. Fix dependency placeholder text (`— None at this time`)
5. Remove internal quality checklist
6. Verify extraction: `accessibility_ticket_candidates` (18 fields, Sonnet)

**Estimated effort:** 1 session. Same scope as designer/engineering.

---

## 6. Ticket alignment assessment

**Result: No alignment needed.** The v1.1-followups note assumed accessibility might need alignment to designer's 15-field reference. After auditing:

- Accessibility has 18 fields (more than designer's 15)
- 7 compliance/AT-specific fields that neither designer nor engineering have
- Different required fields are intentional (WCAG-first, not effort-first)
- Priority enum differs intentionally (P0_legal/P0_severe for compliance urgency)
- `ticketHandler.ts` has full first-class accessibility support with dedicated `formatIssueBody` and `buildLabels` (creates wcag:X.X.X labels)

**v1.1-followups should be updated:** accessibility ticket alignment is complete as-is. Only leadership_readout remains to audit.

All 3 audience readouts that generate tickets (designer: 15, accessibility: 18, engineering: 21) are production-ready with appropriately specialized schemas. Leadership_readout emits `exec_summary_points` (not tickets) — different pattern entirely.

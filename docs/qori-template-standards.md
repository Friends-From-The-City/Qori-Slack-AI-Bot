# Qori Template Standards

This document defines the design language, formatting conventions, and traceability patterns for Qori-generated documents.

---

## Section 1 — Overview

Qori generates research documents from YAML templates. Each template defines the AI prompts, input variables, and output structure. This document specifies the visual and structural standards those outputs must follow.

---

## Section 2 — Document Types

Qori generates four categories of documents, each with different design requirements:

| Type | Examples | Design treatment |
|------|----------|------------------|
| **Findings documents** | Research readouts, session summaries, synthesis outputs | Full Pentagram treatment |
| **Planning documents** | Research plans, briefs, discussion guides | Masthead, plain headings |
| **Reference documents** | Participant trackers, recruitment logs | Masthead, table-driven |
| **Communication documents** | Outreach emails, follow-ups | Lightweight, optional masthead |

---

## Section 3 — Reserved

(Reserved for future content)

---

## Section 4 — Output Document Design Standards

These patterns define Qori's "Pentagram-style" design language: editorial restraint, consistent structure, and traceability woven into the design.

### 4.1 Masthead pattern

Single line with inline pipe separators. Bold labels, plain values.

```markdown
**Study:** [value] &nbsp; | &nbsp; **Researcher:** [value] &nbsp; | &nbsp; **Date:** [value]
```

Example:
> **Study:** va-mobile-nav-2026 &nbsp; | &nbsp; **Researcher:** Lapedra Tolson &nbsp; | &nbsp; **Date:** April 29, 2026

### 4.2 Section numbering

Editorial style (`## 01 &nbsp;&nbsp; Section Title`) used **only** on:
- Findings documents (numbered findings)
- Sequential documents with inherent chronological order (discussion guides, step-by-step procedures)

**Not** used on:
- Categorical planning documents (research plans, briefs) — section order is flexible
- Reference documents
- Communication documents

> **Clarification (April 30, 2026):** Discussion guides use editorial numbering because they're chronological (Introduction → Warm-up → Tasks → Retrospective → Closing). Research plans do NOT use numbering because their sections are categorical (Background, Objectives, Method) with flexible order.

```markdown
## 01 &nbsp;&nbsp; Finding Title Here
```

### 4.3 Methodology pattern

Bold label + em-dash + value, each as its own paragraph. Allows long descriptive values to flow naturally.

```markdown
**Framework** — value

**Approach** — longer descriptive value that can span multiple lines without awkward line breaks or table cell constraints
```

### 4.4 Quote attribution

Em-dash on next line, with participant ID and brief context.

```markdown
> "quote text"
> — PT-001, brief context
```

Example:
> "I've been using this app for two years and I just learned there's a Benefits section."
> — PT-001, discovering Benefits tab during research session

### 4.5 Per-finding metadata line

Single line below evidence, pipe-separated.

```markdown
**Severity** — Critical &nbsp;|&nbsp; **Affected** — 2 of 3 &nbsp;|&nbsp; **Confidence** — Strong (reasoning)
```

### 4.6 Per-finding sources line

Below the metadata line, lists clickable links to source documents. Use middle-dot (·) as separator between sources.

```markdown
**Sources** — [Doc 1](path) · [Doc 2](path) · [Doc 3](path)
```

> **Lesson from v5.4.1:** Source paths must come from {% raw %}`{{detected_files}}`{% endraw %} verbatim — never constructed from patterns. The LLM should copy exact filenames from the detected files list and prepend `../` for relative linking. Pattern-based path construction (e.g., `../03-fieldwork/session-summaries/PT-001-session-summary.md`) produces 404s when real filenames differ from the pattern (trailing hyphens, different casing, date suffixes). The backend (`readoutHandler.js`) populates {% raw %}`{{detected_files}}`{% endraw %} with real paths scanned from the study folder.

### 4.7 Confidence levels

Three-tier system with required parenthetical explanation:

| Level | When to use | Example |
|-------|-------------|---------|
| **Strong** | Multiple evidence types, cross-participant consistency | Strong (verbatim quote + observed behavior + cross-participant) |
| **Moderate** | Single participant but consistent with broader pattern | Moderate (single participant, consistent with session 2 pattern) |
| **Limited** | Single data point, inference required | Limited (observer interpretation, no direct quote) |

### 4.8 Emoji usage

**H1 titles:** Clean text, no emoji. The masthead below carries context (study, researcher, date), so the title doesn't need decorative markers. Example: `# Research Report`, `# Affinity Map`, `# Session Summary`.

**H2/H3 headings:** Emoji allowed only when it conveys severity, status, or category that the text alone doesn't convey. Otherwise clean text. Decorative emoji on headings is removed.

**Status emoji:** Severity indicators (🔴🟡🟢) used only when text labels don't already convey the information. The standard favors text labels (`Critical`, `High`, `Medium`) over emoji in most cases.

**Acceptable emoji uses:**
- Evidence type indicators in tables (💬 quote, 🔴 issue, 👁️ observation, 🟢 positive)
- Collapsible section markers where needed for scannability

> **Updated April 30, 2026:** H1 emoji guidance changed from "required" to "not used." Supersedes earlier guidance. All templates should use clean H1 titles.

### 4.9 Filename convention

All generated artifacts use the pattern: `{study-slug}-{template-name}-{date-iso}.md`

- **Study slug first** — enables filesystem-level grouping of all study artifacts (ls, sort, autocomplete)
- **Template name** — uses hyphens, not underscores (`research-plan`, not `research_plan`)
- **Date in ISO format** — `YYYY-MM-DD` (sortable, unambiguous)

```
va-mobile-nav-2026-research-brief-2026-05-01.md
va-mobile-nav-2026-research-plan-2026-05-01.md
va-mobile-nav-2026-discussion-guide-2026-05-02.md
va-mobile-nav-2026-research-readout-2026-06-01.md
va-mobile-nav-2026-affinity-map-2026-06-01.md
```

> **Added May 1, 2026:** Standardized across all planning templates. Previously some used `{template-name}-{study}-{date}` order.

### 4.10 Markdown table formatting

Tables must contain no blank lines between rows. Blank lines are valid only before the header and after the last row. Visual whitespace that improves source-mode readability breaks GitHub rendering. This applies to all templates.

```markdown
Wrong:
| Header | Header |
|--------|--------|
| Row 1 | Data |

| Row 2 | Data |

Correct:
| Header | Header |
|--------|--------|
| Row 1 | Data |
| Row 2 | Data |
```

> **Added April 30, 2026:** Learned from research_plan v4.6 — LLM-generated table rows had blank lines between them, breaking GitHub rendering.

### 4.11 Footer pattern

Same 2-column metadata table on every document. Five rows, followed by italic "Generated by Qori" line.

```markdown
| | |
|---|---|
| Generated | [timestamp] |
| Model | claude-sonnet-4-5-20251022 |
| Template | [template_name] v[version] |
| Study | [study_name] |
| Max tokens | 8192 |

*Generated by Qori*
```

### 4.12 Document type conventions

#### Findings documents
Research readouts, session summaries, synthesis outputs.

- Full masthead
- Numbered findings (`## 01 &nbsp;&nbsp;`) — for documents with discrete claims (Pattern A traceability)
- Per-finding source citations and confidence indicators (Pattern A) OR inline evidence tables (Pattern B)
- Methodology section
- Validity checklist appendix
- Full footer

**Canonical examples:** `research_readout.yaml` v5.4.1 (Pattern A), `affinity_mapping.yaml` v3.2 (Pattern B)

#### Planning documents
Research plans, briefs, discussion guides.

- Masthead
- Plain section headings (no numbering except for sequential steps in guides)
- No methodology section (the document IS the methodology)
- Full footer

#### Reference documents
Participant trackers, recruitment logs, templates.

- Masthead
- Table-driven layout
- Lighter footer (may omit Max tokens row)

#### Communication documents
Outreach emails, follow-up messages.

- Masthead optional
- No methodology section
- Simplified footer or none

---

## Section 5 — Reserved

(Reserved for future content)

---

## Section 6 — Traceability Patterns

Traceability is document-type-specific. Not all documents make claims that require evidence; forcing traceability on documents that don't need it creates noise without value. Apply the appropriate pattern based on what the document does.

### Pattern A: Per-finding traceability

Each numbered claim/finding includes:
- **Confidence** indicator (Strong / Moderate / Limited) with parenthetical reasoning
- **Sources** line with middle-dot-separated links to source documents (using {% raw %}`{{detected_files}}`{% endraw %} as ground truth)

Use for findings documents with discrete numbered claims:
- Research readout
- Session summary
- Stakeholder synthesis
- Service blueprint
- Persona generator
- Jobs to be Done
- Usability issues extractor
- Design opportunity generator
- Targeted readouts (per audience format)

**Canonical example:** `research_readout.yaml` v5.4.1

#### Pattern A modified: per-section confidence

Variant of Pattern A where confidence is assessed per *section* rather than per *finding*, and Sources lines are replaced by inline attribution (e.g., SH-XXX role IDs for stakeholder synthesis, PT-XXX participant IDs for personas). No separate `**Sources**` line — citations are woven into the document body.

Use when the document makes section-level claims rather than discrete per-finding claims:
- Stakeholder synthesis (SH-XXX role-only attribution, confidence measures interpretation accuracy)
- Persona generator (PT-XXX attribution, confidence measures aggregation quality)

**Canonical examples:** `stakeholder_synthesis.yaml` v4.0, `persona_generator.yaml` v4.3

### Pattern B: Inline citation

Evidence is structured into the document body itself — typically in tables that cite participant ID and timestamp inline. No separate Sources or Confidence lines needed because the evidence structure IS the citation.

Use for documents where evidence-as-structure is the convention:
- Affinity map (evidence table per theme with type indicators: 💬 quote, 🔴 pain point, 👁️ observation)
- Journey map (evidence inline at each stage)

**Canonical example:** `affinity_mapping.yaml` v3.2

### Pattern C: Document-level only

Footer metadata table (Generated / Model / Template / Study / Max tokens) and italic "Generated by Qori" line at end. No per-section traceability. This is the baseline pattern that ALL documents inherit automatically via the backend `buildTraceabilityFooter()` function in `yamlProcessor.js`.

Use as the only traceability for:
- Planning docs (research plan, brief, discussion guide, stakeholder interview guide)
- Reference docs (participant tracker, session notes)
- Communication docs (participant outreach)

### Decision rule

Ask: does this document make claims that should be backed by evidence?

- Yes, in numbered/listed form → **Pattern A**
- Yes, but evidence is the structure (tables with inline citations) → **Pattern B**
- No, the document IS planning, configuration, or communication → **Pattern C only**

### Exception: documents that span types

Some templates produce different content based on context (e.g., targeted_readouts produces 8 different audience formats). Apply traceability per format, not per template — an executive summary format might use Pattern A while a high-level briefing format uses Pattern B.

### 6.1 Source path ground truth

Source paths must come from {% raw %}`{{detected_files}}`{% endraw %} verbatim — never constructed from patterns. The LLM copies exact filenames from the detected files list and prepends `../` for relative linking from the output folder.

Pattern-based path construction (e.g., `../03-fieldwork/session-summaries/PT-001-session-summary.md`) produces 404s when real filenames differ from the expected pattern (trailing hyphens, different casing, date suffixes).

**Where {% raw %}`{{detected_files}}`{% endraw %} is populated:**
- `readoutHandler.js` — for research readout and targeted readouts (scans study folders including analysis-layer)
- `researchSynthesisHandler.js` — for all 7 synthesis templates (built from `filesWithContent` entries)
- If a future template needs {% raw %}`{{detected_files}}`{% endraw %} and doesn't have it wired, that's a backend change in the relevant handler.

The backend deduplicates when multiple date-stamped versions of the same file exist — only the latest version appears in the list.

### 6.2 Related Artifacts

The Related Artifacts table (in appendix `<details>` blocks) must be populated with actual paths from {% raw %}`{{detected_files}}`{% endraw %}, organized by category:

- **Planning:** research plan, research brief, discussion guide
- **Fieldwork:** session summaries (one row per file), coded transcripts
- **Analysis:** affinity map, journey map, personas, usability issues, JTBD, design opportunities, service blueprint
- **Reference:** participant tracker

If a category has no files, omit those rows. Do not invent files.

### 6.3 Future enhancements

**Intermediate reasoning capture** — Currently not implemented. Future enhancement would capture the chain of reasoning from raw data → coded observations → themes → findings, stored as metadata alongside documents.

This would enable:
- Auditing the analytical process
- Validating that findings flow from evidence
- Meeting full 552.239-7001 requirements for AI-assisted analysis

---

## Section 7 — Inputs and Rationale

Every template must have a clear answer to: "What inputs produce the best output for this document type?"

Each translation plan and design reference must include an "Inputs and rationale" section with:

- **Required inputs** — Files that MUST exist for the template to produce useful output
- **Recommended inputs** — Files that improve output quality when present
- **Excluded inputs** — Files NOT fed in, with rationale (e.g., "discussion guide content is already reflected in the session transcript")

### Why this matters

1. Researchers know what to prepare before running the command
2. Future template work has clear rationale for input changes
3. Onboarding documentation can reference these as "prep checklists" per document type
4. Helps surface stale inputs when research processes evolve (e.g., we removed coded transcripts from the flow — every template referencing them needed updating)

### Documentation locations

- In each template's design reference (in the header note)
- In each template's translation plan ("Inputs and rationale" section)
- In CLAUDE.md as a process pattern

---

## Section 8 — Cascade-Aware Templates

Templates that participate in the cascade contract (consuming upstream variables and/or emitting downstream variables) follow additional patterns beyond the base design language.

### 8.1 Consume pattern

When a template consumes upstream variables, it:

1. Declares `consumes:` in the YAML with source, required, and inject_as fields
2. Accesses upstream values via {% raw %}`{{upstream_*}}`{% endraw %} Handlebars variables in the generate prompt
3. Conditionally renders cascade-dependent sections using {% raw %}`{% if upstream_* %}`{% endraw %} guards
4. Suppresses cascade sections entirely when upstream variables are absent (graceful degradation)

### 8.2 Emit pattern

When a template emits downstream variables, it:

1. Declares `emits:` in the YAML with pool, pool_strategy, schema ref, and extract_from hints
2. References shared schemas in `config/schemas/` — deepened to capture verbatim quotes, behavioral context, and confidence levels
3. Uses `extract_from` hints to tell the extraction LLM where in the output document to look

### 8.3 Citation markers

Templates that consume upstream variables use inline citation markers to trace observations back to upstream inputs:

- `[TB1]`, `[TB2]`, etc. — target barriers from research brief
- `[RQ1]`, `[RQ2]`, etc. — research questions from research brief
- `[D1]`, `[S1]`, `[V1]`, etc. — discovery artifacts (desk research, stakeholder, survey)

An **Upstream context** appendix section maps markers to their sources. This section is conditionally rendered only when upstream variables exist.

### 8.4 Barrier validation section

Templates that validate upstream barriers (e.g., session_summary) include a **Barrier validation** section with a table of target barriers, validation status (confirmed/refuted/not addressed), and supporting evidence. This section is conditionally rendered only when `target_barriers` upstream variable exists.

### 8.5 Canonical examples

| Template | Pattern | Notes |
|----------|---------|-------|
| research_brief v6.0 | Consume-heavy | Consumes discovery artifacts, emits brief variables. Manual loading via handler (not YAML consumes) for researcher cherry-picking. |
| session_summary v2.0 | Balanced consume + emit | Consumes brief variables (barriers, questions, methodology), emits atomic_nuggets, participant_metadata, task_completion_records, barrier_validations. First template with both deep consume and deep emit. |
| affinity_mapping v4.0 | Mid-cascade synthesis | Consumes entire upstream pool (atomic_nugget_core + detail from session_summary), emits synthesized non-pool variables (validated_themes, unexpected_patterns). Demonstrates pool consumption pattern, cross-participant clustering with traceability back to source nuggets via nugget IDs. Server-side blocks submission when zero nuggets exist. |
| persona_generator v5.0 | Terminal multi-source synthesis | Consumes nuggets + themes + metadata + brief context (6 upstream variables). Demonstrates lateral cascade (consumes from same-cycle peer affinity_mapping), privacy-preserving generation (PT-XXX only, archetypal naming), multi-hop traceability (persona → nugget → quote AND persona → theme → nuggets). |
| journey_mapping v4.0 | Stage-based cascade synthesis | Consumes nuggets + themes + personas + barriers (6 sources). Journey stages reference nugget IDs for evidence, link to personas and validated themes. |
| research_readout v6.0 | Terminal cascade with commitment auditability | Consumes 16 upstream variables (most of any template). "Brief commitments addressed" section maps findings to research objectives and questions. Findings trace through themes to nuggets to quotes. |
| research_plan v6.0 | Operationalization cascade with constraints | Single-task architecture. Consumes 12 brief variables with commitment/constraint semantics. Plan must operate within brief's timeline, budget, scope constraints. Deliverables map to research objectives. |
| discussion_guide v7.0 | Execution cascade with coverage tracking | Consumes brief commitments. Each task addresses specific RQ-XXX/TB-XXX. Coverage check section verifies all research questions have task coverage. |
| stakeholder_synthesis v5.0 | Discovery-layer cascade | Optionally consumes prior desk research. Emits 6 variable types that feed INTO the research brief. Earliest cascade participant. |

### 8.6 Modal cascade context

When a template consumes upstream variables, the modal should display a **Cascade Context** section showing what upstream inputs are available (counts, methodology). This section is suppressed when no upstream variables exist. The modal works without cascade — researcher enters all inputs from scratch.

### 8.7 Canonical section placement

All cascade-aware templates follow this section order (top to bottom):

1. **Title / masthead** — H1, study/researcher/date line
2. **Summary** — narrative synthesis of the document
3. **Cascade summary** — source data counts table (conditional on upstream)
4. **Main content sections** — template-specific (findings, stages, personas, etc.)
5. **Methodology** — framework, approach, limitations
6. **References** — academic citations
7. **Upstream context** — cascade marker conventions appendix (conditional)
8. **Appendix** — related artifacts, validity checklist
9. **Document Information** — generated by Qori footer (added by backend)

Cascade summary goes AFTER Summary, not before. This ensures the researcher reads the narrative first, then sees what data informed it. The Upstream context appendix goes near the bottom — it's reference material for traceability auditors, not primary reading.

---

## Revision History

| Date | Change |
|------|--------|
| May 6, 2026 | Batch cascade retrofit: journey_mapping v4.0, research_readout v6.0, research_plan v5.0, discussion_guide v7.0, stakeholder_synthesis v5.0. All 8 cascade-aware templates now complete. Added persona_generator v5.0, stable IDs (TB-XXX, RQ-XXX), extraction array fix. 10 new/updated schemas. |
| May 5, 2026 | Added affinity_mapping v4.0 as canonical mid-cascade synthesis example (§8.5). Pool consumption pattern, cross-participant clustering with nugget ID traceability, server-side submission blocking. |
| May 4, 2026 | Added Section 8 — Cascade-Aware Templates. Defines consume/emit patterns, citation markers, barrier validation section, modal cascade context. Canonical examples: research_brief v6.0 (consume-heavy), session_summary v2.0 (balanced consume + emit). |
| May 1, 2026 | Added §4.9 Filename convention. Renumbered §4.10-4.12. Added Pattern A modified sub-section under §6 with stakeholder_synthesis v4.0 and persona_generator v4.3 as canonical examples. |
| April 30, 2026 | Added Section 4.9 (markdown table formatting rule). Added Section 7 (Inputs and Rationale). Traceability patterns A/B/C defined. H1 emoji removed. Canonical examples: research_readout v5.4.1, affinity_mapping v3.2. research_plan v4.6 as Pattern C reference. |
| April 29, 2026 | Initial version. Locked design language for Pentagram-style documents. |

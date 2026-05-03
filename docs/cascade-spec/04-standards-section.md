# Standards Doc — Cascade-Aware Brief Pattern

This section adds to Qori's design standards documentation. It defines the pattern for cascade-aware document generation, using the brief as the reference. Applies to all downstream templates that consume upstream variables.

---

## Section 8 — Cascade-Aware Document Generation

### 8.1 The pattern

When a Qori template can consume upstream variables (anything declared in its `consumes:` block), the modal and output must follow this pattern:

1. **Modal queries upstream sources on open** — Auto-detects what's available
2. **Modal pre-populates fields from cascade** — Researcher reviews, doesn't fill from scratch
3. **Modal makes cascade visible** — Sparkle markers (✨) on pre-populated fields show provenance
4. **Output weaves upstream into prose** — Citation markers trace claims to sources
5. **Output appends source map** — Bottom appendix maps citation markers to discovery artifacts

This pattern applies to every downstream template, not just the brief.

---

### 8.2 Modal pre-population rules

For every field that COULD be informed by cascade, the modal must:

**A. Pre-populate with cascade-suggested value when discovery exists**

The default value comes from synthesizing relevant upstream variables. The researcher sees the suggestion before editing.

**B. Mark pre-populated fields with sparkle indicator (✨)**

Below the field, show a single line explaining the source:
- ✨ Recommended by 3 discovery sources
- ✨ Pulled from stakeholder questions for users
- ✨ Composition reflects discovery: AT users excluded from past studies

**C. Allow full override**

Pre-populated values are editable text. Researcher can rewrite, replace, or clear. Cascade is a suggestion, not a constraint.

**D. Degrade gracefully when no upstream exists**

If the consumed variable is missing, the field is empty (no pre-population). The sparkle marker is suppressed. The field becomes a normal "researcher input" field.

**E. Never invent pre-population**

If discovery doesn't actually contain a methodology recommendation, the Method field stays empty. Don't fabricate cascade. Better to show "no recommendation from discovery" than to suggest something Sonnet made up.

---

### 8.3 Field categorization

Every modal field falls into one of three categories:

**Category 1 — Cascade-driven (pre-populated when upstream exists)**

Fields where discovery directly suggests a value:
- Method (from `methodology_recommendations`)
- Participants (from `stakeholder_recruitment_recommendations`, `accessibility_evidence`)
- Research questions (from `stakeholder_questions_for_users`)
- Out of scope (from `established_findings`)
- Risks (from `stakeholder_constraints`)

**Category 2 — Researcher-only (always blank)**

Fields where only the researcher can provide value:
- Study name (researcher chooses)
- Requested by (researcher knows the stakeholder)
- Decision deadline (researcher knows the constraint)
- Budget (researcher knows the resource envelope)
- Timeline preference (researcher chooses speed)

**Category 3 — Cascade-enriched (researcher writes, cascade enriches during Generate)**

Fields where researcher provides framing, but cascade adds depth in the generated output:
- Problem statement (researcher writes their framing; Generate phase weaves in discovery metrics)

The modal labels Category 2 and Category 3 with helper text indicating they're researcher-input.

---

### 8.4 Output citation pattern

When the generated document consumes cascade variables, every claim sourced from upstream must carry a citation marker.

**Marker convention:**
- `[D1], [D2]...` — Desk research findings
- `[S1], [S2]...` — Stakeholder synthesis findings
- `[V1], [V2]...` — Survey ("Voice of customer") findings
- Markers are numbered in order of first appearance in the document

**Inline format:**
> "...with **45% task abandonment** and 4.2/10 satisfaction <sup>[D1]</sup>."

**Source map (mandatory bottom appendix):**

```markdown
## Discovery sources

This brief synthesized findings from N discovery sources. Citation markers throughout the document trace each claim to its source.

| Marker | Source | Type | Date | Findings used |
|--------|--------|------|------|---------------|
| **D**1–D5 | {discovery_artifact_slug} | Desk research | {date} | {brief_description} |
| **S**1–S7 | {discovery_artifact_slug} | Stakeholder synthesis | {date} | {brief_description} |
| **V**1–V6 | {discovery_artifact_slug} | Survey synthesis | {date} | {brief_description} |

Full discovery artifacts: see `_discovery/{topic}/` in study repository.
```

The source map appears just before the standard Document Information footer.

---

### 8.5 Generate phase prompt requirements

When `consumes:` block is non-empty AND upstream variables are present, the Generate prompt MUST include:

```
CASCADE-AWARE GENERATION

You are generating a document with access to upstream discovery variables. Your job is to SYNTHESIZE these into the document, not LIST them.

Specifically:
- Every claim sourced from upstream must carry a citation marker [D1], [S2], [V3] etc.
- Use ONLY metrics from upstream variables. Do not invent statistics.
- Reference verbatim quotes when they sharpen the prose.
- Where multiple sources support a claim, cite all (e.g., [D2, V4]).
- Where researcher input contradicts upstream, defer to upstream and flag the discrepancy.

The bottom Discovery sources appendix maps your citation markers to the source artifacts. Number markers in order of first appearance.

If a section has no upstream support, write from researcher input alone without fabricating citations or markers.
```

---

### 8.6 Anti-patterns (what NOT to do)

The following patterns violate cascade design. Templates exhibiting these are non-compliant:

**❌ Variable dump section**
A section that lists raw extracted variables (e.g., "Discovered Barriers: • barrier 1 • barrier 2 • barrier 3..."). Variables should INFORM prose, not BE prose.

**❌ Generic claims with no attribution**
"45% of users abandoned tasks" with no source marker. If the number came from cascade, mark it. If it didn't, don't include it (or get researcher to provide it).

**❌ Cascade siloed in one section**
All cascade content in "Informed by Discovery" while the rest of the document reads as if cascade didn't exist. Cascade should be woven through.

**❌ Modal asks for what cascade can provide**
Asking researcher to pick methodology from a dropdown when discovery already recommended one. Pre-populate. Researcher can override.

**❌ Pre-populated without provenance marker**
Field comes filled in but no ✨ marker explaining where it came from. Researcher can't distinguish cascade-pre-population from default template values.

**❌ Required required when not necessary**
Forcing discovery selection when the document can work without it. Discovery is optional enrichment, not blocking gate.

---

### 8.7 Example — Brief reference (the locked target)

The brief at `01-target-brief-output.md` and modal at `02-target-brief-modal.md` are the reference implementation of this pattern. Other cascade-consuming templates should replicate the same approach:

- Research plan (consumes from brief)
- Discussion guide (consumes from brief)
- Affinity mapping (consumes from session summaries)
- Persona generator (consumes from session summaries + affinity)
- Service blueprint (consumes from journey + stakeholder)
- Research readout (consumes from all upstream)
- Targeted readouts (consumes from readout)

Each will have its own modal/output specification, but all follow Section 8's pattern.

---

### 8.8 Filename convention (unchanged)

Cascade-aware documents follow the existing filename convention:
- Study-scoped: `{study-slug}-{template-name}-{date-iso}.md`
- Discovery-scoped: `{topic-slug}-{type}-{date-iso}.md`

---

### 8.9 Versioning

When a template adopts the cascade-aware pattern, increment its major version (e.g., research_brief v5.0.1 → v6.0). The version bump signals to researchers that the modal and output behavior has changed substantially.

---

## Cross-references to other standards sections

- Section 6 (Traceability Patterns A/B/C) — orthogonal to cascade; cascade applies WITHIN whichever traceability pattern the template uses
- Section 7 (Inputs and Rationale) — cascade-aware templates' Inputs and Rationale section should explicitly note required vs. optional vs. recommended upstream variables
- Section 8 (this section) — defines cascade-aware behavior at modal and output levels

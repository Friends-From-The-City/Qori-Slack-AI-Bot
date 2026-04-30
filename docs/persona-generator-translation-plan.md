# Persona Generator Translation Plan

**Date:** 2026-04-30
**Status:** Plan for review — no changes made yet
**Source:** `docs/design-references/persona_generator_reference.md` (locked design)
**Target:** `config/prompts/persona_generator.yaml` (current v4.2 → proposed v4.3)
**Traceability:** Pattern A modified — Confidence per persona, Sources consolidated in Methodology

---

## Flagged decisions (answers first)

### Decision 1: H1 title format

**Recommendation: Option A — `# Personas: {{selected_study}}`**

The locked design uses `# Personas: va-mobile-nav-2026`. This is consistent with session summary (`# Session Summary: PT-001`) where the subject is in the title. For personas, the study name IS the subject — personas are study-specific, not universal. The masthead below carries Researcher and Date, so there's no redundancy.

### Decision 2: Numbering scope

**Recommendation: Yes, number personas (`## 01 &nbsp;&nbsp; The Assisted Navigator`).**

The locked design uses this format. While personas aren't "ordered findings" like research readout items, numbering serves two purposes: (1) the Summary at-a-glance table references personas by number, and (2) the Design Priorities table says "Helps Persona 01" — numbering creates a clear cross-reference system. Without numbers, you'd need to write out "The Assisted Navigator" everywhere.

### Decision 3: Affinity map prompt instruction

**Proposed wording for new prompt instruction:**

```
AFFINITY MAP INTEGRATION (when available):
If the input data includes an affinity map, use its themes to validate
your persona groupings. Participants who cluster under the same affinity
themes should tend to appear in the same persona. If your persona
groupings contradict the affinity map themes, explain why in the
"Why these groupings" methodology section.
```

Place this after RULE 5 (FEWER PERSONAS THAN PARTICIPANTS) and before the INPUT DATA section.

### Decision 4: Confidence calibration

**Recommendation: Keep qualitative, reference participant count contextually.**

The locked design uses `**Confidence** — Strong (2 of 3 participants exhibit pattern with multiple evidence points across different accessibility profiles)`. This naturally references the count ("2 of 3") without prescribing a formula. The parenthetical reasoning explains WHY it's Strong, including the participant ratio.

Prescribing a formula ("Strong = >50% of participants") would be too rigid — a single-participant pattern backed by 5 verbatim quotes and observed task failure could still be Strong confidence. Keep it qualitative with the expectation that the LLM includes participant counts in the reasoning.

---

## Inputs and rationale

### Required inputs
- **Session summaries** (multiple participants) — Primary source for behavioral patterns; the synthesis layer that personas aggregate

### Recommended inputs
- **Affinity map** — Themes already identified across participants help validate archetype groupings (now selectable in the synthesis modal)
- **Research plan** — Provides study context (which user segment, what tasks)
- **Observer notes** — Captures behaviors participants don't articulate

### Excluded inputs
- **Coded transcripts** — No longer in the flow (raw transcripts feed session summaries; personas build on summaries)
- **Participant tracker** — Demographics alone don't drive personas (behaviors do)
- **Discussion guide** — Informs research design, not synthesis

---

## Section-by-section diff

### 1. Title + Masthead

| Current v4.2 | Locked design | Change |
|-------------|---------------|--------|
| `# 👤 Personas: [Study Name]` with blockquote | `# Personas: va-mobile-nav-2026` with masthead | Prompt change |

**New:**
```
# Personas: {{selected_study}}

**Study:** {{selected_study}} &nbsp; | &nbsp; **Researcher:** {{researcher_contact}} &nbsp; | &nbsp; **Date:** {{current_date}}
```

Remove 👤 emoji. Add masthead.

**Risk:** Low.

---

### 2. Summary (ENHANCED)

| Current v4.2 | Locked design | Change |
|-------------|---------------|--------|
| Blockquote with counts only | `## Summary` with narrative + `> [!IMPORTANT]` "Most actionable insight" callout + at-a-glance table | Major enhancement |

**New:**
```
## Summary

[2-3 sentence narrative: how many personas, what patterns they represent, what they share]

> [!IMPORTANT]
> **Most actionable insight:** [Cross-cutting observation about persona overlap or design leverage]

| Persona | Archetype | Based on | Key need |
|---------|-----------|----------|----------|
| 01 | [Name] | PT-001, PT-003 | [Need] |
| 02 | [Name] | PT-002, PT-003 | [Need] |
```

The "Most actionable insight" callout is unique to personas — it highlights the cross-cutting pattern when participants contribute to multiple personas.

**Risk:** Medium — narrative synthesis + judgment about "most actionable" insight.

---

### 3. Per-persona structure (MAIN CHANGE)

| Current v4.2 | Locked design | Change |
|-------------|---------------|--------|
| `## Persona 1: [Name]` with table for "Who they are" | `## 01 &nbsp;&nbsp; [Name]` with bold-em-dash for attributes, Confidence at bottom | Prompt rewrite |

**Current:**
```
## Persona 1: [Archetype Name]
**Based on:** PT-001, PT-003
> "[quote]" — PT-001, 00:00:00
**Who they are:**
| Attribute | Details |
...
**Design implication:** [fix]
```

**New (from locked design):**
```
## 01 &nbsp;&nbsp; [Archetype Name]

**Based on** — PT-001, PT-003

> "[quote]"
> — PT-001, 00:07:08

### Who they are

**Background** — [details]
**Tech setup** — [details]
**VA usage** — [details]
**Calling pattern** — [details if relevant]

### What they're trying to do

- [Goal] — *PT-001, PT-003*

### What blocks them

| Frustration | Evidence |
|-------------|----------|
| [Issue] | PT-001, 00:04:28 · PT-003, 00:04:08 |

### How they cope

[Narrative paragraph]

### Design implication

[Specific, implementable recommendation]

**Confidence** — Strong ([reasoning with participant count])
```

**Key changes:**
- Numbered headings (`## 01 &nbsp;&nbsp;`)
- "Who they are" as H3 with bold-em-dash attributes (not table)
- Added "Calling pattern" attribute (from session summary pattern)
- "How they cope" as narrative paragraph with H3 heading
- Confidence indicator at bottom of each persona
- Middle-dot (·) separating multiple evidence citations in frustration table
- No `**Based on:**` with colon — uses `**Based on** —` (em-dash)

**Risk:** Medium — structural change but follows proven patterns from other translations.

---

### 4. Design Priorities

| Current v4.2 | Locked design | Change |
|-------------|---------------|--------|
| Table with 🔵⚪ effort dots | Table with text effort labels, "Helps" column | Minor change |

Effort dots → text labels (High/Medium/Low). "Helps Persona" → "Helps". References personas by archetype name.

**Risk:** Low.

---

### 5. Methodology

| Current v4.2 | Locked design | Change |
|-------------|---------------|--------|
| Bold-label with colon format, 3 references | Bold-em-dash format, added "Why these groupings" narrative, Limitations, Pruitt & Adlin reference | Enhancement |

**New (from locked design):**
```
## Methodology

**Framework** — Evidence-based persona development

**Approach** — [methodology description including aggregation principle]

**Why these groupings** — [Narrative explaining the behavioral patterns that drove persona definitions]

**Sources analyzed** — [Session summaries + affinity map if used]

**Limitations** — [Sample size, representation caveats]

### References

- Cooper, A. — *The Inmates Are Running the Asylum* (1998)
- Goodwin, K. — *Designing for the Digital Age* (2009)
- Nielsen Norman Group — Persona best practices
- Pruitt, J. & Adlin, T. — *The Persona Lifecycle* (2006)
```

**Risk:** Low.

---

### 6. Appendix (NEW)

| Current v4.2 | Locked design | Change |
|-------------|---------------|--------|
| No appendix | Related Artifacts + Validity Checklist in `<details>` | Add |

Validity checklist has 7 rows including "Confidence levels declared per persona" and "Personas aggregate multiple participants (no 1:1 mapping)".

Related Artifacts uses `{{detected_files}}` ground truth.

**Risk:** Low — additive.

---

### 7. Footer

| Current v4.2 | Locked design | Change |
|-------------|---------------|--------|
| `*Generated by Qori • {{current_date}}*` in prompt | Backend footer | Remove from prompt |

---

### 8. Filename

| Current v4.2 | Proposed v4.3 |
|-------------|---------------|
| `{{selected_study}}_personas_{{current_date}}.md` | `{{selected_study}}-personas-{{current_date_iso}}.md` |

---

## What carries over from research_readout v5.4.1

| Pattern | Applies? | Notes |
|---------|----------|-------|
| Masthead (inline pipes) | Yes | Study/Researcher/Date |
| Summary with narrative + callout | Yes | `> [!IMPORTANT]` for "Most actionable insight" |
| Editorial numbering | Yes | `## 01 &nbsp;&nbsp; The Assisted Navigator` |
| Confidence per section | Yes — per persona | Strong/Moderate/Limited with reasoning |
| Sources per finding | **No** — consolidated in Methodology | Inline citations already in goals/frustrations |
| Backend footer | Yes | Remove in-prompt footer |
| Clean H1 | Yes | `# Personas: {{selected_study}}` (no emoji) |
| Bold-em-dash methodology | Yes | Standard 4.3 |
| Appendix with artifacts + validity | Yes | New addition |
| `{{detected_files}}` for artifacts | Yes | Already wired in synthesis handler |

## What's preserved from current v4.2

- CRITICAL RULES block (all 5 rules)
- Aggregation rule (NO 1:1 mapping)
- Archetype naming convention (NO real names)
- VA government context rule
- Fewer personas than participants rule
- Frustration table with evidence citations
- Goals list with participant citations

## What's removed

| Removed | Reason |
|---------|--------|
| 👤 emoji from H1 | Clean text per standard |
| "Who they are" as GFM table | Bold-em-dash paragraphs per standard 4.3 |
| 🔵⚪ effort dots | Text effort labels |
| Date in summary blockquote | Masthead + footer carry dates |
| `*Generated by Qori*` footer in prompt | Backend handles |
| `STOP HERE` validation block | Replaced by quality checks block |

## What's added

| Added | Reason |
|-------|--------|
| Summary section with narrative + callout | Design language standard |
| Confidence indicator per persona | Pattern A modified traceability |
| "Most actionable insight" callout | Highlights cross-persona leverage |
| Affinity map integration instruction | Modal now supports analysis-layer inputs |
| "Why these groupings" methodology narrative | Locked design requirement |
| Limitations subsection | Standard for findings docs |
| Pruitt & Adlin reference | Foundational persona literature |
| Appendix (Related Artifacts + Validity Checklist) | Traceability standard |
| "Calling pattern" attribute | Behavioral context from session summary pattern |

---

## Backend changes needed

**None.** The synthesis handler already passes `researcher_contact`, `detected_files`, and `combined_file_content`. The affinity map is now selectable via the Prior Analysis section in the modal.

---

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Numbered persona headings | Low | Already proven in research readout |
| "Most actionable insight" callout | Medium | Provide instruction: "Identify the cross-cutting pattern — where participants contribute to multiple personas" |
| Confidence per persona | Medium | Provide examples in prompt (one Strong, one Moderate) |
| Affinity map integration instruction | Low | Clear conditional: "If input includes affinity map..." |
| Bold-em-dash format for "Who they are" | Low | Consistent with methodology format |
| Aggregation rule preservation | Low | Rule 4 is already strong and explicit |

---

## Testing plan

1. Push changes
2. Generate personas via `/qori-synthesis` → Persona Generation → check affinity map + session summaries
3. Verify:
   - H1: `# Personas: va-mobile-nav-2026` (no emoji)
   - Masthead with Study/Researcher/Date
   - Summary with narrative + `> [!IMPORTANT]` callout + at-a-glance table
   - Personas: `## 01 &nbsp;&nbsp;` numbering, bold-em-dash attributes
   - Confidence at bottom of each persona
   - Frustration table with middle-dot evidence citations
   - Design Priorities with text effort labels
   - Methodology with "Why these groupings" and Limitations
   - Appendix with Related Artifacts (from `{{detected_files}}`) + Validity Checklist
   - No duplicate footer
   - Filename: `va-mobile-nav-2026-personas-2026-04-30.md`
4. Verify affinity map themes referenced in persona grouping rationale
5. Regression: run affinity mapping to verify other synthesis still works

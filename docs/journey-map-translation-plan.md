# Journey Map Translation Plan

**Date:** 2026-04-30
**Status:** Plan for review — no changes made yet
**Source:** `docs/design-references/journey-map-reference.md` (locked design)
**Reference:** `config/prompts/research_readout.yaml` v5.4.1 (Pattern A reference)
**Target:** `config/prompts/journey_mapping.yaml` (current v3.11 → proposed v3.12)
**Traceability:** Pattern B (inline citation) — evidence is structured into the document body

---

## Inputs and rationale

### Required inputs
- **Session summaries** (multiple) — Primary source. Already structured per-participant with pain points, successes, insights extracted. The synthesis layer that journey mapping builds on.

### Recommended inputs
- **Observer notes** — Captures behavioral observations across stages that participants don't articulate (when they pause, hesitate, look confused).
- **Affinity map** — Themes that span participants help identify patterns ACROSS journey stages, not just within them.
- **Research plan** — Provides study context (which app, which user type, what tasks) that defines journey scope.

### Excluded inputs
- **Coded transcripts** — No longer in the research flow. Raw transcripts feed session summaries; journey maps build on summaries.
- **Discussion guide** — Useful for journey stage definition during planning, but session summaries already reflect what was actually asked. Available as reference link only.
- **Participant tracker** — Demographics/scheduling, not journey content.

---

## Section-by-section diff

### 1. Title + Masthead

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| `# 🧭 Journey Map: [INSERT ACTUAL STUDY NAME FROM INPUT]` with blockquote metrics | `# Journey Map: VA Mobile App Navigation` with masthead line | Prompt change |

**Current:**
```
# 🧭 Journey Map: [INSERT ACTUAL STUDY NAME]

> **[X] stages** | **[Y] pain points** | **[Z] participants**
```

**New (from locked design):**
```
# Journey Map: [Study Title — descriptive, not just study slug]

**Study:** {{selected_study}} &nbsp; | &nbsp; **Researcher:** {{researcher_contact}} &nbsp; | &nbsp; **Date:** {{current_date}}

---
```

Note: locked design H1 includes a descriptive title (`VA Mobile App Navigation`) not just the study slug. The LLM should infer a descriptive title from the data.

**Risk:** Low.

---

### 2. Summary (NEW section)

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| No summary — goes straight to Overview table | `## Summary` with narrative paragraph + `> [!IMPORTANT]` callout + stage overview table | Add new section |

**New:**
```
## Summary

[2-3 sentence narrative synthesis of the journey — what stages matter, where failures concentrate, what pattern emerges]

> [!IMPORTANT]
> **Most critical journey moment:** [Stage X — what happens and why it matters]

| Stage | Critical issues | Participants affected |
|-------|-----------------|----------------------|
| 01 — [Name] | [count] | [X of Y] |
```

**Risk:** Medium — LLM must synthesize a narrative. Provide clear instruction.

---

### 3. Overview table → REMOVED (merged into Summary)

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| `## Overview` with Priority/Pain Point/Opportunity table using 🔴🟡 emoji | Stage overview table in Summary section | Remove separate section |

The locked design puts the stage overview table inside Summary. The current "Overview" with per-pain-point priority emoji is replaced by per-stage overview.

---

### 4. Journey Stages (MAIN SECTION)

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| `## Journey Stages` wrapper with `### 1️⃣ [Label]` sub-headings, inline emoji labels (📱🔴✅💡👥), emotion table | `## 01 &nbsp;&nbsp; [Stage Title]` at H2 level, cleaner structure, text labels | Major prompt rewrite |

**Current per-stage format:**
```
### 1️⃣ [Clear 2-4 word label]

**What happens:** [description]

**📱 Touchpoints:** [list]

| Emotion | Quote |
|:-------:|-------|
| [emoji + word] | "[quote]" — PT-001, 00:00:00 |

**🔴 Pain Points:**
- [issue] — PT-001, 00:00:00

**✅ Success looks like:** [outcome]

**💡 Opportunity:** [fix]

**👥 Owner:** `[Team]` — [why]
```

**New per-stage format (from locked design):**
```
## 01 &nbsp;&nbsp; [Stage Title — Descriptive]

[1-2 sentence description of what happens at this stage]

**Touchpoints** — [What user interacts with]

**User emotion** — [Single word — Confused, Frustrated, Confident, etc.]

> "[quote]"
> — PT-001, [timestamp]

#### What goes wrong

- [Issue] — PT-001, [timestamp]
- [Issue] — PT-002, [timestamp]

#### Success looks like

[Specific measurable outcome]

#### Design opportunity

[Specific implementable fix]

**Suggested owner** — [Team]

---
```

**Key changes:**
- `## Journey Stages` wrapper heading removed — stages are H2 sections directly
- Number emoji (1️⃣) → editorial numbering (`## 01 &nbsp;&nbsp;`)
- Inline emoji labels (📱🔴✅💡👥) → text labels with bold-em-dash format
- Emotion table → single bold-em-dash line
- Pain points → H4 "What goes wrong" sub-section
- Success/Opportunity as H4 sub-sections, not bold-inline labels
- Owner as bold-em-dash line, not backtick-wrapped
- `<br>` tags removed

**Risk:** High — this is the core structural change. The stage format is completely different. Provide a complete example stage in the prompt.

---

### 5. Recommendations → "Recommended actions"

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| `## Recommendations` with emoji priority legend + emoji effort indicators | `## Recommended actions` with text labels, no legend | Prompt change |

**Current:** `🔴 | [fix] | [stage] | [team] | 🔵🔵🔵`

**New:** `1 | [fix] | [stage] | [team] | High`

Numeric priority, text effort labels. No emoji legend above table.

**Risk:** Low.

---

### 6. Discussion Questions → "Discussion questions"

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| Table format with #/Question/For columns | Numbered list with italic team attribution | Format change |

**New (from locked design):**
```
## Discussion questions

These questions emerged from the journey analysis and warrant team alignment before implementation.

1. [Question] — *[Team]*

2. [Question] — *[Team]*
```

**Risk:** Low.

---

### 7. Methodology

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| Bold-label format (already matches standard 4.3), nested in `<details>` unwrapped in Phase 2 | Bold-em-dash format, visible, with references | Minimal change |

The locked design methodology is nearly identical to what's deployed. Minor wording updates: "Framework" → no colon/bold change needed. Add "Limitations" line.

**Risk:** Low.

---

### 8. Appendix (NEW — not in current template)

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| No appendix | `## Appendix` with Related Artifacts + Validity Checklist in `<details>` | Add new section |

**New (from locked design):**
- Related Artifacts: session summaries (per participant), observer notes, affinity map, research plan — using real paths from `{{detected_files}}`
- Validity Checklist: 5 rows verifying quotes, stage consistency, citation diversity, specificity, team ownership

**Risk:** Low — additive.

---

### 9. Footer

| Current v3.11 | Locked design | Change |
|--------------|---------------|--------|
| `*Generated by Qori • {{current_date}}*` in prompt | Backend footer (Document Information table) | Remove from prompt |

**Risk:** Low.

---

### 10. Filename

| Current v3.11 | Proposed v3.12 |
|--------------|----------------|
| `{{selected_study}}-journey-mapping-{{current_date_iso}}.md` | `{{selected_study}}-journey-map-{{current_date_iso}}.md` |

Minor: "journey-mapping" → "journey-map" (shorter, matches template label).

---

## What carries over from research_readout v5.4.1

| Pattern | Applies? | Notes |
|---------|----------|-------|
| Masthead (inline pipes) | Yes | Study/Researcher/Date |
| Summary with narrative + callout | Yes | `> [!IMPORTANT]` for "Most critical journey moment" |
| Editorial numbering | Yes — H2 for stages | `## 01 &nbsp;&nbsp;` |
| Confidence per finding | **No** | Pattern B — inline citations per stage |
| Sources per finding | **No** | Pattern B — participant IDs inline |
| Backend footer | Yes | Remove in-prompt footer |
| Clean H1 | Yes | `# Journey Map: [Title]` |
| Bold-em-dash methodology | Yes | Standard 4.3 |
| Appendix with artifacts + validity | Yes | New addition |
| PII protection rule | **Need to add** | No real participant names |

## What's preserved from current v3.11

- CRITICAL RULES block (all 8 rules including NO REAL NAMES, CITATION DIVERSITY)
- Two-task structure (`file_discovery_summary` + `journey_map_complete`)
- Source data references (`{{combined_file_content}}`, `{{selected_study}}`, `{{focus_area}}`)
- VA government context rule
- Anti-generic-filler rule with good/bad examples

## What's removed

| Removed | Reason |
|---------|--------|
| `## Journey Stages` wrapper heading | Stages promoted to H2 directly |
| Number emoji (1️⃣ 2️⃣ 3️⃣) | Editorial numbering (`## 01 &nbsp;&nbsp;`) |
| Inline emoji labels (📱🔴✅💡👥) | Text labels per design language |
| Emotion table | Single bold-em-dash line |
| `<br>` tags between stages | `---` dividers |
| Emoji priority legend in Recommendations | Text labels |
| Discussion Questions as table | Numbered list |
| `*Generated by Qori*` footer in prompt | Backend handles |
| `## Overview` separate section | Merged into Summary |

---

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Stage format restructure produces inconsistent output | Medium | Provide complete example stage in prompt |
| `&nbsp;` in H2 numbering renders differently | Low | Already verified in research readout |
| Summary narrative too generic | Medium | Instruct: "reference specific stages and participant data" |
| Discussion questions format change confuses LLM | Low | Provide example |
| Appendix artifact paths use `{{detected_files}}` | Already wired | Backend change deployed for synthesis handler |

---

## Backend changes needed

**None.** The synthesis handler already passes `detected_files` and `researcher_contact` (added in the affinity mapping commit). Journey mapping uses the same handler.

---

## Testing plan

1. Push changes
2. Generate journey map via `/qori-synthesis` → Journey Mapping
3. Verify:
   - H1: clean text, descriptive title (not just study slug)
   - Masthead: Study/Researcher/Date
   - Summary: narrative + `> [!IMPORTANT]` callout + stage table
   - Stages: `## 01 &nbsp;&nbsp;` numbering, text labels, H4 sub-sections
   - No emoji on inline labels (Touchpoints, What goes wrong, etc.)
   - Discussion questions as numbered list
   - Methodology visible with bold-em-dash format
   - Appendix with Related Artifacts + Validity Checklist
   - No duplicate footer
   - Filename: `va-mobile-nav-2026-journey-map-2026-04-30.md`
4. Regression: run affinity mapping to verify it still works

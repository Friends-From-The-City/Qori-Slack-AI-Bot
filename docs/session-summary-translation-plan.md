# Session Summary Translation Plan

**Date:** 2026-04-30
**Status:** Plan for review — no changes made yet
**Source:** `docs/design-references/session-summary-reference.md` (locked design)
**Reference:** `config/prompts/research_readout.yaml` v5.4.1 (Pattern A reference)
**Target:** `config/prompts/session_summary.yaml` (current v1.5 → proposed v1.6)
**Traceability:** Modified Pattern A — Confidence per pain point, Sources consolidated in Methodology

---

## Section-by-section diff

### 1. Title + Masthead

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| `# Session Summary — {{participant_id}}` with multi-line blockquote (Study/Date) | `# Session Summary: PT-001` with single-line masthead | Prompt rewrite |

**Current:**
```
# Session Summary — {{participant_id}}

> **Study:** {{study_name}}
> **Date:** {{session_date}}
```

**New (from locked design):**
```
# Session Summary: {{participant_id}}

**Study:** {{study_name}} &nbsp; | &nbsp; **Researcher:** {{researcher_contact}} &nbsp; | &nbsp; **Date:** {{session_date}}
```

Note: locked design uses `# Session Summary: PT-001` (colon separator, participant in title). This differs from affinity/readout pattern where participant is in the masthead. Following the locked design exactly.

**Risk:** Low.

---

### 2. Summary (NEW section)

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| No summary section — goes straight to Findings at a Glance | `## Summary` with narrative paragraph + `> [!IMPORTANT]` callout | Add new section |

**New:**
```
## Summary

[2-3 sentence narrative synthesis of this participant's session: what they are, key findings, behavioral patterns]

> [!IMPORTANT]
> **Most striking observation:** [Single most notable finding from this session]
```

The "Most striking observation" callout replaces the generic "bottom line" from research readout — better suited for per-participant focus.

**Risk:** Medium — LLM needs to synthesize a narrative, not just list.

---

### 3. Participant Context

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| Attribute/Detail GFM table + narrative paragraph | Bold-em-dash format per standard 4.3 + narrative paragraph | Format change |

**Current:** GFM table with 4 rows (Background/App Usage/Assistive Tech/Key Context).

**New (from locked design):**
```
## Participant context

**Background** — [details]

**App usage** — [details]

**Assistive technology** — [details]

**Calling pattern** — [details if relevant]

[1-2 sentence narrative framing their feedback]
```

The locked design uses bold-em-dash paragraphs (standard 4.3) instead of a table. Also adds "Calling pattern" as a field (relevant for understanding support fallback behavior).

**Risk:** Low — format change.

---

### 4. Findings at a Glance → REMOVED

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| ASCII art box in code fence with category counts | No equivalent section | Remove entirely |

The locked design has no "Findings at a Glance" section. The Summary section serves this purpose. The category counts (pain points, successes, etc.) are not in the locked design.

**Risk:** Low.

---

### 5. Pain Points (MAIN CHANGE)

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| Severity sub-headings (🔴/🟠/🟡), each pain point in `<details>` | Numbered H3 headings (`### 01 &nbsp;&nbsp;`), inline content, Confidence per item | Major prompt rewrite |

**Current:**
```
### 🔴 Critical
<details>
<summary><strong>[Title]</strong></summary>
**Impact:** [description]
**Evidence:** [quote]
</details>
```

**New (from locked design):**
```
## Pain points

### 01 &nbsp;&nbsp; [Pain Point Title]

[1-2 sentence description of what happened and its impact]

> "[verbatim quote]"
> — PT-001, [timestamp]

**Severity** — Critical &nbsp;|&nbsp; **Confidence** — Strong ([parenthetical reasoning])

---
```

**Key changes:**
- `<details>` removed — pain points are visible, not collapsed
- Severity sub-grouping removed — severity is on per-item metadata line
- Editorial numbering added (`### 01 &nbsp;&nbsp;`)
- Confidence indicator added (Strong/Moderate/Limited with reasoning)
- Quote attribution uses standard 4.4 format (em-dash on next line with timestamp)
- No per-finding Sources line (Modified Pattern A — sources in Methodology)

**Risk:** Medium — core structural change. Provide examples in prompt.

---

### 6. What Worked Well → "What worked"

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| GFM table with ✅ emoji in cells | H3 sub-sections with title, narrative, and inline quote | Format change |

**Current:** Table with `✅ **[Title]** | [Description]` rows.

**New (from locked design):**
```
## What worked

### Prescription refill workflow

[Description of what worked and why]

> "[supporting quote]"
> — PT-001, [timestamp]

### Profile information architecture

[Description]

> "[quote]"
> — PT-001, [timestamp]
```

Each success gets its own H3 with narrative + quote. No table. No emoji.

**Risk:** Low.

---

### 7. Key Insights

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| HTML `<table>` with 50/50 split, `### 🔍 [Type]` headings | Sequential H3 sections with insight title, narrative, optional quote | Format change |

**New (from locked design):**
```
## Key insights

These insights emerged from observing {{participant_id}}'s session and connect specific behaviors to broader patterns worth investigating across the participant pool.

### [Insight title — descriptive, not type-labeled]

[1-2 sentence description + design implication]

### [Another insight]

[Description + optional supporting quote]

> "[quote if relevant]"
> — PT-001, [timestamp]
```

Insight type labels (Mental Model, Behavior Pattern, etc.) become the H3 heading text — no `🔍` emoji prefix.

**Risk:** Low.

---

### 8. Verbatim Quotes → REMOVED

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| Standalone section with `> [!WARNING]` / `> [!TIP]` / `> [!IMPORTANT]` callouts | No equivalent section | Remove entirely |

Quotes appear inline within pain points, what worked, and key insights as evidence. No separate collection needed.

**Risk:** Low — content is preserved inline, just not duplicated.

---

### 9. Recommended Actions

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| 3-column table with emoji priority labels | 4-column table with numeric priority, text labels | Minor format change |

**New (from locked design):**
```
## Recommended actions

| Priority | Action | Addresses | Effort |
|:--------:|--------|-----------|:------:|
| 1 | [Specific action] | Pain point 01 | High |
| 2 | [Action] | Pain point 02 | Medium |
```

Priority as numbers (1, 2, 3), not emoji. Effort as text labels (High/Medium/Low). References pain points by number.

**Risk:** Low.

---

### 10. Methodology

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| Multiple tables, ASCII art pipeline, data quality section, follow-up checklist, all visible | Bold-em-dash prose per standard 4.3, includes Sources Analyzed and Limitations | Simplify |

**New (from locked design):**
```
## Methodology

**Session format** — [format, duration, setup details]

**Tasks attempted** — [list of tasks]

**Sources analyzed** — Coded transcript (primary source for verbatim quotes and behavioral data) and [X] observer notes files

**Analysis approach** — Pain points and quotes are direct extractions from the coded transcript; opportunities and insights are reasoned inferences from behavioral patterns observed during the session.

**Limitations** — [Source completeness, single participant caveat, cross-reference note]

### References

- [Reference 1]
- [Reference 2]
```

This is where Sources are consolidated (Modified Pattern A) — listed in "Sources analyzed" instead of per-finding.

**Risk:** Low.

---

### 11. Appendix

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| `<details>` Session Metadata with attribute table + extraction counts | `<details>` Related Artifacts + `<details>` Validity Checklist | Replace |

**New (from locked design):**

Two `<details>` blocks:
1. **Related artifacts** — table linking to coded transcript, observer notes, session notes, discussion guide, research plan. Uses real paths (but since `detected_files` isn't wired for this handler, use descriptive placeholder paths that match the study folder convention).
2. **Validity checklist** — 5 rows verifying quotes, pain points, inferences, confidence levels, sources.

Session Metadata (participant ID, study, dates, analyzer, template version) moves to the backend footer — the `buildTraceabilityFooter` already outputs Generated/Model/Template/Study. Adding Participant to the footer would need a small backend tweak, but the locked design shows it in the footer table. **Flag:** the current `buildTraceabilityFooter` doesn't output a Participant row — this is a gap.

**Risk:** Low for appendix changes. Backend footer gap is a known issue.

---

### 12. Footer

| Current v1.5 | Locked design | Change |
|-------------|---------------|--------|
| `*Generated by Qori • {{current_date}}*` in prompt | Backend footer (2-column table + italic line). Locked design shows a "Participant" row. | Remove from prompt |

The locked design footer includes a `| Participant | PT-001 |` row that the backend doesn't currently generate. Two options:
1. Add participant_id to `buildTraceabilityFooter` (small backend change)
2. Accept the gap — the masthead already shows the participant

**Recommendation:** Accept the gap for v1.6. Masthead has the participant. Backend footer enhancement is a follow-up.

**Risk:** Low.

---

### 13. Filename

| Current v1.5 | Proposed v1.6 |
|-------------|---------------|
| `{{participant_id}}-session-summary-{{session_date}}.md` | `{{participant_id}}-session-summary-{{current_date_iso}}.md` |

Use `current_date_iso` for sortable date. Backend slugify handles any formatting.

---

## What carries over from research_readout v5.4.1

| Pattern | Applies? | Notes |
|---------|----------|-------|
| Masthead (inline pipes) | Yes | Study/Researcher/Date |
| Summary with narrative + callout | Yes | `> [!IMPORTANT]` for "Most striking observation" |
| Editorial numbering | **Modified** — H3 on pain points only | `### 01 &nbsp;&nbsp;` |
| Confidence per finding | Yes — per pain point | Strong/Moderate/Limited with reasoning |
| Sources per finding | **No** — consolidated in Methodology | Modified Pattern A |
| Backend footer | Yes | Remove in-prompt footer |
| Clean H1 | **Modified** — locked design has participant in title | `# Session Summary: PT-001` |
| Bold-em-dash methodology | Yes | Standard 4.3 |
| Filename slugification | Yes | Backend handles |
| `<details>` for appendix only | Yes | Artifacts + validity checklist |

## What's preserved from current v1.5

- CRITICAL GROUNDING RULES block (verbatim — anti-hallucination)
- Extraction vs inference distinction (pain points = explicit, opportunities/insights = inferred)
- Quote rules (verbatim only, timestamps required)
- Source data injection (`{{coded_transcript_content}}`, `{{notes_content}}`)
- `output_variable: "session_summary_output"` on task
- Structured `input_variables` format

## What's removed

| Removed | Reason |
|---------|--------|
| ASCII art "Findings at a Glance" box | Summary section replaces it |
| `<details>` on Pain Points | Pain points are core content, not supplementary |
| HTML `<table>` for Key Insights | Sequential H3 sections work better |
| Verbatim Quotes section | Quotes inline as evidence, not duplicated |
| `<sub>` / italic footer in prompt | Backend handles footer |
| Session Metadata `<details>` | Moves to backend footer + masthead |
| Emoji severity sub-headings (🔴/🟠/🟡) | Severity on per-item metadata line |
| `🔍` on insight headings | Decorative emoji removed |
| ✅ in "What Worked" table cells | Emoji removed, format changed to H3 sections |
| Processing pipeline ASCII art | Simplified to prose |
| FORMATTING RULES instruction | Replaced by specific format instructions |

---

## Backend changes needed

**None required for v1.6.** The existing `templateData` in `analyzeNotesHandler.js` provides all needed variables. `detected_files` is not needed (no per-finding Sources lines).

One optional follow-up: add `researcher_contact` to `templateData` for the masthead (currently not passed). The locked design shows "Researcher: Lapedra Tolson" — this comes from the study object. The `analyzeNotesHandler` has access to `study` (line 180: `study?.path`) but doesn't extract `researcher_name`.

**Recommendation:** Add `researcher_contact: study?.researcher_name || ''` to `templateData`. One line. Low risk.

---

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Pain point restructure changes output quality | Medium | Provide 2 complete examples in prompt (one Strong, one Moderate confidence) |
| Summary narrative too generic | Medium | Add instruction: "Reference specific pain points and behavioral patterns from THIS session" |
| `&nbsp;` in H3 numbering renders differently than H2 | Low | Already verified working in research readout (H2). H3 may behave same. Test. |
| Removing Verbatim Quotes loses stakeholder quotes | Low | Quotes preserved inline in pain points and insights |
| Key Insights format less visually distinct without 2-column | Low | Sequential sections are cleaner on mobile/narrow views |

---

## Testing plan

1. Push changes
2. Generate session summary via `/qori-analyze` → select va-mobile-nav-2026 session
3. Verify:
   - H1 format: `# Session Summary: PT-001`
   - Masthead with Study/Researcher/Date
   - Summary section with narrative + `> [!IMPORTANT]` callout
   - Pain points: numbered (`### 01 &nbsp;&nbsp;`), visible (not collapsed), with Confidence
   - No ASCII art box
   - No Verbatim Quotes section
   - Key Insights as sequential H3 sections (no HTML table)
   - Methodology in bold-em-dash prose
   - Appendix: Related Artifacts + Validity Checklist in `<details>`
   - No duplicate footer
   - Filename: `pt-001-session-summary-2026-04-30.md` (slugified)
4. Regression: run one synthesis command to verify `detected_files` addition didn't break anything

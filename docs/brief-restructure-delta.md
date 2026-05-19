# Brief Restructure Delta: v6.0 to v7.0 Conformance

**Date:** 2026-05-19
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `research_plan.yaml` v7.0, ADRs 0005/0006/0007

---

## 1. Current state of brief

The brief (v6.0) uses the **"minimal static + single LLM" pattern** identified in the post-migration audit as non-conformant with ADR 0005. It is one of the 12 templates that need restructuring.

### Architecture

The output template has a single `{{ai_generated.brief_body}}` slot that renders all 7 body sections (Summary, Problem, What we'll learn, Method, Participants, Out of scope, Risks) as one LLM-generated block. The template owns the masthead, timeline section, approval section, and discovery sources appendix — but the body is opaque.

Six AI tasks total:
- `descriptive_title` — converts study slug to title (LLM doing what `toTitleCase()` should)
- `display_date` — formats ISO date (LLM doing what `date-fns/format` should)
- `timeline_display` — maps "standard" to "6 weeks" (LLM doing what a lookup table should)
- `timeline` — computes phase dates from start date + preference (LLM doing what `buildTimelinePhases()` already does in planHandler)
- `brief_body` — the monolithic body task (7 sections, ~100 lines of prompt)
- `approval_items` — generates 4 checkboxes

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Display date | LLM formats `current_date_iso` | Handler: `format(new Date(), 'MMMM d, yyyy')` |
| Timeline display | LLM maps preference string | Handler: lookup table |
| Timeline phase dates | LLM computes from start date | Handler: `buildTimelinePhases()` (already exists in planHandler) |
| Methodology label | LLM renders in metadata table | Handlebars: `{{methodology}}` (handler already computes label) |
| Budget amount | LLM renders in metadata table | Handlebars: `{{budget}}` |
| Decision deadline | LLM renders in metadata table | Handlebars: `{{decision_deadline}}` |
| Participant count | LLM renders in metadata table | Handlebars: `{{participant_approach}}` |
| Target barrier IDs | LLM assigns TB-001, TB-002 | Handler assigns after LLM generates barrier statements |
| Research question IDs | LLM assigns RQ-001, RQ-002 | Handler assigns after LLM generates questions |

### What the LLM should control (bounded prose)

- Summary paragraph (2-3 sentences synthesizing discovery + researcher input)
- Problem narrative (2-3 paragraphs with discovery evidence)
- Target barrier statements (the prose, not the IDs)
- Research question text (the questions, not the IDs)
- Method rationale (why this method, citing discovery sources)
- Participant segment rationale (justifying composition with discovery evidence)
- Out of scope rationale (enriching researcher input with discovery evidence)
- Risk identification (study-specific risks with mitigations)

### Cascade emissions

The brief emits 12 variables. Current shapes and what plan consumes:

| Variable | Current shape | Plan consumes? | Shape match? |
|----------|--------------|----------------|--------------|
| `research_objectives` | `string[]` | Yes (required) | Yes — plan transforms on consume per ADR 0006 |
| `research_questions` | `{id, question, priority}[]` | Yes (required) | Yes |
| `target_barriers` | `{id, barrier, source}[]` | Yes (required) | Yes |
| `methodology_selection` | `string` | Yes (required) | Yes |
| `participant_criteria` | `string` | Yes (required) | Yes |
| `participant_approach` | `string` | Yes (optional) | Yes |
| `business_context` | `string` | Yes (optional) | Yes |
| `out_of_scope` | `string[]` | Yes (optional) | Yes |
| `timeline_preference` | `string` | Yes (optional) | Yes |
| `start_date` | `string` | Yes (optional) | Yes |
| `decision_deadline` | `string` | Yes (optional) | Yes |
| `budget` | `string` | Yes (optional) | Yes |

**All shapes match.** Plan handler already handles transformation correctly. No shape changes needed for existing emissions.

### What's missing vs. v7.0

| v7.0 feature | Brief status |
|--------------|-------------|
| Interleaved Handlebars + bounded LLM slots | No. Single `{{ai_generated.brief_body}}` blob |
| Computed values rendered mechanically | No. LLM renders dates, budget, methodology, timeline |
| Anti-fabrication guards in prompts | Partial. "Use ONLY metrics from upstream" for citations, but no guard on computed values |
| Cascade summary section at bottom | No. Has Discovery sources appendix (different purpose) |
| Cross-reference verification | No |
| Handler assembles all mechanical data | No. Handler passes raw form values; LLM does all assembly |
| JSON-emitting AI tasks with parsed output | No. All tasks emit prose |

---

## 2. Target state

The restructured brief should follow the same architecture as `research_plan.yaml` v7.0:

**Handler is the data assembly point.** It loads form values, computes derived values (display date, timeline phases, timeline display label), and builds a complete data object. The template iterates and interpolates.

**Output template is interleaved Handlebars + bounded AI.** Each section is either:
- Pure Handlebars (masthead, metadata table, timeline table, approval, cascade summary)
- Bounded LLM prose (summary, problem narrative, method rationale, participant rationale, risk assessment)

**LLM tasks are focused and bounded.** Each task produces one section's prose. No task generates structure, IDs, or computed values.

**Two-pass approach for IDs.** Target barriers and research questions present a challenge: the LLM generates the barrier/question statements, but the IDs should be handler-assigned. Solution: LLM tasks emit JSON arrays of statements (no IDs), handler assigns sequential IDs, Handlebars renders the list with IDs.

---

## 3. Specific changes required

### 3a. Handler changes (`briefHandler.ts`)

**Add mechanical computations** (port from planHandler where applicable):

```
displayDate      = format(new Date(), 'MMMM d, yyyy')
timelineDisplay  = { standard: '6 weeks', accelerated: '4 weeks', extended: '8 weeks' }[pref]
timelinePhases   = buildTimelinePhases(startDate, timelinePref)  // import from planHandler
```

**Add post-LLM ID assignment.** After YAML processing returns, the handler doesn't need to do this — the variable extractor handles it. But the *template* should render barriers and questions via Handlebars with handler-provided IDs, not rely on the LLM to format them correctly.

This means: add two JSON-emitting AI tasks (`target_barriers_raw` and `research_questions_raw`) that return arrays of objects without IDs. Handler parses these, assigns IDs (`TB-001`, `RQ-001`), and passes them to the template as Handlebars-ready arrays.

Wait — there's a subtlety here. Currently the brief's `brief_body` task generates the entire body as markdown prose. The variable extractor then parses the *rendered output* to extract `research_questions` and `target_barriers` for downstream cascade. In v7.0, the extraction would still work the same way (the rendered document still contains the questions and barriers), but the IDs would be handler-assigned and mechanically rendered, so the extractor would see consistent formatting.

**Revised approach:** The handler assembles barrier/question data *before* rendering, so the AI tasks that generate Problem and What we'll learn sections receive the structured data as context, and the template renders the ID'd lists via Handlebars. The LLM writes the narrative prose around them but doesn't author the structured lists.

**Add cascade summary data.** Compute counts: `objectives_count`, `research_questions_count`, `target_barriers_count`. Add methodology label. These are passed to the template for the new cascade summary section.

**Add `BriefTemplateInput` fields:**

```typescript
interface BriefTemplateInput {
  // ... existing fields ...
  display_date: string;                    // NEW: formatted date
  timeline_display: string;                // NEW: "6 weeks" etc.
  timeline_phases: TimelinePhase[];        // NEW: computed phase array
  objectives_count: number;                // NEW: cascade summary
  research_questions_count: number;        // NEW: cascade summary
  target_barriers_count: number;           // NEW: cascade summary
}
```

### 3b. YAML changes (`research_brief.yaml`)

**Remove AI tasks that should be mechanical:**
- `descriptive_title` — replace with handler computation or keep as LLM (this one is legitimately creative; study slugs like "va-mobile-nav-q3" need humanization). **Decision: keep as bounded LLM task.** It's genuinely generative.
- `display_date` — remove. Handler computes.
- `timeline_display` — remove. Handler computes.
- `timeline` — remove. Handler computes via `buildTimelinePhases()`.

**Split `brief_body` into bounded tasks:**
- `summary` — 2-3 sentence study summary
- `problem_narrative` — 2-3 paragraphs, discovery-enriched problem framing
- `target_barriers_raw` (output_format: json) — array of `{barrier, source}` objects, no IDs
- `research_questions_raw` (output_format: json) — array of `{question, priority}` objects, no IDs
- `method_rationale` — why this method, citing discovery evidence
- `participant_rationale` — segment justification with discovery evidence
- `out_of_scope_rationale` — enriched out-of-scope items
- `risks` (output_format: json) — `[{risk, source, mitigation}]`
- `approval_items` — keep as-is (4 checkboxes)

**Restructure output template** to interleaved Handlebars:

```handlebars
# Research Brief: {{ai_generated.descriptive_title}}

**Study:** {{selected_study}} | **Researcher:** {{lead_researcher}} | ...

---

## Summary

{{ai_generated.summary}}

| | |
|---|---|
| **Method** | {{methodology}} |
| **Participants** | {{participant_approach}} |
| **Timeline** | {{timeline_display}} |
| **Decision deadline** | {{decision_deadline}} |
| **Budget** | {{#if budget}}{{budget}}{{else}}TBD{{/if}} |

---

## Problem

{{ai_generated.problem_narrative}}

**Target barriers for validation:**

{{#each target_barriers}}
- **[{{this.id}}]** {{this.barrier}}{{#if this.source}} _({{this.source}})_{{/if}}
{{/each}}

---

## What we'll learn

{{#each research_objectives}}
- {{this}}
{{/each}}

**Research questions:**

{{#each research_questions}}
- **[{{this.id}}]** {{this.question}} _({{this.priority}})_
{{/each}}

---

## Method

{{ai_generated.method_rationale}}

---

## Participants

{{ai_generated.participant_rationale}}

---

## Out of scope

{{ai_generated.out_of_scope_rationale}}

---

## Risks

| Risk | Source | Mitigation |
|------|--------|------------|
{{#each risks}}
| {{this.risk}} | {{this.source}} | {{this.mitigation}} |
{{/each}}

---

## Timeline

| Phase | Dates |
|-------|-------|
{{#each timeline_phases}}
| {{this.phase}} | {{this.dates}} |
{{/each}}

**Hard deadline:** {{decision_deadline}}

---

## Approval

{{ai_generated.approval_items}}

---

---

## Cascade summary

This brief establishes the research scope for downstream templates.

| Commitment | Count |
|------------|-------|
| Research objectives | {{objectives_count}} |
| Research questions | {{research_questions_count}} |
| Target barriers | {{target_barriers_count}} |
| Methodology | {{methodology}} |
| Budget | {{#if budget}}{{budget}}{{else}}N/A{{/if}} |

{{#if discovery_sources}}
**Discovery sources**

| Marker | Source | Type | Date | Findings used |
|--------|--------|------|------|---------------|
{{discovery_sources}}
{{/if}}
```

### 3c. Handling the two-pass barrier/question challenge

This is the most architecturally interesting piece. Currently:

1. LLM generates `brief_body` with TB-001/RQ-001 IDs inline
2. Variable extractor reads the rendered output and extracts `{id, barrier}` objects
3. Downstream templates consume these objects

In the restructured flow:

1. LLM generates `target_barriers_raw` as JSON: `[{barrier, source}, ...]`
2. LLM generates `research_questions_raw` as JSON: `[{question, priority}, ...]`
3. **Handler** (not yamlProcessor) parses these JSON outputs and assigns IDs
4. Handler passes `target_barriers: [{id: 'TB-001', barrier, source}, ...]` to template
5. Handlebars renders the ID'd lists mechanically
6. Variable extractor reads the rendered output and extracts the same shapes

**Problem:** The yamlProcessor currently runs AI tasks, then renders the template. The handler calls `processYamlTemplate(content, data, studyPath)` and gets back the rendered output. The handler doesn't have access to the AI task outputs before rendering.

**Solution options:**

**A. Post-process in handler.** Run `processYamlTemplate` as today. After rendering, parse the rendered markdown to extract barriers/questions, assign IDs, re-render. Fragile — exactly the kind of markdown parsing we want to avoid.

**B. Two-phase processing.** Split yamlProcessor into: (1) run AI tasks, return raw outputs; (2) handler transforms outputs; (3) render template. This is a yamlProcessor API change that affects all templates.

**C. Handler runs barrier/question AI tasks directly.** The handler calls Claude directly for the barrier/question JSON tasks (bypassing yamlProcessor for these two), assigns IDs, then passes the complete data to `processYamlTemplate` for the remaining prose tasks + rendering. The barrier/question data flows as Handlebars variables, not AI-generated slots.

**D. Pre-compute in handler, pass as Handlebars data.** The handler generates barriers and questions using a direct LLM call before invoking yamlProcessor. The YAML template's prose tasks receive them as context (`{{target_barriers}}`) and the output template renders them via `{{#each}}`. The variable extractor still extracts from the rendered output.

**Recommendation: Option C.** It's the lowest-risk change. The handler already does direct work (discovery loading, budget parsing). Adding two focused LLM calls for structured data is consistent with the handler-as-assembly-point principle. The yamlProcessor API stays unchanged. Other templates are unaffected.

**Trade-off:** The handler makes 2 extra API calls (barrier extraction + question extraction) before calling yamlProcessor, which makes its own calls for the prose tasks. Total API calls increases from ~6 to ~8. Acceptable for a document that's generated once per study.

### 3d. Schema changes

None required. The existing `research_question.yaml` and `target_barrier.yaml` schemas match what the restructured flow will produce. The emitted variable shapes stay the same.

### 3e. Anti-fabrication guards

Add to each bounded prose task:

```
Do NOT invent statistics, metrics, or numbers. Use ONLY data from the
inputs provided. If no supporting data exists, state the claim without
a metric.
```

This goes in `summary`, `problem_narrative`, `method_rationale`, and `participant_rationale`.

---

## 4. Cascade contract impact

### Does plan handler need updates?

**No.** The brief's emitted variable shapes are unchanged:
- `research_objectives` stays `string[]`
- `research_questions` stays `{id, question, priority}[]`
- `target_barriers` stays `{id, barrier, source}[]`
- All other emissions stay the same type

Plan handler's `readUpstreamVariables` and ADR 0006 transforms continue to work. The `normalizeVariableFields()` fallback (flat string → object upgrade) remains as a safety net for legacy data.

### Does variable extractor need updates?

**No.** The `extract_from` hints will still point at the right rendered sections. The rendered output will be cleaner (mechanically formatted IDs instead of LLM-formatted IDs), which should improve extraction reliability.

### Do downstream templates need updates?

**No.** `session_summary`, `affinity_mapping`, and readout templates all consume brief emissions via `readUpstreamVariables`. The shapes don't change. They'll see the same data.

---

## 5. Risks

### Risk 1: Two-pass LLM for barriers/questions adds latency

The handler will make 2 direct LLM calls (barriers JSON + questions JSON) before calling yamlProcessor for the prose tasks. This adds ~5-10 seconds to brief generation.

**Mitigation:** Run the two JSON calls in parallel (`Promise.all`). They're independent. Net latency increase: ~3-5 seconds.

### Risk 2: Discovery citation markers may be harder to maintain across split tasks

Currently `brief_body` generates all 7 sections in one pass, which lets the LLM maintain citation marker numbering ([D1], [D2], ...) across the entire document. Splitting into separate tasks means each task numbers independently.

**Mitigation:** The cascade summary section at the bottom will list discovery sources with their marker prefixes. Each prose task gets the same discovery context and uses the same marker convention. The convention is prefix-based ([D], [S], [V]), not globally numbered — so tasks can number within their own scope. This is actually how the prompt already instructs: "Number in order of first appearance across entire document" — but since sections are now independent tasks, change to "Number in order of first appearance within this section." Slight citation format change but functionally equivalent.

**Alternative:** Keep a single `brief_prose` task for the discovery-heavy sections (Problem, Method, Participants) and only split out the structured sections (barriers, questions, risks, out of scope). This preserves citation continuity for the narrative sections. Trade-off: the remaining monolithic task is smaller but still monolithic.

**Recommendation:** Start with full split. If citation quality degrades in testing, consolidate the discovery-citing sections back into one task.

### Risk 3: briefHandler complexity increases

The handler goes from ~100 lines of data assembly to ~180 lines (adding timeline computation, direct LLM calls, ID assignment, cascade summary counts). This is the same trajectory as planHandler (~140 lines) and is the expected consequence of ADR 0005.

**Mitigation:** The `buildTimelinePhases` function is already written and tested in planHandler. Extract it to a shared utility (`utils/timelineComputation.ts`) so both handlers import it.

### Risk 4: Existing discovery-enriched briefs in production

Studies that already have briefs with extracted variables will not be affected. The variable shapes are unchanged. New briefs generated after the restructure will produce the same shapes with more reliable ID formatting.

### Risk 5: `descriptive_title` is the only remaining "creative" LLM task in the template header

The plan template has no equivalent — it uses `project_title` directly. The brief slugifies study names aggressively (`va-mobile-nav-q3`), so a humanization step adds real value. Keeping this as a bounded LLM task is correct.

---

## 6. Implementation sequence

1. Extract `buildTimelinePhases` and `buildTimelineSummary` to shared utility
2. Add mechanical computations to `briefHandler.ts` (display date, timeline, counts)
3. Add direct LLM calls for barriers and questions JSON
4. Add ID assignment logic post-LLM
5. Update `BriefTemplateInput` interface
6. Restructure `research_brief.yaml`: split tasks, interleave output template
7. Add anti-fabrication guards to all prose tasks
8. Add cascade summary section to output template
9. Test: typecheck, unit tests, manual generation of a brief with and without discovery
10. Verify: variable extraction produces same shapes as before
11. Verify: plan handler consumes restructured brief's emissions correctly

**Estimated effort:** 1 full session (comparable to the plan restructure).

---

## 7. What this document does NOT cover

- Brief modal changes (field additions, removals, UX improvements) — those are tracked in `docs/product-backlog.md` under "Modal & UX polish"
- Template unit tests — tracked in `docs/v1.1-followups.md`
- Other template restructures (discovery, synthesis, readouts) — each gets its own delta document when its turn comes

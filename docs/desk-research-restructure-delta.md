# Desk Research Restructure Delta: v5.1 to v7.0 Conformance

**Date:** 2026-05-19
**Status:** Proposed (awaiting approval before implementation)
**Reference:** `research_brief.yaml` v7.0 (ADR 0016), `research_plan.yaml` v7.0 (ADR 0005)

---

## 1. Current state of desk research

The desk research template (v5.1) uses the **"minimal static + single LLM per section" pattern**. It's closer to v7.0 than the brief was pre-restructure — each section has its own LLM task (not a single monolithic body task) — but the output template is essentially `{{ai_generated.X}}` stacked vertically with no mechanical rendering. Every value in the rendered document passes through the LLM.

### Architecture

Five AI tasks, each generating one major section:
- `document_inventory` — document metadata table
- `executive_summary` — overview, findings, implications, confidence
- `themes` — thematic analysis with evidence
- `recommendations` — actionable recommendations with evidence base
- `sources` — reference list

The output template is a thin wrapper: masthead (centered `<div>`, LLM-free), then five `{{ai_generated.X}}` blocks, then a hardcoded methodology note footer.

### What the LLM controls that it shouldn't

| Value | Current | Should be |
|-------|---------|-----------|
| Document count | LLM generates inventory | Handler counts parsed documents |
| Document names | LLM generates from content | Handler has `processedFiles` array with filenames |
| Analysis date | Template uses `{{current_date}}` (mechanical — correct) | No change needed |
| Study name | Template uses `{{selected_study}}` (mechanical — correct) | No change needed |
| Topic | Template uses `{{effective_topic}}` (mechanical — correct) | No change needed |

The gap here is smaller than the brief was. Most metadata is already mechanical. The main issue is that document inventory (file names, types, counts) is LLM-generated when the handler already has this data from file processing.

### Handler bugs (pre-existing, not related to v7.0)

**Bug 1: Modal fields ignored.** The handler sets `research_topic`, `selected_study`, and `description` all to `studyName` (line 186-188). The modal's "Description" field (`description_block`) and "Research focus" field (`research_focus_block`) are collected from the researcher but never extracted. The researcher's input is silently discarded.

**Bug 2: `topic` variable never set.** The YAML declares `topic` as required (used for filename slug via `topic_slug` and discovery variable scoping). The handler doesn't include `topic` in `DeskResearchTemplateInput`. It's unclear how the filename renders correctly — either `yamlProcessor` silently swallows the missing variable or `topic` gets injected elsewhere.

**Bug 3: `DeskResearchTemplateInput` is minimal.** Only 4 fields (`research_topic`, `selected_study`, `description`, `document_content`). The YAML expects more (`topic`, `effective_topic`, `topic_slug`, `team`). The handler relies on yamlProcessor's `derived_variables` block in the YAML to compute `effective_topic` and `topic_slug`, but `topic` itself is never provided.

### What it emits

Six cascade variables, all with `pool: true` / `pool_strategy: append`:

| Variable | Schema | Shape | Downstream consumers |
|----------|--------|-------|---------------------|
| `discovered_barriers` | `$ref: schemas/discovered_barrier.yaml` | `{id, title, summary, magnitude, evidence[], affected_population, source_document, confidence}[]` | `stakeholder_synthesis` (formal consumes), `research_brief` (manual load) |
| `discovered_metrics` | `$ref: schemas/discovered_metric.yaml` | `{id, metric_name, value, context, baseline_or_target, source_document}[]` | `research_brief` (manual load) |
| `discovered_journeys` | `$ref: schemas/discovered_journey.yaml` | `{id, journey_name, success_pattern, failure_pattern, completion_rate, satisfaction, source_document}[]` | `research_brief` (manual load) |
| `methodology_recommendations` | `$ref: schemas/methodology_recommendation.yaml` | `{id, method, addresses, rationale, source_document}[]` | `research_brief` (manual load) |
| `knowledge_gaps` | inline schema | `{id, gap, why_matters, suggested_resolution, source_document}[]` | `stakeholder_synthesis` (formal consumes), `research_brief` (manual load) |
| `source_artifacts` | inline schema | `{title, source_org, date, type, contribution}[]` | Not consumed by any template (orphaned per v1.1 followups) |

All extraction is LLM-driven via `extract_from` hints in the emits block. The variable extractor reads the rendered output and extracts structured data. This is the correct pattern and doesn't need to change.

### Anti-fabrication guards

**Present and strong.** Every task has "CRITICAL ANTI-HALLUCINATION RULES" with specific instructions:
- "EVERY finding must be directly quoted or paraphrased from the provided content"
- "Do NOT invent statistics, percentages, or data points"
- "Do NOT cite authors or studies not mentioned in the content"
- Empty content detection with graceful fallback messages

This is actually better than the brief's anti-fabrication guards. The desk research template was designed defensively from the start because it processes uploaded documents (untrusted input).

### Cascade summary section

**Missing.** No cascade summary at the bottom documenting what the template emits.

### What's missing vs. v7.0

| v7.0 feature | Desk research status |
|--------------|---------------------|
| Interleaved Handlebars + bounded LLM slots | Partially. Masthead is Handlebars; body is stacked LLM sections. No mechanical rendering of computed values within the body. |
| Computed values rendered mechanically | Partially. Date and study name are mechanical. Document inventory is LLM-generated when handler has the data. |
| Anti-fabrication guards | Present and strong |
| Cascade summary section | Missing |
| Handler assembles all mechanical data | No. Handler passes minimal data; YAML derived_variables compute topic variants. Modal fields are ignored. |
| JSON-emitting AI tasks | No. All tasks emit prose. Extraction is post-render via variable extractor. |

---

## 2. Target state

The restructured desk research should follow the v7.0 pattern with one important distinction: **desk research is a document analysis template, not a scope-definition template**. The brief and plan define scope commitments. Desk research synthesizes uploaded documents. This affects what "computed values" means:

- **Brief/plan:** Computed values = dates, counts, IDs, budget math. Handler computes these.
- **Desk research:** Computed values = document count, document names, file types. Handler already has these from file processing.

The LLM's role in desk research is genuinely analytical — it reads documents and extracts findings. Most of its current tasks are legitimately generative. The restructure is smaller than the brief's.

### Specific target

1. Handler fixes: extract modal fields, pass `topic`, build document inventory data mechanically
2. Output template: interleave Handlebars for document inventory (handler-assembled), mechanical metadata
3. Add cascade summary section
4. Keep existing anti-fabrication guards (they're already strong)
5. No pre-render JSON tasks needed (unlike brief — desk research doesn't need handler-assigned IDs before prose tasks run)

---

## 3. Specific changes required

### 3a. Handler changes (`deskResearchHandler.ts`)

**Fix modal field extraction:**
```typescript
const description = (values.description_block?.description?.value || '').trim();
const researchTopic = (values.research_focus_block?.research_topic?.value || '').trim();
const topic = researchTopic || studyName;
```

**Expand `DeskResearchTemplateInput`:**
```typescript
interface DeskResearchTemplateInput {
  selected_study: string;
  topic: string;
  research_topic: string;
  description: string;
  document_content: string;
  // Mechanical data from file processing
  document_count: number;
  document_names: string[];
  document_types: string[];
}
```

**Build document inventory data mechanically:**
```typescript
const documentNames = processedFiles.map(f => f.name);
const documentTypes = processedFiles.map(f => f.type);
```

### 3b. YAML changes (`desk_research.yaml`)

**Update output template** to render document metadata mechanically:

Replace `{{ai_generated.document_inventory}}` with a Handlebars-rendered document list for the metadata portion (file names, types, count), followed by a bounded LLM task for the per-document summaries and relevance assessments.

**Split `document_inventory` task:** The current task generates both mechanical data (file names, types) and analytical content (summaries, relevance ratings). Split into:
- Mechanical: Handlebars renders file list table
- AI: `document_analysis` task generates per-document summaries and relevance only

**Add cascade summary section** to output template.

**Remove centered `<div>` formatting.** The brief and plan templates use standard markdown mastheads. The desk research template uses `<div align="center">` which doesn't render consistently across all markdown renderers. Align with the established pattern.

### 3c. Schema changes

None. The existing emit schemas are well-designed and match what downstream consumers expect. The shapes don't change.

### 3d. No pre-render JSON tasks needed

Unlike the brief (which needed handler-assigned IDs for barriers and questions), desk research's emitted variables don't have handler-assigned IDs. The `barrier-001`, `metric-001` etc. IDs are assigned by the variable extractor based on `extract_from` hints. This is correct — desk research documents vary in content, so IDs are extraction-time, not handler-time.

---

## 4. Cascade contract impact

### Do downstream consumers need updates?

**No.** The emitted variable shapes are unchanged. `stakeholder_synthesis` and `research_brief` consume the same `{id, title, summary, ...}` objects. The extraction pipeline (yamlProcessor → variableExtractor → studyVariables) is unchanged.

### Does the extraction quality change?

**Possibly improves.** The rendered document will have a cleaner structure (mechanical document list + analytical sections) which should make extraction hints more reliable. Currently the `extract_from` hints point at "Key Themes and Executive Summary" which are LLM-generated section headings — those can drift in naming. With Handlebars-rendered headings, the section names are fixed.

---

## 5. Risks

### Risk 1: Document inventory split may lose analytical context

The current `document_inventory` task generates both metadata (file name, type) and analytical assessment (relevance, summary). Splitting into mechanical metadata + AI analysis could lose the connection between "this file is called X" and "this file is relevant because Y." The AI analysis task needs to receive the mechanical document list as context.

**Mitigation:** Pass `document_names` and `document_types` to the AI task prompt so it can reference specific files by name.

### Risk 2: Handler field extraction changes modal contract

The handler currently ignores `description` and `research_topic` modal fields. Fixing this is correct but changes behavior — studies that were analyzed with `description = studyName` will now have `description = ""` (researcher's actual input, which is often blank for the optional field). The rendered document's `{{description}}` conditional will behave differently.

**Mitigation:** Fall back to `studyName` when fields are blank, matching current behavior as the default.

### Risk 3: Smaller restructure than brief — less opportunity to validate pattern

The brief restructure was comprehensive (monolithic body → 7 tasks, pre-render JSON, ID assignment). The desk research restructure is smaller (handler fixes + document inventory split + cascade summary). This means less opportunity to validate that the v7.0 pattern generalizes. The real validation comes with the next template that has a substantially different architecture.

**Mitigation:** Accept this. The desk research restructure is genuinely simpler — don't inflate it to match the brief's scope.

---

## 6. Implementation sequence

1. Fix handler: extract modal fields, pass `topic`, add document inventory data
2. Split `document_inventory` task: mechanical file list via Handlebars, AI analysis for summaries/relevance
3. Standardize masthead (remove centered `<div>`, match brief/plan pattern)
4. Add cascade summary section
5. Test: typecheck, unit tests, manual generation with uploaded documents
6. Verify: variable extraction produces same shapes as before

**Estimated effort:** 1 session (smaller than brief restructure).

---

## 7. What this document does NOT cover

- Discovery workspace changes (`_discovery/` folder structure) — already decided, not changing
- Survey synthesis or stakeholder synthesis restructures — each gets its own delta
- The `source_artifacts` orphaned variable — tracked in v1.1 followups, not addressed here

# Architecture Review: GET Cycle Implementation for Qori-Slack

**Date:** May 1, 2026
**Reviewer:** Claude Code (architecture review)
**Inputs:** 01-cascade-map.md, 02-variable-specification.md, full codebase read
**Status:** Recommendations for review — no code changes made

---

## Q1: Variable storage format

**Recommendation: JSON files in qori-studies repo (per-study), with a PostgreSQL index table for queries.**

### Why not PostgreSQL only?

The variables ARE the study's knowledge state. They belong with the study, not in a transient database. If the Railway Postgres instance is rebuilt or the project migrates, the variables travel with the study. The qori-studies repo is already the canonical location for all study artifacts — variables are artifacts.

### Why not JSON files only?

The synthesis handler needs to answer questions like "which studies have completed affinity mapping?" and "which variables are stale?" File-based lookups via GitHub API are expensive (one API call per file per study). A PostgreSQL index table makes these queries fast.

### Proposed architecture

```
qori-studies repo (GITHUB_REPO):
  studies/{study-slug}/
    primary-research/
      .variables/                    ← NEW: per-study variable store
        study-variables.json         ← single file, all variables for this study
        variable-history.json        ← optional: tracks when variables changed

Railway PostgreSQL:
  study_variables table              ← NEW: index/cache for cross-study queries
    id, study_name, variable_type, variable_key, 
    source_template, source_version, confidence,
    value_hash, updated_at, stale
```

**Write path:** After Generate, the Extract phase writes variables to `study-variables.json` in GitHub AND upserts the index row in Postgres.

**Read path:** Templates read variables from GitHub (fetched alongside other study files by the synthesis handler). Postgres is only for dashboard/query use cases.

**Why a single JSON file, not one file per variable?** The variable spec lists ~50 variable types. One file per variable × 50 types = 50 GitHub API calls to read a study's state. A single `study-variables.json` file is one API call. The file is structured:

```json
{
  "schema_version": "1.0",
  "study": "va-mobile-nav-2026",
  "last_updated": "2026-05-01T14:30:00Z",
  "variables": {
    "discovered_barriers": {
      "value": [...],
      "source": { "template": "desk_research", "version": "v2.1", "date": "2026-04-15" },
      "confidence": "Strong",
      "consumed_by": ["research_brief"]
    },
    "stakeholder_constraints": {
      "value": [...],
      "source": { "template": "stakeholder_synthesis", "version": "v4.0", "date": "2026-05-01" },
      "confidence": "Strong",
      "consumed_by": ["research_brief", "service_blueprint"]
    }
  }
}
```

**Staleness detection:** Compare `source.date` of consumed variables against the `last_updated` of the consuming document. If a source variable was re-extracted after the consumer was generated, the consumer is stale. This is a JSON comparison — no database query needed.

---

## Q2: Extract phase implementation

**Recommendation: Second LLM call after generation (Option 1), using Haiku.**

### Why not embedded in the same call (Option 2)?

The current architecture has a clean separation: the LLM generates markdown, Handlebars renders the template, and the output is written to GitHub. Embedding JSON extraction in the same call means:
- The LLM must output both markdown AND JSON in a single response
- Parsing becomes fragile (where does markdown end and JSON begin?)
- The prompt gets longer, increasing cost on the primary Sonnet call
- If extraction fails, you lose the markdown too (or need retry logic that re-runs the expensive call)

### Why not both (Option 3)?

Option 3 is Option 1 with extra complexity. The markdown IS for humans. The JSON IS for the system. They're generated separately because they serve different audiences.

### Proposed implementation

```
Current pipeline:
  YAML parse → LLM generate (Sonnet) → Handlebars render → footer → GitHub write

Proposed pipeline:
  YAML parse → LLM generate (Sonnet) → Handlebars render → footer → GitHub write
                                                                   ↓
                                                          LLM extract (Haiku) → variables JSON → GitHub write + Postgres upsert
```

The Extract call receives:
- The rendered markdown output (what was just generated)
- The YAML config's `emits` specification (what variables to extract)
- The study's existing `study-variables.json` (to merge, not replace)

The Extract prompt is simple and structured: "Given this document, extract these specific variables as JSON. Follow this schema exactly." This is a structured extraction task — Haiku excels at it.

### Cost estimate

- Generate: Sonnet, ~8K output tokens, ~$0.12 per document
- Extract: Haiku, ~2K output tokens, ~$0.005 per document
- Extract adds ~4% to per-document cost

### Where it hooks into the code

In `yamlProcessor.js`, after line 127 (`createOrUpdateFileOnGitHub`), add:

```javascript
// Extract phase (if YAML defines emits)
if (yamlConfig.emits) {
  const extractedVars = await extractVariables(fullContent, yamlConfig.emits, inputValues);
  await writeStudyVariables(baseFolder, extractedVars);
}
```

This is ~20 lines of new code in yamlProcessor + a new `variableExtractor.js` helper. The existing pipeline is untouched — Extract is appended, not inserted.

---

## Q3: Pool semantics

**Recommendation: Aggregate collections with typed entries.**

### The problem with individual variables

`atomic_nuggets` from a 3-participant study might be 30-50 items. Individual variables would mean 50 entries in `study-variables.json`, each with its own source/confidence metadata. That's noise.

### The problem with flat aggregates

A single `nugget_pool` array loses the per-nugget metadata (which participant, which session, severity, type). Analysis templates need to query: "give me all pain_point nuggets from PT-001 and PT-003."

### Proposed structure: typed collection with queryable entries

```json
{
  "atomic_nuggets": {
    "value": [
      {
        "id": "nugget-001",
        "type": "pain_point",
        "severity": 3,
        "text": "User couldn't find prescriptions after tab change",
        "participant": "PT-001",
        "session": "session-01",
        "timestamp": "00:04:28",
        "linked_barrier": "target_barriers.nav_confusion",
        "linked_question": "research_questions.q1"
      }
    ],
    "source": { "template": "session_summary", "version": "v3.0", "dates": ["2026-05-10", "2026-05-11", "2026-05-12"] },
    "confidence": "varies_per_entry",
    "pool": true
  },
  "validated_themes": {
    "value": [
      {
        "id": "theme-001",
        "label": "Navigation hierarchy conflicts with mental model",
        "evidence_count": 12,
        "participants": ["PT-001", "PT-002", "PT-003"],
        "confidence": "Strong",
        "nugget_refs": ["nugget-001", "nugget-007", "nugget-012"]
      }
    ],
    "source": { "template": "affinity_mapping", "version": "v3.2", "date": "2026-05-15" },
    "pool": true
  }
}
```

The `pool: true` flag tells the Transform phase to treat this as a queryable collection, not a single value. Analysis templates receive the full pool and select what they need via their prompt instructions (which already do this — "use the session summaries to find patterns").

**Key decision:** Nuggets link back to barriers and questions via `linked_barrier` and `linked_question` references. This is the patent's role transformation made concrete — a barrier discovered in desk_research is tested via a task scenario and validated (or refuted) by a nugget.

---

## Q4: Staleness granularity

**Recommendation: Hybrid (Option 3) — document changes mark stale, variable changes auto-regenerate where safe.**

### Why not "any upstream change" (Option 1)?

Too aggressive. If the research plan is regenerated with a minor timeline tweak, all 7 analysis templates shouldn't be marked stale. The analysis templates never consumed `study_timeline` — they consumed `research_objectives` and `target_barriers`, which didn't change.

### Why not "only consumed variables" (Option 2)?

Too permissive in some cases. If a session summary is regenerated, the `atomic_nuggets` it emits might be identical (same findings, different wording). But we can't know that without re-running Extract and comparing. Better to err on the side of marking stale and letting the researcher decide.

### Proposed staleness rules

**Tier 1 — Auto-stale (always mark):**
When a template is regenerated, mark all downstream documents that consumed ANY variable from it as "potentially stale." This is a flag in the Postgres index, not an automatic regeneration.

**Tier 2 — Variable-diff stale (granular):**
After Extract runs on the regenerated document, compare the new variables against the old ones (value hash comparison). If consumed variables didn't change, remove the stale flag. If they did change, escalate to "confirmed stale."

**Tier 3 — Auto-regenerate (safe cases only):**
Only for templates where:
- All upstream variables are present
- The template has been generated at least once before
- The researcher has opted in to auto-cascade

Initially, Tier 3 is disabled. Alpha ships with Tier 1 only (flag stale, researcher decides). Tier 2 comes when Extract is reliable. Tier 3 comes when the team trusts the cascade.

### Implementation in Slack

When a document is flagged stale, the bot sends an ephemeral message: "Your affinity map may be outdated — session summary PT-003 was regenerated. Re-run `/qori-analyze` to update." This is a notification, not an automatic action.

---

## Q5: Confidence propagation

**Recommendation: Hybrid (Option 3) — track upstream confidence as floor, generate template-specific confidence on top.**

### The problem with inheritance

If affinity mapping says theme X is "Strong" and persona generator builds on it, blindly inheriting "Strong" masks the additional uncertainty that persona aggregation introduces. A theme might be strongly evidenced but the persona grouping built on it could still be weak (e.g., only 1 of 3 participants exhibits the pattern).

### The problem with fresh-only

If persona generator ignores upstream confidence entirely, it might rate its own output "Strong" while building on a "Limited" theme. That's worse — it hides fragility.

### Proposed confidence model

Each variable carries two confidence fields:

```json
{
  "confidence_upstream": "Strong",
  "confidence_template": "Moderate",
  "confidence_effective": "Moderate",
  "confidence_reasoning": "Theme is Strong (3/3 participants), but persona aggregation is Moderate (pattern based on navigation preference without behavioral diversity)"
}
```

**Rules:**
- `confidence_effective` = min(confidence_upstream, confidence_template)
- The LLM generates `confidence_template` based on its own assessment
- `confidence_upstream` is inherited from consumed variables
- `confidence_effective` is what gets displayed

This means a "Strong" upstream theme + "Moderate" persona aggregation = "Moderate" effective confidence. The floor prevents inflation. The template-specific assessment prevents false inheritance.

**For alpha:** Skip the two-field model. Just generate template-specific confidence (current behavior). Add upstream tracking in v2 when the variable store exists.

---

## Q6: GET phase implementation impact on existing code

### Current architecture (Generate only)

```
yamlProcessor.js:processYamlTemplate()
  ├── yaml.load()                     → parse YAML config
  ├── executeAiGenerationTasks()      → LLM calls (parallel via Promise.all)
  ├── generateOutputTemplate()        → Handlebars render
  ├── buildTraceabilityFooter()       → append metadata
  └── createOrUpdateFileOnGitHub()    → write to GitHub
```

Lines of code: yamlProcessor.js is 135 lines. langchain.js is 147 lines (68 commented out). The core pipeline is ~60 lines of active code.

### Minimum change (alpha-viable)

Add Extract phase only. No Transform (Transform happens within Generate prompts, which already do it — e.g., affinity mapping already transforms nuggets into themes).

**New files:**
- `backend/src/helpers/variableExtractor.js` (~80 lines) — calls Haiku with rendered output + emits spec, parses JSON response, writes to GitHub
- `backend/src/helpers/studyVariables.js` (~60 lines) — read/write/merge study-variables.json from GitHub

**Modified files:**
- `yamlProcessor.js` — add ~15 lines after GitHub write to call Extract if `yamlConfig.emits` exists
- YAML templates — add `emits:` block to each template (declarative, no prompt changes)

**Total: ~155 new lines + 15 modified lines.** The existing pipeline is untouched — Extract is appended.

### Maximum change (full GET)

- Variable store with staleness detection
- PostgreSQL index table + migration
- Transform phase as explicit pre-processing (read upstream variables, inject into Generate prompt)
- Slack notifications for stale documents
- Auto-cascade for safe regeneration
- Dashboard showing study variable state

**Estimate: 800-1200 lines of new code**, touching yamlProcessor, langchain, GitHub helpers, events.js, and requiring 2-3 new database migrations.

### Recommended scope for alpha

**Phase 1 (alpha):** Add `emits:` declarations to YAML templates. No extraction code — just document what each template WOULD emit. This is free (YAML-only changes) and locks the variable spec before building the extraction pipeline.

**Phase 2 (post-alpha):** Implement Extract phase. Write `study-variables.json` to GitHub. This is the minimum viable GET — Generate exists, Extract is new, Transform stays implicit.

**Phase 3 (v2):** Add staleness detection, Postgres index, Slack notifications, upstream variable injection into Generate prompts (explicit Transform).

---

## Q7: Backward compatibility

**Yes — GET can be added incrementally. No template rewrites needed.**

### Why incremental works

The Extract phase reads the *output* of a template, not the template itself. A template that's already been translated (research_readout v5.4.1, affinity_mapping v3.2, etc.) produces markdown. The Extract phase processes that markdown to pull out variables. The template doesn't need to change — only an `emits:` block needs to be added to the YAML.

### What "retrofitting" looks like per template

```yaml
# Added to research_readout.yaml (no other changes)
emits:
  - type: prioritized_findings
    extract_from: "numbered findings sections (## 01 through ## 05)"
  - type: prioritized_recommendations
    extract_from: "Recommended actions section"
  - type: decision_inputs
    extract_from: "Summary section bottom-line callout"
```

This is a declarative spec that tells the Extract phase what to look for. The Generate prompt, output template, and handler are untouched.

### The one exception: upstream variable injection

Currently, templates consume `combined_file_content` (raw file text). To implement Transform (injecting upstream variables into prompts), the handler would need to:
1. Read `study-variables.json` for the study
2. Add upstream variables to the `inputValues` object
3. Pass them to the Generate prompt

This requires handler changes — but only in `researchSynthesisHandler.js` (one handler serves all 7 synthesis templates). The change is ~20 lines: read variables file, merge into inputValues.

### Migration order

Templates can be retrofitted in any order. But for maximum cascade value, work from the top:
1. `session_summary` (emits atomic_nuggets — feeds everything downstream)
2. `affinity_mapping` (emits validated_themes — feeds 5 analysis templates)
3. `research_readout` (emits prioritized_findings — feeds targeted_readouts)

---

## Q8: Model selection per phase

**Recommendation: Generate=Sonnet, Extract=Haiku, Transform=implicit (no separate call).**

### Generate: Sonnet (current)

Correct. Generation requires reasoning, editorial judgment, design language adherence, and conditional output. Sonnet is the right tier. No change.

### Extract: Haiku

Correct. Extraction is structured and deterministic: "Read this markdown, find these sections, output this JSON schema." Haiku handles structured extraction reliably at ~1/12th the cost of Sonnet.

**Implementation note:** Use the Anthropic SDK directly for Extract, not LangChain. LangChain adds overhead (template parsing, Nunjucks rendering) that Extract doesn't need. A simple `anthropic.messages.create()` call with a JSON schema instruction is cleaner:

```javascript
const extraction = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 2048,
  messages: [{
    role: 'user',
    content: `Extract these variables from the document below.\n\nSchema: ${JSON.stringify(emitsSpec)}\n\nDocument:\n${renderedOutput}\n\nRespond with ONLY valid JSON.`
  }]
});
```

### Transform: No separate call

Correct. Transform happens within the Generate prompt. When the persona generator prompt says "Use the session summaries to find behavioral patterns and group participants who share goals," that IS the Transform — the LLM reads upstream data and reshapes it for the persona context. Making Transform an explicit pre-processing step would add cost and latency without improving quality.

**One future exception:** If upstream variables become structured JSON (from the Extract phase), a Transform step could pre-format them into the prompt more efficiently than dumping raw JSON. But for alpha, combined_file_content (raw markdown) is the input format, and the LLM handles transformation inline.

### Cost model

| Phase | Model | Tokens (avg) | Cost per doc |
|-------|-------|-------------|-------------|
| Generate | Sonnet | 8K output | ~$0.12 |
| Extract | Haiku | 2K output | ~$0.005 |
| Transform | (implicit) | 0 | $0 |
| **Total** | | | **~$0.125** |

Extract adds 4% cost. Negligible.

---

## Q9: Implementation phasing

### Alpha (MUST ship — load-bearing)

These changes don't implement GET but prepare for it without blocking alpha:

1. **`emits:` declarations in YAML templates** — Add the variable spec to each template as a YAML block. No code reads this yet. It's documentation-as-code that locks the variable contract before building the pipeline. Ship with each template translation (we're doing those anyway).

2. **Filename convention standardization** — Already done (this session). Study-slug-first filenames enable the variable store to locate artifacts predictably.

3. **Single-task consolidation** — Already done for translated templates. Single-task templates produce cleaner output for Extract to parse.

That's it for alpha. The current Generate-only pipeline works. Templates produce correct documents. Researchers can use the full suite. GET is not load-bearing for alpha.

### v2 (first post-alpha sprint)

4. **`variableExtractor.js` + `studyVariables.js`** — Implement Extract phase. After each Generate, Haiku extracts variables and writes `study-variables.json` to the study folder in GitHub. This is the keystone change — it turns generated documents into queryable knowledge.

5. **`session_summary` emits atomic_nuggets** — The highest-value extraction. Session summaries feed ALL analysis templates. Extracting structured nuggets means analysis templates can receive typed observations instead of raw markdown.

6. **`affinity_mapping` emits validated_themes** — Second-highest value. Themes feed 5 downstream templates.

7. **Staleness detection (Tier 1)** — When a document is regenerated, flag downstream documents as potentially stale. Slack notification to researcher. No auto-regeneration.

### v3 (when cascade is trusted)

8. **Upstream variable injection** — Modify `researchSynthesisHandler.js` to read `study-variables.json` and inject upstream variables into Generate prompts. This is the Transform phase made explicit.

9. **PostgreSQL index table** — Migration to create `study_variables` table. Index for cross-study queries and dashboard.

10. **Staleness Tier 2** — Variable-diff comparison. Only mark stale if consumed variables actually changed.

11. **Auto-cascade (Tier 3)** — Opt-in automatic regeneration for safe templates.

### What ORDER changes should ship in

```
Alpha (now):
  [done] Filename convention
  [done] Single-task consolidation for translated templates
  [todo] Add emits: blocks to translated templates (ship with remaining translations)

v2 sprint 1:
  variableExtractor.js (Haiku extraction)
  studyVariables.js (GitHub read/write)
  yamlProcessor.js hook (call Extract after Generate)
  session_summary emits
  affinity_mapping emits

v2 sprint 2:
  Remaining template emits (persona, journey, usability, readout, etc.)
  Staleness Tier 1 (flag + notify)
  Slack notification UX

v3:
  Upstream injection (Transform)
  Postgres index
  Staleness Tier 2-3
  Dashboard
```

---

## Open questions from cascade map — my takes

### Q1: Should desk_research feed research_brief?

**Yes.** The brief is the confluence point. If desk research discovered barriers, the brief should reference them when setting scope. Implementation: desk_research emits `discovered_barriers` and `knowledge_gaps`; brief's Generate prompt includes them if present. Optional input — brief works without desk research, but is better with it.

### Q2: Is Discovery Synthesis (Cycle 2) needed as a dedicated template?

**No, not for alpha.** The brief already serves this function — it reconciles desk research + stakeholder input into a research scope. A dedicated Discovery Synthesis template would add value if studies routinely have 3+ discovery sources (desk research + survey + stakeholder + competitive analysis). For now, the brief absorbs Cycle 2.

### Q3: Should stakeholder_synthesis be required for service_blueprint?

**Strongly recommended, not required.** The service blueprint's unique value is cross-stream synthesis (user research + stakeholder backstage). Without stakeholder data, it's just a journey map with system annotations. But requiring it blocks researchers who don't have stakeholder access. Make it: warn if missing, proceed if confirmed.

### Q4: Where does survey_synthesis fit?

**Cycle 7 analysis layer.** It consumes survey response data (analogous to session summaries consuming transcripts) and emits `survey_findings`, `discovered_barriers`, `discovered_metrics`. It should feed into the same analysis pool as session summaries. Currently mis-routed under `/qori-plan`; should be accessible from the synthesis modal.

### Q5: Where does desk_research fit?

**Cycle 0 — entry point.** It's the only template with zero upstream dependencies. It should be runnable before any study is created (or as the first act of study creation). Currently it's a standalone command; that's correct.

---

## Summary of recommendations

| Question | Recommendation |
|----------|---------------|
| Q1: Variable storage | JSON in qori-studies repo + Postgres index table |
| Q2: Extract implementation | Second LLM call (Haiku), after Generate |
| Q3: Pool semantics | Aggregate collections with typed entries |
| Q4: Staleness | Hybrid — flag on document change, remove flag if variables unchanged |
| Q5: Confidence propagation | Hybrid — upstream floor, template-specific assessment, effective = min |
| Q6: Minimum code change | ~155 new lines + 15 modified (Extract only) |
| Q7: Backward compatibility | Fully incremental — add `emits:` blocks, no template rewrites |
| Q8: Model selection | Generate=Sonnet, Extract=Haiku, Transform=implicit |
| Q9: Alpha scope | `emits:` declarations only — no extraction code until v2 |

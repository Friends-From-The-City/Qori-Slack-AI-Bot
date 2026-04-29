# Synthesis Bugs Investigation — 2026-04-29

Investigation-only report. No fixes applied.

---

## Bug 1: `/qori-synthesis` → Usability Issues hangs indefinitely

### Root Cause: Parallel execution of chained AI tasks

`usability_issues_extractor.yaml` has **6 sequentially-dependent tasks** where each task's prompt references the output of the previous task via `{{ai_generated.*}}`. But `executeAiGenerationTasks` in `langchain.js:117-138` runs all tasks with `Promise.all` — they all launch simultaneously before any results exist.

**Why only Usability Issues is affected:** Every other working synthesis template (affinity_mapping, journey_mapping, personas, etc.) uses **1 single consolidated task**. Affinity mapping's own YAML comments (lines 316-330) document that it was redesigned from 6 tasks to 1 specifically because of this same parallel-execution problem. Usability Issues was never given that same redesign.

### Failure chain (step by step)

1. `researchSynthesisHandler.js:620` dispatches `usability_issues_extractor.yaml` to `processYamlTemplate`
2. `yamlProcessor.js:36` calls `executeAiGenerationTasks` with all 6 tasks
3. `langchain.js:117` launches all 6 via `Promise.all`
4. Tasks 2-6 reference `{{ai_generated.file_discovery_summary}}`, `{{ai_generated.usability_scope_analysis}}`, etc.
5. Nunjucks (`langchain.js:123`, configured with `autoescape: false`) silently renders all `{{ai_generated.*}}` references as **empty string** — no error raised
6. Tasks 2-6 send prompts with empty context to the LLM → produce garbage or fail at `PromptTemplate.format` (`langchain.js:130`) because the regex at line 126 (`\w+`) doesn't match dotted variable names like `ai_generated.task_id`
7. If any task throws, `Promise.all` rejects
8. `researchSynthesisHandler.js:700-710` **swallows the error** — it catches, logs to console, and posts an ephemeral "Analysis is being processed..." message to the user. No result ever arrives. The user sees the processing message indefinitely.

### The task dependency chain

| Task # | task_id | References from prior tasks |
|--------|---------|----------------------------|
| 1 | `file_discovery_summary` | None (independent) |
| 2 | `usability_scope_analysis` | `{{ai_generated.file_discovery_summary}}` (line 137) |
| 3 | `issue_identification` | `{{ai_generated.usability_scope_analysis}}` (line 160) |
| 4 | `behavior_expectation_analysis` | `{{ai_generated.issue_identification}}` (line 193) |
| 5 | `severity_impact_assessment` | `{{ai_generated.behavior_expectation_analysis}}` (line 225) |
| 6 | `fix_recommendation_generation` | `{{ai_generated.severity_impact_assessment}}` + `{{ai_generated.behavior_expectation_analysis}}` (lines 263-264) |
| 6b | `evidence_quote_validation` | `{{ai_generated.behavior_expectation_analysis}}` + `{{ai_generated.severity_impact_assessment}}` (lines 306-307) |

### Secondary issue: output_template uses non-existent auto_variables

The `output_template` (lines 362-397) references `{{num_issues}}`, `{{severity_overview}}`, and `{{github_file_link}}`. These are defined in `auto_variables` (lines 495-500) as computed expressions, but `yamlProcessor.js` **never reads or processes `auto_variables`**. All three render as empty strings in the Handlebars output.

### Suggested fix

**Option A (recommended — matches proven pattern):** Consolidate all 6 tasks into 1 single comprehensive prompt, exactly as `affinity_mapping.yaml` was redesigned (it documents this decision in its own comments). This is the pattern that works across all other synthesis templates. Remove `auto_variables` references from `output_template` or replace with static text.

**Option B (deeper fix):** Change `executeAiGenerationTasks` in `langchain.js` to detect chained dependencies (tasks referencing `ai_generated.*`) and run those sequentially, accumulating results. More correct but higher risk and increases latency.

| | |
|---|---|
| **Fix complexity** | **S** (Option A — YAML-only rewrite of the prompt) or **M** (Option B — langchain.js refactor) |
| **Risk** | Option A: Low (proven pattern, YAML-only). Option B: Medium (changes execution model for all templates, needs latency testing) |
| **Files to change** | Option A: `beta-test/YAML Templates/usability_issues_extractor.yaml` only. Option B: `backend/src/helpers/langchain.js` lines 117-140 |

---

## Bug 2: Service Blueprint missing stakeholder perspective

### Root Cause: Stakeholder file discovery fails — `file_name` is NULL in the database

The modal's "Stakeholder Interviews" section has a file picker, but it shows "0 files available" / "No stakeholder interview guides available for this study" even when stakeholder files exist in qori-studies.

**The discovery chain:**

1. `researchSynthesisHandler.js:120-130` calls `getStudyStakeholderGuide(selectedStudy.name)` to populate the modal
2. `study-status.service.js:102-127` queries: `WHERE file_name ILIKE '%stakeholder%' AND study_name = studyName`
3. This returns `[]` because...

**Problem A — `file_name` is NULL when stakeholder guides are created.**

`events.js:2359-2365` calls `addStudyStatus()` for the stakeholder interview guide but does NOT pass `file_name`:

```js
await addStudyStatus({
  study_name: studyName,
  path: url,           // GitHub HTML URL
  status: 'created',
  created_by: body.user?.id || body.user_id || null,
  // file_name is NOT passed
});
```

The fallback in `study-status.service.js:9-12` tries to extract `file_name` from the URL's last path segment, but the extracted name may not contain the word "stakeholder" depending on the actual file naming. If the fallback fails or produces a non-matching name, `file_name` is effectively NULL → the `ILIKE '%stakeholder%'` filter returns nothing.

**Problem B — `study_name` exact-match fragility.**

The query also requires `study_name = studyName` (exact string match). `study_name` is written from the Slack modal submission context. `selectedStudy.name` is read back from the `research_studies` table. Any whitespace, capitalization, or encoding difference between these two strings causes zero rows returned.

**Comparison: why session summaries work but stakeholder guides don't:**

| Aspect | Session Summaries (works) | Stakeholder Guides (broken) |
|--------|--------------------------|----------------------------|
| Storage table | `session_summaries` | `research_status` |
| Lookup key | `study_id` (integer FK — exact, reliable) | `study_name` (string) + `file_name ILIKE` (pattern) |
| Write path | Always writes correct `study_id` FK | Writes `study_name` string; `file_name` often NULL |

**Problem C (secondary) — `blueprint_scope` never provided.**

`service_blueprint.yaml:185` references `{{blueprint_scope}}` but `analysisData` (line 604-615) never sets it. The modal has no scope selector UI. The LLM receives a blank scope.

### What the YAML template expects vs. what it gets

| Variable | Used in prompt? | Provided by handler? | Status |
|----------|----------------|---------------------|--------|
| `selected_study` | Yes (line 184) | Yes (line 606, after our fix 1.4) | OK |
| `blueprint_scope` | Yes (line 185) | No | Missing — renders empty |
| `combined_file_content` | Yes (line 186) | Yes (line 614) | OK structure, but empty of stakeholder content due to discovery bug |
| `include_user_research` | Declared (line 37) | No | Dead variable — never used in prompt |
| `include_stakeholder_research` | Declared (line 38) | No | Dead variable — never used in prompt |
| `include_journey_map` | Declared (line 39) | No | Dead variable — never used in prompt |
| `discovered_files` | Declared (line 41) | No | Dead variable — never used in prompt |
| `current_date` | Yes, in prompt (line 318) | Yes (after our fix 1.3) | OK |

### Suggested fix

**Fix 1 — Stakeholder file discovery (the primary bug):**

Option A (quick fix): In `events.js:2360`, explicitly pass `file_name` with a guaranteed stakeholder-containing name:
```js
file_name: renderedYaml.result.path?.split('/').pop() || 'stakeholder_interview_guide.md',
```
Complexity: **XS**. Risk: Low — only changes the write path.

Option B (robust fix): Store stakeholder guides keyed by integer `study_id` (matching the session summaries pattern) instead of relying on fragile string+pattern matching. Complexity: **M**. Risk: Medium — schema/query changes.

**Fix 2 — `blueprint_scope` default:**
Hardcode `blueprint_scope: 'end_to_end'` in `analysisData` for now. Complexity: **XS**. Risk: Low.

| | |
|---|---|
| **Fix complexity** | **XS-S** (quick fix: explicit file_name + scope default) or **M** (robust fix: align storage with session_summaries pattern) |
| **Risk** | Low for the quick fix. Medium for schema changes. |
| **Files to change** | Quick fix: `events.js` (~line 2360), `researchSynthesisHandler.js` (~line 604). Robust fix also: `study-status.service.js`, possibly a migration |

---

## Related finding: `extractAiResponsesFromYaml` ghost import

`researchSynthesisHandler.js:7` imports `extractAiResponsesFromYaml` from `yamlProcessor`, but `yamlProcessor.js:77` only exports `processYamlTemplate`. The import resolves to `undefined`. It's never called so it doesn't crash, but it's dead code.

---

## Summary table

| Bug | Root cause | Complexity | Risk | Key files |
|-----|-----------|-----------|------|-----------|
| Usability Issues hangs | 6 chained tasks run in parallel; `Promise.all` + Nunjucks silently drops `ai_generated.*` refs; error swallowed by handler | S (consolidate to 1 task) | Low | `usability_issues_extractor.yaml` |
| Service Blueprint missing stakeholder | `file_name` NULL on write → `ILIKE '%stakeholder%'` query returns nothing; `blueprint_scope` never provided | XS-S (explicit file_name + scope default) | Low | `events.js`, `researchSynthesisHandler.js`, `study-status.service.js` |

---

## Note for ALPHA_POLISH.md

The synthesis modal shows duplicate session notes with timestamps (17:44, 17:45, 17:51, 17:52, 17:53, 17:54, 17:56) — stakeholder/observer notes appear to be auto-generated multiple times and accumulating. Separate issue from the bugs above. Needs its own investigation.

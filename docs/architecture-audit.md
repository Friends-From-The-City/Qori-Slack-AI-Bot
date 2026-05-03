# Architecture Audit — May 3, 2026

Post-discovery-workspace sprint. Covers dead code, duplication, modal inconsistency, tech debt, architectural drift, risk areas, and variable/schema cleanup.

---

## 1. Dead Code

### Unused imports in events.js (lines 1-57)

| Line | Symbol | Status |
|------|--------|--------|
| 4 | `pathLib` | Never used |
| 10 | `runRAG` | Never called (RAG disabled) |
| 11 | `indexRepoQueue` | Never used |
| 12 | `runRagV2` | Never called |
| 13 | `buildPromptFromYaml` | Never called |
| 15 | `studySetupModalStartResearch` | Never used |
| 43 | `processObserverYamlTemplate` | Imported but not called in events.js (used in observeSessionHandler.js) |
| 44 | `studyParticipantService` | Never used |
| 45 | `sessionObserverService` | Never used |
| 51 | `buildSessionNotesView` | Never used |

**10 dead imports.** Safe to remove.

### Dead files

| File | Status | Notes |
|------|--------|-------|
| `backend/src/helpers/rag.js` | Fully commented out | Entire file is comments. Imported in events.js and app.js but never called |
| `backend/src/helpers/ragV2.js` | Exports `runRagV2` | Imported in events.js but never called |
| `backend/src/helpers/yamlPrompt.js` | Exports `buildPromptFromYaml` | Imported in events.js but never called |

### Unused exports

| File | Export | Status |
|------|--------|--------|
| `pdfProcessor.js` | `processSlackFile` (singular) | Never imported. Only `processSlackFiles` (plural) is used |
| `variableExtractor.js` | `loadSchema`, `buildExtractionPrompt`, `parseExtractionResponse`, `validateExtraction` | Internal helpers exported but never imported externally |

---

## 2. Overlap and Duplication

### `extract()` helper duplicated across handlers

The `extract(blockId, actionId)` helper function is copy-pasted in at least 3 handlers in events.js (research_brief_modal, discussion_guide_modal, others). Each has slight differences:

- **research_brief_modal** returns full `selected_option` object
- **discussion_guide_modal** returns `selected_option.value` (just the value string)

**Recommendation:** Extract to shared utility in `backend/src/helpers/slack/ui/extractModalValues.js`.

### Discovery variables loaded twice for briefs

Two parallel loading paths exist for discovery variables in the brief flow:

1. **Brief handler** (events.js:1625-1650) manually calls `loadDiscoveryArtifacts` + `aggregateDiscoveryVariables`
2. **yamlProcessor.js** Transform phase (line 101-107) calls `readUpstreamDiscoveryVariables` via the YAML `consumes:` block

These use different merge logic and could produce different results. Currently the brief handler's manual load takes precedence because it injects `upstream_*` variables before `processYamlTemplate` runs. The yamlProcessor Transform phase then tries to load from study-scoped variables (which won't have discovery data) and fails silently.

**Recommendation:** Brief handler's manual discovery loading is correct for the current architecture (researcher selects which artifacts to include). The yamlProcessor Transform phase for the brief template is redundant — `research_brief.yaml` should NOT have a `consumes:` block that triggers study-scoped variable reads. Either remove `consumes:` from the brief YAML or make the Transform phase aware that discovery injection already happened.

### Multiple GitHub read patterns

- `fetchFileFromRepo(repo, path, filename)` — fetches from config repo by folder + filename
- `fetchFileFromRepoByPath(repo, fullPath)` — fetches from any repo by full path
- `readFolderContents(folderPath, repo)` — lists directory
- `readFolders(folderPath, repo)` — recursive directory read

Not duplication — each has a distinct purpose. No action needed.

---

## 3. Modal Handler Inconsistency

### Study selector patterns

| Modal | Block type | Selection method |
|-------|-----------|-----------------|
| uploadDeskResearchModal | `input` block | `static_select` |
| uploadStakeholderNotesModal | `actions` block | `static_select` |
| uploadSurveyDataModal | `actions` block | `static_select` |
| researchBriefModal | N/A | Text input (creates new study) |
| discoverModal | N/A | No study selector (pre-study) |
| studySetupModal | `input` block | `static_select` |

**Issue:** Desk research uses `input` block, stakeholder and survey use `actions` block. This changes how values are extracted in submission handlers.

### Error handling patterns

| Handler | Error notification method |
|---------|--------------------------|
| research_brief_modal | `postEphemeral` for errors, DM for success |
| discussion_guide_modal | Silent (logs only) |
| discover_modal | `postMessage` to channel |
| research_plan_modal | Silent (logs only) |

**No consistent pattern.** Some users get no feedback on failure.

### Async modal builders

Only `researchBriefEntryModal.js` is async (calls `loadDiscoveryArtifacts`). All others are synchronous. The `/qori-brief` command handler correctly `await`s it (events.js:985).

### Inline vs delegated handlers

**Inline in events.js (code smell — 200+ lines each):**
- `research_brief_modal` (lines 1485-1659)
- `discussion_guide_modal`
- `research_plan_modal`
- `upload_desk_research_modal`
- `upload_stakeholder_notes_modal`
- `upload_survey_data_modal`

**Delegated to command handlers (better pattern):**
- `discover_modal` → `discoverHandler.js`
- `session_notes_submit` → `sessionNotesHandler.js`
- `analyze_notes_submit` → `analyzeNotesHandler.js`
- `readout_modal_submit` → `readoutHandler.js`

**Recommendation:** Brief modal handler should move to `commands/briefHandler.js` before cascade-aware brief work adds more complexity.

### private_metadata structure inconsistency

No shared schema. Structures range from `{}` (empty) to complex objects with study IDs, selections, and team context. Some hardcode values that should be dynamic.

---

## 4. Tech Debt

### TODOs

| File | Line | Comment | Severity |
|------|------|---------|----------|
| events.js | ~2783 | `// TODO: Now you can pass this data to your YAML processor` | Low — stale comment from original development |
| researchSynthesisHandler.js | 757 | `// TODO: Fetch participant tracker if selected` | Medium — missing feature |
| researchSynthesisHandler.js | 763 | `// TODO: Fetch research plan if selected` | Medium — missing feature |

No FIXMEs or HACKs found.

### Extraction max tokens

`variableExtractor.js` defaults to 8192 tokens. With deep schemas producing richer output, may need monitoring for truncation on large documents.

---

## 5. Architectural Drift

### CLAUDE.md claims vs reality

| Claim | Status |
|-------|--------|
| "Model resolution at langchain.js:99-114" | Accurate (lines 98-114) |
| "config/command-mapping.json not used at runtime" | Accurate |
| "RAG pipeline disabled" | Accurate — handlers return "not available yet" |
| "Discovery workspace at {team}/_discovery/" | Accurate — fully implemented |
| "Brief simplified from 15 fields to 7" | **OUTDATED** — actual count is 11-12 fields |

### cascadeReadinessBlocks.js vs YAML consumes blocks

**5 synthesis templates** have entries in `TEMPLATE_CONSUMES` (cascadeReadinessBlocks.js) but **no `consumes:` block in their YAML**:

- `journey_mapping.yaml`
- `jobs_to_be_done.yaml`
- `usability_issues_extractor.yaml`
- `design_opportunity_generator.yaml`
- `service_blueprint.yaml`

This means cascadeReadinessBlocks shows "missing variables" UI for templates that don't actually declare consumption. The UI lies about what's needed.

**Recommendation:** Add `consumes:` blocks to these 5 YAMLs, or remove their entries from cascadeReadinessBlocks.js.

### Deployment docs

`docs/internal/deployment.md` references npm scripts (`npm run validate`, `npm run deploy:staging`, etc.) that don't exist in `package.json`. Railway auto-deploys on push to main — deployment docs need rewrite.

### docs/README.md

Empty file. No entry point to documentation.

---

## 6. Risk Areas for Cascade-Aware Brief

### Brief handler complexity

The `research_brief_modal` handler in events.js (lines 1485-1659) is already 175 lines. Adding pre-population logic, discovery variable aggregation, and cascade-aware field injection will push it past 250 lines. **Should extract to `commands/briefHandler.js` first.**

### discovery_sources template variable

The `discovery_sources` table rows are built in the handler (events.js) as raw markdown strings, then injected into Handlebars templates. If artifact count grows, this string could exceed what Handlebars handles cleanly. Low risk but fragile.

### LangChain f-string sensitivity

Any upstream variable containing `{` or `}` will crash LangChain. The `formatObjectAsMarkdown` helper in discoveryLoader.js handles this, but any new variable path that bypasses this formatter will reintroduce the bug.

### Pool merge with deep objects

`studyVariables.js` merge logic (lines 193-214) does shallow array append with participant-based deduplication. Deep nested objects within array items are replaced wholesale, not recursively merged. This is correct for re-extraction (idempotent) but should be documented.

---

## 7. Variable/Schema Cleanup

### Emitted but never consumed (14 orphaned variables)

| Variable | Emitted by | Notes |
|----------|-----------|-------|
| `discovered_journeys` | desk_research | No consumer declared. Brief doesn't reference it. |
| `source_artifacts` | desk_research | Informational only — no downstream template uses it |
| `survey_findings` | survey_synthesis | Brief consumes upstream manually, not via YAML consumes |
| `sample_demographics` | survey_synthesis | Same — manual brief injection, not YAML cascade |
| `backstage_observations` | stakeholder_synthesis | Intended for service_blueprint but no consumes block there |
| `system_failure_modes` | stakeholder_synthesis | Same — service_blueprint missing consumes |
| `unexpected_patterns` | affinity_mapping | No consumer |
| `persona_design_implications` | persona_generator | No consumer |
| `study_timeline` | research_plan | No consumer |
| `risks` | research_plan | No consumer |
| `deliverables` | research_plan | No consumer |
| `prioritized_findings` | research_readout | No consumer |
| `prioritized_recommendations` | research_readout | No consumer |
| `decision_inputs` | research_readout | No consumer |

**Assessment:** Most are not dead code — they're extracted for traceability and future cascade expansion. The ones consumed manually by the brief handler (`survey_findings`, `discovered_barriers`, `stakeholder_constraints`, etc.) work via `discoveryLoader.js` aggregation, not YAML cascade. This is an intentional architecture choice for the brief (researcher selects which artifacts to include), but it means the YAML `consumes:` block on `research_brief.yaml` is misleading.

### All 14 schemas are actively referenced

No orphaned schema files. All `config/schemas/*.yaml` files are referenced by at least one YAML template `$ref`.

---

## Summary by Priority

### Fix before cascade-aware brief (high value, low effort)

1. **Extract brief handler** to `commands/briefHandler.js` (reduces events.js complexity)
2. **Remove 10 dead imports** from events.js (housekeeping)
3. **Update CLAUDE.md** field count claim
4. **Clarify brief's dual discovery loading** — document that manual loading in handler is intentional, yamlProcessor Transform for brief is a no-op

### Fix when touching adjacent code (medium priority)

5. **Add `consumes:` blocks** to 5 synthesis YAMLs (or remove from cascadeReadinessBlocks.js)
6. **Shared `extract()` helper** for modal value extraction
7. **Consistent error handling** across modal handlers
8. **Update deployment docs** for Railway

### Accept and move forward (cosmetic or intentional)

9. Dead RAG files (rag.js, ragV2.js, yamlPrompt.js) — remove when convenient, not blocking
10. Orphaned emitted variables — intentional for traceability, document the pattern
11. Modal input/actions block inconsistency — works, not worth changing existing modals
12. Private metadata structure variance — each modal has different needs, no shared schema needed

# Cascade Access Patterns

> Audit produced during Phase 5 (2026-05-15). Source: `backend/src/helpers/studyVariables.js`.

## Overview

The codebase has **seven** functions for reading cascade variables. They are not redundant — each serves a distinct purpose with different scope, granularity, and error semantics.

**Decision: no consolidation needed.** The functions are intentionally different. Direct `StudyVariable.findOne/findAll` calls in ticketHandler are appropriate for single-key lookups where loading all variables would be wasteful.

---

## Function Reference

### `readStudyVariables(studyBasePath)`

**Purpose:** Full study state snapshot. Returns ALL variables for a study.

**Defined:** `studyVariables.js:31-51`

**Inputs:** `studyBasePath: string` (URL-encoded study path)

**Returns:** Complete study variable structure:
```typescript
{
  schema_version: "2.0",
  study: string,
  last_updated: string, // ISO 8601
  variables: Record<string, { value: unknown; source: { template, version, date }; pool?: boolean }>,
  generation_snapshots: {}
}
```

**Error behavior:** Never throws. Returns empty structure with `schema_version: "1.0"` and `variables: {}`.

**Use when:** Displaying cascade readiness in modals, checking overall study state.

**Callers:**
- `planModalOpener.ts` — cascade readiness blocks
- `briefModalOpener.ts` — cascade readiness blocks
- `discussionGuideHandler.ts` — cascade readiness blocks
- `researchSynthesisHandler.ts` — cascade readiness blocks
- `analyzeNotesHandler.ts` — cascade context display

---

### `readUpstreamVariables(studyBasePath, consumesSpec)`

**Purpose:** Fetch specific variables consumed by a YAML template. Applies field normalization.

**Defined:** `studyVariables.js:285-341`

**Inputs:**
- `studyBasePath: string`
- `consumesSpec: Array<{key, required, inject_as?, source?}>`

**Returns:** `Record<string, { value, source, confidence? }>` — keyed by variable key. Empty `{}` if nothing found.

**Error behavior:** Never throws. Logs warning for missing required variables.

**Special:** Applies `normalizeVariableFields()` for backward-compatible field renames and flat-to-object upgrades.

**Use when:** Template processing needs specific upstream variables injected.

**Callers:**
- `yamlProcessor.js` (via `processYamlTemplate`) — all template-processing handlers
- `planHandler.ts` — direct call for cascade variables
- `briefHandler.ts` — direct call for discovery variables
- `readoutHandler.ts` — direct call for upstream variables

---

### `readDiscoveryVariables(team, discoveryType)`

**Purpose:** Full discovery state for a team + discovery type. Discovery-scoped equivalent of `readStudyVariables`.

**Defined:** `studyVariables.js:350-370`

**Inputs:** `team: string`, `discoveryType: string` (`'desk-research'`, `'stakeholder-interviews'`, `'survey-synthesis'`)

**Returns:** Discovery variable structure with `artifacts` keyed by artifact ID.

**Error behavior:** Never throws. Returns empty discovery structure on failure.

**Use when:** Loading all discovery artifacts for display or selection.

**Callers:**
- `briefHandler.ts` — loading discovery artifacts for brief enrichment
- `briefModalOpener.ts` — discovery artifact selection in modal

---

### `readUpstreamDiscoveryVariables(team, discoveryType, discoveryArtifactId, consumesSpec)`

**Purpose:** Fetch specific discovery variables consumed by a template. Discovery-scoped equivalent of `readUpstreamVariables`.

**Defined:** `studyVariables.js:436-454` (internal, not exported)

**Callers:** `yamlProcessor.js:117` only (discovery template consumption).

---

### `searchVariablesAcrossStudies(variableKeys, searchTerms, options)`

**Purpose:** Cross-study full-text search for `/qori-ask`.

**Defined:** `studyVariables.js:752-788`

**Inputs:** `variableKeys: string[]`, `searchTerms: string[]`, `options: {studyName?, limit?, offset?}`

**Returns:** `{ rows, total }` — paginated raw Sequelize rows.

**Callers:** `askHandler.ts:336, 388`

---

### Direct `StudyVariable.findOne()` / `StudyVariable.findAll()`

**Purpose:** Single-key lookups where loading all variables is wasteful.

**Callers (all in `ticketHandler.ts`):**
- Line 273: Load ticket candidates for a specific audience
- Line 411: Load ticket candidates during issue creation
- Line 417: Load prioritized_findings to link with tickets
- Line 423: Load atomic_nugget_detail pool for ticket enrichment

**Also in `readoutHandler.ts:87`:** Check if `prioritized_findings` exists.

**Appropriate use:** These are efficient single-key queries. Converting to `readStudyVariables()` would load all variables just to check one — wasteful.

---

## Architecture Notes

1. **Postgres-first, GitHub fallback.** All read functions try Postgres first; fall back to GitHub JSON silently.
2. **Dual storage.** Postgres is authoritative. GitHub JSON files are non-authoritative debugging artifacts.
3. **Scope isolation.** Discovery variables use synthetic `study_name` pattern `discovery:{team}:{type}` and `scope: 'discovery'`.
4. **Field normalization.** Only `readUpstreamVariables` applies `normalizeVariableFields()` — field renames and flat-to-object upgrades for backward compatibility.
5. **Contract enforcement.** YAML `consumes` blocks declare required variables; `yamlProcessor.js` throws `TemplateContractError` if required variable missing.

## When to Use Which

| Scenario | Function |
|----------|----------|
| Display cascade readiness in a modal | `readStudyVariables()` |
| Inject variables into a YAML template | `readUpstreamVariables()` |
| Check if one specific variable exists | `StudyVariable.findOne()` |
| Load pool items for one variable key | `StudyVariable.findAll()` |
| Search across studies by text | `searchVariablesAcrossStudies()` |
| Load all discovery artifacts for a team | `readDiscoveryVariables()` |
| Inject discovery variables into a template | `readUpstreamDiscoveryVariables()` |

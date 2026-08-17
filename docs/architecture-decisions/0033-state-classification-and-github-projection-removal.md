# ADR 0033: State Classification and GitHub Projection Removal

**Status:** Accepted
**Date:** 2026-08-17
**Decision drivers:** Platform Hardening Phase 1 (PH-1) — remove state ambiguity, establish authoritative persistence classification.

## Context

Qori persists state across multiple systems: Postgres tables, GitHub repositories, Slack messages, and Redis caches. Some persistence locations serve dual roles or have unclear authority, creating ambiguity about which system is the source of truth for a given piece of state.

Specifically:
- `study_variables` (Postgres) is the authoritative cascade variable store, but GitHub `.variables/*.json` files were also written as "debugging artifacts."
- The GitHub files were never read at runtime (the GitHub read fallback was dead code), but their existence implied they might be consulted.
- The discovery-variables.json file grew large enough to trigger GitHub Contents API 422 errors, confirming the write was both unnecessary and problematic.
- No formal classification existed for the different types of persisted state.

## Decision

### State Classifications

Every persisted object in Qori belongs to exactly one classification:

| Classification | Definition | Authority | Examples |
|---|---|---|---|
| **A. Canonical Domain State** | Core business entities and their relationships | Postgres is sole authority | `projects`, `research_studies`, `project_members` |
| **B. Canonical Evidence State** | Research evidence with identity, provenance, and lineage | Postgres is sole authority | `evidence_source`, `evidence_construct`, `evidence_relationship`, `survey_field_schema`, `survey_qualitative_entry`, `survey_codebook`, `survey_coding_run`, `survey_coding_assignment` |
| **C. Cascade Projection** | Extracted variables derived from generated documents for downstream template consumption | Postgres `study_variables` is sole authority | `study_variables` rows (keyed by project_id, study_id, variable_key) |
| **D. Rendered Artifact** | Generated documents written to a repository for human consumption | GitHub content repo | Generated markdown documents in `qori-studies` |
| **E. Transport/UI State** | Transient state used for Slack interaction flow | Slack (ephemeral) | Modal metadata, button action values, message timestamps |
| **F. Debug/Export Projection** | Non-authoritative copies of state written for debugging or export | Various | ~~GitHub `.variables/*.json`~~ (removed) |

### Rules

1. **Projection data must not silently become canonical fallback input.** If Postgres is empty for a given query, the result is empty. No fallback to GitHub, Redis, or any other projection.

2. **Each persisted object serves exactly one role.** If an object is discovered serving multiple roles, it must be split or reclassified.

3. **Rendered artifacts are not evidence.** Generated markdown documents are outputs, not inputs. Downstream templates consume cascade projections, not rendered artifact text.

### GitHub .variables Removal

- **Study-scoped:** `writeStudyVariablesByContext()` GitHub write removed. Function retained as no-op for caller compatibility.
- **Discovery-scoped:** `writeDiscoveryVariablesByProject()` GitHub write removed.
- **Read fallback:** `readStudyVariablesFromGitHub()` was dead code (never called) and has been removed.
- **Discovery read fallback:** Already deleted in Phase 2D.
- **Constants:** `VARIABLES_DIR`, `VARIABLES_FILE`, `DISCOVERY_VARIABLES_FILE` removed.
- **GitHub imports:** `fetchFileFromRepoByPath`, `createOrUpdateFileOnGitHub`, `getContentRepo` removed from `studyVariables.ts`.

Generated research artifacts (markdown documents) continue to be written to GitHub. Only the `.variables/` JSON projection files are affected.

## Consequences

- Eliminates the GitHub Contents API 422 error on large discovery-variables.json.
- Removes ambiguity about which system is authoritative for cascade variables.
- Simplifies `studyVariables.ts` by removing ~40 lines of dead code and obsolete write logic.
- Debug/export inspection of raw variable state requires direct Postgres queries rather than GitHub file browsing. This is acceptable because the data is structured (JSON columns) and queryable.
- Future persistence decisions must classify the new object using this taxonomy before implementation.

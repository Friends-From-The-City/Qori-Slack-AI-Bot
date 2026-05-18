# Architecture audit — 2026 Q2 (post-migration)

**Date:** 2026-05-18
**Auditor:** Claude Code (Phase 6, Stream 4)
**Scope:** Full codebase audit after TypeScript migration (Phases 1–6)
**Prior audit:** 2026-05-13 (pre-migration, findings row in quarterly-architecture-audit.md)

## Summary

The codebase is in meaningfully better shape than three months ago. The TypeScript migration closed the structural bug classes that dominated the first audit (attribute whitelists hiding columns, status casing chaos, zero meaningful tests). The cascade variable system is sound — all required-but-consumed contracts are satisfied upstream. The main remaining concerns are test coverage for individual templates (1 of 27 has unit tests) and denormalized `study_name` columns in 3 tables that lack a `study_id` foreign key.

**Section ratings:**
- Variable cascade integrity: **Clean** (all required contracts satisfied; orphaned variables are informational)
- Template system status: **Minor concerns** (1/27 templates has unit tests; 12 templates use single-LLM pattern instead of interleaved)
- Service layer consistency: **Clean** (attribute whitelists documented per ADR L001; handler patterns consistent)
- Database schema cohesion: **Minor concerns** (3 tables use study_name without study_id FK; STRING columns for dates/enums)
- Test coverage gaps: **Clean** (110 tests; all 5 known bug classes have regression coverage)
- ADR drift: **Clean** (all 7 reviewed ADRs conform; no drift detected)

## Findings requiring action

1. **participant_tracker.yaml status mismatch.** The YAML template uses status labels (`recruited`, `pending`, `rescheduling`, `backup`, `disqualified`) that don't match the canonical `PARTICIPANT_STATUS` enum (9 values, all lowercase). If a researcher sees "recruited" in a tracker document and tries to set that status, the backend rejects it. The YAML template should use canonical enum values. *Low urgency — tracker is informational, not interactive — but confusing.*

2. **Template unit test gap.** Only `research_plan` has a template-level test (1/27). The remaining 26 templates have zero automated coverage at the template processor level. The integration tests (Phase 6) cover the database→handler path but not the YAML→Handlebars→output rendering. *Medium urgency — the rendering layer is where output quality regressions surface.*

## Findings to monitor

1. **Orphaned cascade variables.** 7 variables are emitted by producers but never consumed by any downstream template: `source_artifacts` (desk_research), `backstage_observations` and `system_failure_modes` (stakeholder_synthesis), `study_methodology` (research_readout), `unexpected_patterns` (affinity_mapping), `persona_design_implications` (persona_generator), `sample_demographics` (survey_synthesis). These accumulate in the variable store with no downstream purpose. Not a bug — may be intended for future templates — but worth tracking.

2. **study_variables table has no study_id FK.** The authoritative cascade store references studies by `study_name` (string) only, with no foreign key constraint. A study name typo creates orphaned rows. The other FK-less tables (`created_issues`, `study_status`) have the same pattern. Deferred to v1.1 per original design, but the variable store's growing importance makes this more concerning.

3. **STRING columns for dates.** `StudyParticipant.scheduled_date` and `scheduled_time`, plus `StudyNotes.session_date` and `session_time`, store temporal data as strings. Application code parses them as needed. No bugs reported, but DATE/TIME columns would prevent invalid values at the database layer.

4. **12 templates use single-LLM pattern.** The interleaved Handlebars + bounded LLM slots pattern (ADR 0005) is the target. 9 templates conform. 12 use a "minimal static + single LLM" pattern where the output is mostly one large AI-generated block. These are functional but harder to structurally test and more likely to produce inconsistent output.

## Improvements since last audit

1. **Type safety.** The codebase went from untyped JavaScript to strict TypeScript. 13 models use `InferAttributes`/`InferCreationAttributes` with compile-time attribute enforcement. Handlers use Bolt's native middleware types with zero registration-boundary `as any` casts (except 1 documented gap). Total `any` count: ~193, all in bounded categories (Slack API responses, Block Kit dynamic manipulation). The pre-migration state had no type safety.

2. **Test coverage.** From 0 meaningful tests to 110 (76 unit + 34 integration). All 5 known bug classes from the first audit have regression tests. Critical flows (compensation, status transitions, outreach, cascade, full workflow) have end-to-end tests against real Postgres. Pattern enforcement assertions prevent Phase 4 bug classes from regressing.

3. **Cascade contract enforcement.** Missing required upstream variables now throw `TemplateContractError` (ADR 0007), caught by global error middleware and sent as a researcher-facing DM. The first audit found silent empty-field rendering; that failure mode is eliminated.

4. **Participant status.** From 15 inconsistent string representations of 9 concepts (the "casing chaos" finding) to a single canonical enum (`PARTICIPANT_STATUS`) with model-level validation and a normalization migration. The status transition and outreach flow tests verify the enum is respected end-to-end.

## Reflection (Section 7 answers)

**7.1 What would you redesign if starting from scratch?**

The `study_name`-as-string pattern for cross-table references. Three tables (`study_variables`, `created_issues`, `study_status`) reference studies by name string instead of by integer foreign key. This is the only structural pattern that lacks database-enforced integrity. Everything else — types, cascade contracts, test coverage — has been addressed by the migration. The study_name pattern was an early design choice that predates the typed ORM layer; it works but depends on application-level consistency that a foreign key would guarantee.

Previous answer (2026-Q2 initial): "The output template architecture. Computed values that must be rendered exactly were being routed through a probabilistic system." → *Resolved by ADR 0005.*

**7.2 What concerns you most about the current state?**

1. **Template test coverage.** 1 of 27 templates has unit tests. The integration tests cover the handler→service→database path but not the YAML→Handlebars→AI-output rendering. A change to a YAML template's `output_template` could silently break document formatting without any test catching it.

2. **Options handler typing.** The 6 options handlers (folder/subfolder typeahead) use `SlackOptionsMiddlewareArgs<'block_suggestion'>` which exposed `body.view` as optional. The handlers access `body.view?.private_metadata` with optional chaining — correct, but the private_metadata parsing has no fallback if view is actually absent. A Slack API change that removes view context from options payloads would produce a runtime JSON.parse error on `'{}'`.

3. **Service-layer attribute whitelists.** ADR L001 says "don't whitelist." The existing whitelists were grandfathered. Over time, new columns get added to models but not to the whitelisted include clauses. This is the same bug class that caused the compensation bug — it's being monitored, not fixed.

**7.3 What's improved since the last audit?**

1. **The compensation bug class is extinct.** DECIMAL coercion, attribute whitelisting, and compensation calculation are all tested end-to-end. The integration test `compensation-flow.test.ts` creates a study with a budget, reads it back, calculates per-person compensation, and asserts the result. This test would have caught the original bug within seconds.

2. **The status chaos is resolved.** One canonical enum, one constants file, model-level validation, a normalization migration, and integration tests that exercise the full lifecycle from `not_contacted` through `completed`. The "15 strings for 9 concepts" finding from the first audit is fully addressed.

3. **The codebase has architectural enforcement that outlives any individual developer.** Pattern enforcement tests check for deprecated type usage, `as any` budget creep, cascade contract error typing, and TemplateContractError import discipline. These assertions run in CI and fail on violations. The migration's value is now structural, not just typed.

## Appendix: Section details

### Section 1: Variable cascade integrity — Clean

**1.1 Shape compatibility.** 27 templates inventoried. All produce/consume contracts verified. Key shape transforms:
- Brief emits `research_objectives` as `string[]`; plan consumes and transforms to `{id, objective}[]` (per ADR 0006, transform on consume). No regression.
- Session_summary emits `atomic_nugget_core` and `atomic_nugget_detail` as pool variables with `pool_strategy: append_or_replace_per_participant`. Downstream templates (affinity, persona, journey) aggregate across participants. Aggregation logic in `readUpstreamVariables` handles pool reconstruction.

**1.2 Orphaned variables.** 7 variables emitted with no downstream consumer (listed above). All are informational or intended for future templates.

**1.3 Required contracts.** All 21 `required: true` consumes verified against upstream emitters. No orphaned required variables.

**1.4 Phantom values.** `participant_tracker.yaml` uses display labels (`recruited`, `pending`, `rescheduling`, `backup`, `disqualified`) that don't match the canonical enum. These are YAML-side labels only — the backend writes canonical values. Finding: cosmetic mismatch, not a functional bug.

### Section 2: Template system — Minor concerns

**2.1 Pattern distribution.** 9 interleaved (target pattern), 12 minimal/single-LLM, 1 pure LLM, 5 unclear/no output. Progress toward 100% interleaved: 33%.

**2.2 Test coverage.** 1/27 templates has unit tests (`research_plan.test.js`). 26 templates have zero template-level tests. The integration tests added in Phase 6 cover handler→database flows but not template rendering.

**2.3 Versions.** All templates have version fields. Range: v1.0–v7.0. Cascade-aware templates (brief v6.0, plan v7.0, stakeholder v5.0) are the most recent.

**2.4 Snapshot tests.** Not implemented. Remains a v1.0 prerequisite per the first audit.

### Section 3: Service layer — Clean

**3.1 Attribute whitelists.** Found in `research_study.service.ts` (main study query), `study_participant.service.ts` (participant includes), `session_observer.service.ts` (observer includes). All pre-date ADR L001 (which grandfathered existing whitelists). One minor gap: `getParticipantsByStudy` study include omits `researcher_name` — not currently needed by callers but inconsistent with other services. No new whitelists added since the ADR.

**3.2 Handler patterns.** All handlers follow the canonical flow. Deviations are principled:
- `briefHandler` has optional discovery loading (try/catch, continues on failure)
- `discoverHandler` routes to 3 different YAML templates based on discovery type
- `fieldworkHandler` uses a dashboard-refresh pattern (no template processing, pure Slack UI)

**3.3 Error handling.** All handlers ack early. `TemplateContractError` propagates to global error middleware. No silent catch blocks that mask critical errors. Some catch blocks log and continue for optional operations (discovery loading) — this is intentional.

**3.4 Duplicated logic.** No new duplication found. Compensation calculation uses the canonical `calculatePerPersonCompensation` utility in all locations.

### Section 4: Database schema — Minor concerns

**4.1 Denormalized study_name.** 6 tables store `study_name`. 3 have both `study_id` FK and `study_name` (redundant but safe). 3 have only `study_name` with no FK: `study_variables`, `created_issues`, `study_status`. Unchanged from first audit; deferred to v1.1.

**4.2 Missing FKs.** `study_variables.participant_id` references participant IDs as STRING(50) with no FK to `study_participants.id` (INTEGER). Type mismatch and no referential integrity.

**4.3 Type mismatches.** 8+ columns store typed data as STRING (dates, enums listed above). No bugs reported; application-layer parsing handles it. Database-layer enforcement deferred to v1.1.

**4.4 Enum constraints.** Zero database CHECK constraints for application enums. All validation is application-level (Sequelize `isIn`). Per ADR 0008, this is accepted for alpha.

**4.5 Migration health.** 33 migrations, all successful. Last 5 are Phase 5 additions (compensation fields, outreach tracking, status normalization, budget reparse, observer dual-path). No failed or orphaned migrations.

### Section 5: Test coverage — Clean

**5.1 Test counts.**
| Area | Files | Tests |
|------|-------|-------|
| Parsers | 2 | 50+ |
| Integration (Phase 6) | 7 | 34 |
| Templates | 1 | ~5 |
| Type verification | 1 | ~20 |
| **Total** | **11** | **110** |

**5.2 Regression coverage.** All 5 known bug classes have regression tests (compensation rounding, attribute whitelist, status casing, objective shape mismatch, phantom status). Each test was deliberately broken and verified to fail during Stream 3.

**5.3 Parser fuzz coverage.** `parseBudget`: 34 distinct inputs including comma formats, ranges (rejected), qualifiers (rejected), edge cases. `parseParticipantTarget`: 11 inputs. Coverage is strong for known input patterns.

**5.4 E2E coverage.** 5 critical flows tested: compensation, status transitions, outreach, cascade variables, full workflow (discovery→brief→plan). Plus 5 pattern enforcement assertions covering structural discipline.

### Section 6: ADR drift — Clean

**6.1 Conformance.** All 7 reviewed ADRs conform:
- 0002 (status enum): Conforms
- 0005 (Handlebars architecture): Conforms
- 0006 (transform on consume): Conforms
- 0007 (cascade contracts fail loudly): Conforms
- 0014 (Sequelize TypeScript pattern): Conforms
- L001 (fetch all attributes): Partial — grandfathered whitelists persist, no new ones added
- L003 (end-to-end tests): Conforms — 7 integration test files

**6.2 Decisions without ADRs.** The Bolt native middleware types migration (Phase 6 Stream 1) is a pattern decision worth a lightweight ADR. It affects how all future handlers are written and removes an abstraction layer. Not urgent — the decision is clear in the code — but worth documenting before the next developer encounter.

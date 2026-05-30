# ADR 0018: Cascade-aware synthesis modal

**Status:** Accepted
**Date:** 2026-05-30
**Decision drivers:** Modal audit found synthesis bypasses cascade — consumes blocks declared but ignored, handler passes raw file content only

## Context

The `/qori-synthesis` modal currently presents researchers with file checkboxes: session summaries, transcripts, stakeholder guides, and prior analysis files. The researcher manually selects files, and the handler concatenates their raw content into `combined_file_content` and passes it to the YAML template.

The synthesis YAML templates (affinity_mapping, persona_generator, journey_mapping, jobs_to_be_done, usability_issues, design_opportunities) all declare `consumes:` blocks specifying they need `atomic_nugget_core`, `atomic_nugget_detail`, and optional enrichments like `validated_themes` or `target_barriers`. However, **the handler never reads these cascade variables from the variable store**. The yamlProcessor receives `variableContext` but `combined_file_content` is the actual input — the structured cascade data is ignored.

This means:
1. The cascade architecture exists but synthesis doesn't use it
2. Output quality depends on raw text parsing, not structured nugget data
3. Traceability to specific nuggets/participants is weaker than it could be
4. The file-picker UX adds friction without adding value (the cascade knows what exists)

The `/qori-readout` handler demonstrates the correct pattern: it auto-gathers data, passes `variableContext` to the processor, and the processor calls `readUpstreamVariablesByContext()` to inject structured upstream variables. Synthesis should match this pattern.

## Decision

Wire synthesis to actually read the variable store. Remove file checkboxes from the modal. Show session/nugget status instead. Keep raw content as context alongside structured cascade variables.

Specific sub-decisions:

1. **Enrichments opt-out by default.** When `validated_themes`, `target_barriers`, or other optional cascade variables exist, they're included automatically. Researcher can uncheck to exclude. Cascade just works.

2. **Hard-fail when no sessions analyzed.** If no `atomic_nugget_core` rows exist for the study, the modal shows an error state and submit is disabled. "Run /qori-analyze first" — no submit-into-nothing.

3. **No per-session exclusion in v1.** All analyzed sessions are included. The modal shows which sessions/participants are feeding the synthesis, but the researcher cannot exclude specific ones. Add later only if researchers ask for it.

4. **Service blueprint excluded from this change.** `service_blueprint.yaml` is v1.2 with old schema (`atomic_nuggets` not split into `core`/`detail`). It stays on the current file-picker path or is hidden from the new modal. Flag, don't fix in this PR.

5. **Keep both raw content and structured vars.** Match the readout pattern: pass `combined_file_content` as context (built from session summary files, not user-picked files) AND inject structured upstream variables via `readUpstreamVariablesByContext()`. Do not drop raw content — that's a bigger behavior change than intended.

## Alternatives considered

**Keep file picker, add cascade as secondary.** Could show cascade status but still let researchers pick files. Rejected: the file picker serves no purpose when cascade knows what exists. It adds friction, creates divergence risk (picked files vs stored variables), and the real input should be structured nuggets.

**Drop raw content entirely, rely only on structured vars.** The templates could work purely from `upstream_atomic_nugget_core` etc. Rejected: risky behavior change — templates were written expecting raw session text as context. Keep both for safety; templates can evolve to rely less on raw content over time.

**Migrate service_blueprint to v7.0 as part of this.** Could update the schema to `atomic_nugget_core`/`detail` split. Rejected: scope creep. Service blueprint is complex (4-lane mapping) and deserves its own focused update.

## Build requirements

### Contract tests (required, not follow-up)

For each synthesis type (affinity_mapping, persona_generator, journey_mapping, jobs_to_be_done, usability_issues, design_opportunities), add a test that asserts the cascade CONTRACT holds: the variables the YAML `consumes` block declares are exactly the variables the handler loads and injects via `readUpstreamVariablesByContext`.

Specifically, per synthesis type:

1. **Required vars in consumes are all loaded.** Test fails if a required variable is declared in the YAML but not loaded by the handler.

2. **Loaded vars match declared contract.** No silently-dropped required var, no undeclared var sneaking in. The handler must load exactly what the YAML declares.

3. **Pool aggregation is correct.** N participants → array of N items, not 1, not flattened wrong. Verifies the `is_pool` handling produces the expected shape.

4. **Optional enrichments are truly optional.** When present (e.g., `validated_themes` exists), they load. When absent, synthesis still runs without error. Optional means optional.

This is the regression guard for the exact bug this ADR addresses — synthesis declaring a consumes contract but bypassing it. These tests would have caught that. They let a researcher trust the right evidence feeds every synthesis, because the system verifies it on every commit.

**Note:** These tests verify the RIGHT VARIABLES LOAD. They do not verify output quality (LLM using them well) — that stays a human content-trace check at the verification gate. Both are required for this change to be complete.

### Verification gate (both required for done)

**A. Contract tests green** ✅ (completed 2026-05-30)

`synthesis-cascade-contract.test.ts` verifies:
- Structure: TEMPLATE_CONSUMES declarations correct for all 6 synthesis types
- Integration: Handler helpers (`buildSessionDataStats`, `buildAvailableEnrichments`, `buildSynthesisCascadeData`) read from variable store via `injectSequelizeForTest()` infrastructure
- Readiness: Missing required → not ready; all present → ready

Infrastructure fix (`studyVariables.ts`): Added `injectSequelizeForTest()` / `clearInjectedSequelize()` to unify DB connections between test setup and production code. See L004 for details.

**B. Human content-trace on a named study with real analyzed sessions:** (pending)

1. Pick a study that has multiple analyzed sessions with nuggets in `study_variables`.
2. Run `affinity_mapping` synthesis on it.
3. Confirm the modal shows correct session/nugget counts that MATCH what's actually in `study_variables` (e.g., "5 sessions, 47 nuggets" — verify against the DB, not just that a number renders).
4. Confirm the OUTPUT affinity map is grounded in actual nuggets — themes traceable to specific participant nuggets (the `[from theme-XX]` / `nugget-PTXXX-XXX` style trace), NOT generic clustering that could've come from raw text.
5. Compare to a pre-change synthesis if one exists: the output should be visibly MORE grounded (specific nugget references) than the old raw-text version. That difference IS the proof the cascade wiring worked.

**The bar is not "synthesis ran."** The bar is "synthesis visibly reads the variable store — counts match the DB, output traces to real nuggets." If it runs but the output looks the same as the old raw-text version, the wiring didn't take and it's not done.

## Consequences

**Intended:**
- Synthesis output improves — grounded in structured nuggets with IDs, severities, types
- Traceability to specific participants/sessions is explicit
- Modal UX simplifies — researcher confirms study, trusts cascade
- Cascade contract validation now meaningful — missing required vars block submission
- Contract tests prevent future drift between YAML declarations and handler behavior

**Accepted downsides:**
- Service blueprint remains on old path (technical debt flagged, not resolved)
- Per-session exclusion not available until researchers ask for it
- Output will visibly change — different structure, different citations — which is the goal but requires verification

## References

- Audit conversation: comparison of synthesis vs readout data loading
- `/qori-readout` handler: `backend/src/helpers/slack/commands/readoutHandler.ts` (reference pattern)
- Synthesis YAML templates: `config/prompts/affinity_mapping.yaml`, `persona_generator.yaml`, etc. (all v7.0 with consumes blocks)
- Variable store: `backend/src/helpers/studyVariables.ts` (`readUpstreamVariablesByContext`)
- ADR 0007: Cascade contracts fail loudly

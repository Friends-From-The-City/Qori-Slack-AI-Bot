# ADR 0016: Brief template restructured to v7.0 interleaved Handlebars/AI pattern

**Status:** Accepted
**Date:** 2026-05-19
**Decision drivers:** Post-migration architecture audit identified 12 of 27 templates using the "minimal static + single LLM" pattern instead of the v7.0 interleaved Handlebars architecture (ADR 0005). The research brief is the first template upstream of all others — restructuring it first validates the pattern and exposes any integration issues before the remaining 10 templates are touched.

## Context

The research brief (v6.0) generated its entire body through a single `brief_body` AI task — a monolithic LLM call that produced all 7 sections (Summary, Problem, What we'll learn, Method, Participants, Out of scope, Risks) as opaque markdown. The output template was a thin wrapper: masthead, `{{ai_generated.brief_body}}`, timeline, approval, discovery appendix.

This violated ADR 0005 in several concrete ways:

1. **The LLM rendered computed values.** Display date, timeline phases, timeline display label, methodology, budget, and decision deadline were all values the handler already had, but they were passed into the LLM prompt and re-rendered as prose. The LLM could (and did) paraphrase or round these values.

2. **The LLM assigned stable IDs.** Target barrier IDs (TB-001) and research question IDs (RQ-001) are stable references used by downstream templates (session_summary, affinity_mapping). The v6.0 brief instructed the LLM to assign these sequentially, but the LLM occasionally skipped numbers, duplicated IDs, or used inconsistent formatting.

3. **No anti-fabrication guards on computed values.** The prompt said "Use ONLY metrics from upstream" for discovery citations, but had no guard against the LLM fabricating participant counts, budget figures, or timeline dates.

4. **No cascade summary section.** The plan template (v7.0 reference) includes a cascade summary documenting what the template emits for downstream consumption. The brief had a discovery sources appendix (different purpose) but no cascade summary.

The plan template (v7.0) had already demonstrated the correct pattern: handler as data assembly point, interleaved Handlebars for structure, bounded LLM tasks for prose only.

## Decision

Restructure the brief to v7.0 conformance using a two-phase handler approach (Option C from the delta document):

**Phase 1 — Handler pre-render.** The handler runs two structured LLM tasks directly via `executeAiGenerationTasks`: one for target barriers (`[{barrier, source}]`) and one for research questions (`[{question, priority}]`). It parses the JSON responses and assigns sequential IDs mechanically (TB-001, RQ-001). It also computes display date, timeline phases, and timeline display label using shared utilities.

**Phase 2 — yamlProcessor render.** The handler passes the complete data object (including ID'd barriers, ID'd questions, computed timeline, all form values) to `processYamlTemplate`. The YAML template's AI tasks are now 7 focused, bounded tasks: 1 creative title (principled exception — slug humanization is genuinely generative), 4 prose tasks with anti-fabrication guards, 1 structured JSON risks task, and 1 approval checklist. The output template interleaves Handlebars iteration (`{{#each target_barriers}}`) with bounded LLM prose slots (`{{ai_generated.problem_narrative}}`).

**Shared timeline utility.** `buildTimelinePhases`, `buildTimelineSummary`, and their supporting types (`TimelinePhase`, `PhaseDurations`, `TimelinePreference`) were extracted from planHandler to `utils/timelineComputation.ts`. Both handlers now import from the shared utility.

**Citation marker convention.** Each prose task numbers citations sequentially within its own section, starting at [D1]/[S1]/[V1]. This replaces the v6.0 approach of global numbering across the entire document, which was only possible because one LLM task generated all sections.

## Alternatives considered

**Option A: Post-process in handler.** Run yamlProcessor as before, then parse the rendered markdown to extract barriers/questions, assign IDs, and re-render. Rejected because it requires fragile markdown parsing — exactly the kind of pattern ADR 0005 was designed to eliminate.

**Option B: Two-phase yamlProcessor API.** Split yamlProcessor into (1) run AI tasks, return raw outputs; (2) handler transforms; (3) render template. Rejected because it changes the yamlProcessor API for all templates. The brief's two-phase need is specific to templates where structured LLM output feeds into the same template's prose tasks. Most templates don't have this dependency.

**Option C: Handler runs structured tasks directly.** Chosen. The handler calls `executeAiGenerationTasks` for the two JSON tasks, processes results, then passes everything to yamlProcessor. The yamlProcessor API stays unchanged. Other templates are unaffected. The handler already does direct work (discovery loading, budget parsing, study creation), so adding two LLM calls is consistent with its role.

**Keep brief_body as a single task but add Handlebars around it.** Wrap the monolithic LLM output in Handlebars structure but keep the single-task architecture. Rejected because it doesn't solve the computed values problem — the LLM would still render dates, IDs, and budget inside the prose blob.

## Consequences

**Intended:**
- Computed values render exactly as computed. Budget, dates, methodology, participant count, timeline phases — all mechanically rendered. The LLM cannot paraphrase or round them.
- Target barrier and research question IDs are handler-assigned. They are always sequential, never duplicated, consistently formatted. Downstream templates (session_summary, affinity_mapping, readouts) see reliable ID formatting.
- Anti-fabrication guards on every prose task prevent the LLM from inventing metrics or statistics.
- Cascade summary section documents what the brief emits, matching the plan template pattern.
- The `descriptive_title` task is explicitly documented as a principled exception — slug humanization is genuinely generative. This annotation prevents future restructures from using it as license to keep other computed values LLM-controlled.

**Cascade contract unchanged.** All 12 emitted variable shapes are identical to v6.0. The plan handler's `readUpstreamVariables` and ADR 0006 transforms continue to work without modification. The `normalizeVariableFields()` fallback (flat string to object upgrade) remains as a safety net for legacy data.

**Accepted downsides:**
- Total LLM API calls per brief increases from ~6 to ~9 (2 pre-render JSON tasks + 7 YAML tasks). The pre-render tasks run in parallel, adding ~3-5 seconds to total generation time. Acceptable for a document generated once per study.
- Citation markers now use per-section numbering instead of global numbering. Functionally equivalent but a visible format change from v6.0 briefs.
- Handler complexity increases from ~100 to ~180 lines of data assembly. This is the expected consequence of ADR 0005 — the handler owns the work the LLM was doing incorrectly.

**Pattern for remaining template restructures.** The brief restructure establishes the pattern for the remaining 10 templates that need v7.0 conformance:
1. Write a delta document auditing current state against v7.0.
2. Identify which values the LLM controls that it shouldn't.
3. Determine whether the template needs pre-render structured tasks (Option C) or can use YAML-only JSON tasks (like the plan's `risks` and `brief_operationalization`).
4. Extract shared utilities where handlers duplicate logic.
5. Add anti-fabrication guards and cascade summary section.
6. Verify emitted variable shapes are unchanged (or document changes in the delta).

Templates without the pre-render dependency (where structured outputs don't feed into prose tasks in the same template) can use the simpler plan-style pattern: JSON tasks defined in YAML, parsed by yamlProcessor step 4.5, passed to Handlebars.

## References

- `config/prompts/research_brief.yaml` (v7.0)
- `backend/src/helpers/slack/commands/briefHandler.ts`
- `backend/src/utils/timelineComputation.ts`
- `docs/brief-restructure-delta.md` — planning document
- ADR 0005 (Handlebars template architecture)
- ADR 0006 (Transform on consume)
- ADR 0007 (Cascade contracts fail loudly)
- `config/prompts/research_plan.yaml` (v7.0 reference implementation)

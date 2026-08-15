# ADR 0028: Deterministic research transformations occur outside generative models

**Status:** Accepted
**Date:** 2026-08-15
**Decision drivers:** Evidence architecture foundation — ensuring authoritative quantitative and structural operations are not mediated by LLMs, which introduce non-determinism and potential error.

## Context

Qori's pipeline currently routes all analytical output through LLM generation: the model receives context, produces prose and structured JSON, and the variable extractor parses the result. This works well for interpretive tasks — synthesizing themes, drafting recommendations, identifying patterns in qualitative data.

However, some operations are deterministic by nature: counting participants who experienced a barrier, computing severity distributions, calculating percentages, assigning stable IDs, maintaining provenance relationships, and aggregating cross-tabs. When these operations pass through an LLM, the results are probabilistic approximations of what should be exact computations. A model might count 7 participants when the data contains 8, or compute a percentage that doesn't match its own numerator and denominator.

The existing rendering architecture (ADR 0005) already separates Handlebars template rendering from LLM generation slots. This ADR extends that separation to the evidence and analysis layer.

## Decision

Deterministic transformations occur outside the generative model.

Specifically, LLMs must not be the authoritative source for:

- Arithmetic (sums, differences, ratios)
- Denominators, percentages, medians
- Counts and frequencies (participant counts, occurrence counts)
- Severity aggregation where the aggregation formula is defined
- Cross-tabulations
- ID assignment (construct IDs, relationship IDs, sequence numbers)
- Stable provenance relationships (source→construct, construct→construct)
- Timestamps and temporal ordering
- Status transitions (candidate→accepted→rejected)

LLMs may interpret, contextualize, and narrate computed facts. They may also produce genuinely interpretive constructs (themes, findings, recommendations) where human judgment is the methodology.

When a template or handler needs both computed facts and interpretive prose, the handler computes the deterministic values first and injects them as template variables. The LLM receives computed facts as context, not as tasks to reproduce.

## Alternatives considered

**Status quo — let the LLM do everything.** Simpler implementation, but produces authoritative-looking numbers that are occasionally wrong. Detected in usability testing when a readout claimed 5/7 participants encountered a barrier but the underlying data showed 6/8. The cost of a wrong number in a federal research context is high.

**Post-LLM validation — generate then verify.** Run LLM output through deterministic checks and retry on mismatch. Adds latency, doesn't eliminate the root problem (the LLM is still the source), and creates a confusing contract where the system sometimes silently corrects its own output.

## Consequences

- Handlers that produce quantitative outputs must compute them in code before calling the LLM.
- The evidence service (ADR 0029) stores computed constructs with `derivation_type: 'deterministic'` so downstream consumers know the value is exact.
- Variable extraction (via `variableExtractor.ts`) remains valid for genuinely interpretive constructs — themes, findings, recommendations — where the LLM is performing analysis, not arithmetic.
- Future survey analysis will use this pattern heavily: codebook frequency tables, cross-tabs, and statistical summaries are computed in code; the LLM interprets the computed results.
- Template authors must distinguish between "ask the model to compute" and "inject a computed value for the model to narrate."
- Projection validation (evidence → cascade) is deterministic infrastructure: payload field checks, cascade schema validation, and shape transformation are all code operations, never LLM operations.

## References

- ADR 0005 — Handlebars template architecture (structural separation of rendering from generation)
- ADR 0008 — Render empty rather than fabricate
- ADR 0012 — Structured JSON for LLM outputs
- `backend/src/helpers/variableExtractor.ts` — extraction remains valid for interpretive constructs

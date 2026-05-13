# ADR 0005: Templates render via Handlebars with bounded LLM slots

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Discovered the LLM was fabricating computed values. A research plan was generated showing "Compensation: $75 per participant" when the actual calculated value was $80. Investigation revealed the structured data was correctly injected into the LLM prompt as context, but the LLM treated it as a suggestion and regenerated the value. This is a category of bug, not a one-off — every template using the "pure LLM" pattern (21 of 23 templates at the time) had the same risk for every computed value.

## Context

Qori's commercial promise is provenance: every recommendation traceable to a real participant's words. That promise only holds if the rendered output reflects the underlying data faithfully. The original implementation used a pattern where:

1. Cascade variables (compensation, dates, participant counts, methodology) get extracted and stored as structured JSON.
2. Variables get injected into LLM prompts as stringified JSON context.
3. The LLM generates the entire document body as free text.
4. The output template has a single `{{ai_generated.full_body}}` slot that just renders whatever the LLM produced.

The problem: in step 3, the LLM has authority over every value, including values that were already computed and shouldn't be re-interpreted. The LLM was caught fabricating compensation values, drifting timeline durations, paraphrasing structured citation markers into vague references.

The variable cascade itself was clean — extraction, storage, and queries were all rigorous. The failure was at the last mile: the LLM was the final author of the document, and it didn't honor the data it was given.

## Decision

Invert the default. The output template is now a Handlebars document with bounded LLM slots inside it, not an LLM-generated document with Handlebars decoration.

Concretely, every value in a rendered template falls into one of three categories:

- **Handlebars-rendered facts.** Values that are calculated, looked up, or extracted as structured data. Render mechanically via Handlebars from the data object the handler assembles. The LLM never touches these.
- **Bounded LLM prose.** Sections where the LLM writes narrative paragraphs (summary, background, method approach, etc.). Each section is a clearly named slot in the output template with a focused prompt scoped to that section only.
- **LLM-emitted structured JSON.** For cases where the LLM produces multiple structured items (risks, brief operationalization), the LLM emits a JSON array. The handler parses and validates the shape. Handlebars iterates and renders.

The handler is the assembly point: it loads cascade variables, computes derived values, runs LLM tasks, parses structured outputs, validates shapes, and builds a single data object passed to the template processor. The template is dumb — it iterates and interpolates.

## Alternatives considered

**Hard-rule the LLM via prompt instructions.** Add "RULE: output the compensation value EXACTLY as given, do not recalculate or rephrase" to the prompt. Rejected as a band-aid that only addresses compensation; other computed values still at risk. The class of bug remains.

**Validate LLM output against the inputs.** After the LLM generates, scan the output for known computed values and assert they match. Rejected as too brittle — values appear in many formats ($80 / $80.00 / 80 dollars / eighty dollars), regex matching them all is fragile.

**Use a strict-mode LLM API.** Some providers support structured output modes that constrain generation. Rejected because we'd still be passing computed values through the LLM and trusting it. The architectural answer is to not pass them through at all.

**Inverted default with Handlebars.** Chosen. The template owns the structure; the LLM only writes the prose pieces.

## Consequences

**Intended:** Computed values render exactly as computed. The patent's provenance claim holds end-to-end. Bugs in this category become impossible: if compensation doesn't appear in the output, the handler didn't populate the variable. If it appears wrong, the calculation is wrong. The LLM is no longer a possible source of corruption for structured data.

**Failure mode changes meaningfully:** Pre-restructure, missing data rendered as LLM-fabricated plausible-sounding content. Post-restructure, missing data renders as empty bullets, blank fields, or contract errors. This is louder but it's better — visible failures are debuggable; invisible fabrication is not.

**Accepted downsides:** More handler-side complexity. The handler now owns the data assembly that was previously handled by the LLM. Each template restructure requires deliberate work: identify which values are computed vs generated, write the handler code to assemble them, validate the shapes.

**Test-surface implication:** Templates now have testable contracts. A test can assert "given input X, output contains exactly Y." Pre-restructure this was impossible because LLM output varied. This is what enables Foundation 1a's reference tests.

## References

- `backend/src/utils/yamlProcessor.js`
- `backend/src/helpers/slack/commands/planHandler.js`
- `backend/config/prompts/research_plan.yaml` (v7.0)
- Foundation 1a: template processor tests
- Foundation 2: handler extraction + cascade contract enforcement
- Instruction: research_plan template restructure
- Related: ADR 0006 (compensation rendering specifically), ADR 0007 (cascade contract enforcement)

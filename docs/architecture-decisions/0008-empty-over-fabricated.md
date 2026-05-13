# ADR 0008: Render empty rather than fabricate

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Multiple instances during the template restructure where missing or malformed upstream data could either render as empty values (loud failure) or be filled by the LLM with plausible-sounding content (silent fabrication). The compensation incident — where the LLM output "$75" instead of the calculated $80 — was the clearest case, but the pattern recurs throughout the system whenever data is missing or shaped wrong.

## Context

When upstream data is missing, malformed, or absent for any reason, the document generation system has a choice between two failure modes:

- **Empty:** Render blank fields, empty tables, missing bullets. The user can see something is wrong because the document looks incomplete.
- **Fabricated:** Let the LLM fill in plausible-looking defaults. The user can't easily see something is wrong because the document looks complete.

The fabricated path is the historical default for LLM-driven document systems. It feels polished. It avoids "ugly" empty outputs. It produces something the user can immediately read.

The fabricated path is also worse. The user can't distinguish a real value from an invented one without checking source data. A stakeholder reading "Compensation: $75" has no way to know whether that number is calculated or guessed. Fabrication breaks the patent's provenance claim silently.

## Decision

When data is missing or malformed, render the visible failure rather than fabricate a substitute. This applies across the entire system:

- **Handlebars sections.** Empty arrays render no bullets. Empty objects render no rows. Missing scalars render blank fields. No fallback text that pretends to fill the gap.
- **Cascade contracts.** A `required: true` cascade variable that's missing throws `TemplateContractError`. The handler catches it and sends a DM to the researcher explaining what's missing. No silent rendering of a partial document.
- **LLM-emitted structured JSON.** If the JSON is malformed or fails schema validation, the handler throws. No attempt to clean up or repair the output and proceed.
- **Calculated values.** If `parsed_budget_amount` is null because the budget couldn't be parsed, the compensation section either omits entirely (preferred) or shows a clearly-labeled "Budget not specified" — never a synthetic dollar amount.

The principle: a document with visible gaps is more honest than a document that looks complete but contains invented values. Stakeholders make decisions from these documents; invented values are decision-poisoning.

## Alternatives considered

**LLM fallbacks with attribution.** Have the LLM fill gaps but mark them with `[generated]` or similar. Rejected because attribution gets lost when documents are excerpted, screenshotted, or paraphrased downstream. The provenance leaks even when the original mark is intact.

**Smart defaults from cascade signal.** Compute reasonable defaults from related variables. (E.g., if budget is missing, infer from participant count × industry-standard rate.) Rejected because "reasonable" is doing a lot of work — a 7-veteran study with no budget might infer $700 or $1400 depending on rate assumption, and neither traces to actual researcher intent.

**Render with placeholder text.** Use `[TBD]` or `[Pending]` markers. Considered for some fields. Generally rejected in favor of true emptiness, but acceptable in specific cases where the absence would be ambiguous (e.g., a field that should always have a value but is null because of timing — `[Pending stakeholder input]` is meaningful).

## Consequences

**Intended:** Stakeholders can trust that a value in a Qori-generated document reflects real input or real calculation. The patent's provenance claim holds at the document layer, not just the database layer. Bugs surface visibly instead of accumulating silently.

**Failure mode shift:** The user-visible failure mode changes from "document looks fine but contains lies" to "document has empty sections that need to be filled." This is louder and arguably less polished. It is also significantly more debuggable: a stakeholder seeing empty objectives in a research plan immediately knows something is wrong; a stakeholder seeing fabricated objectives may build a presentation around them before discovering the issue.

**Researcher experience:** Researchers will occasionally see documents with empty sections during the workflow. The DM-on-error pattern (from ADR 0007) routes these failures to clear messages explaining what's missing. The researcher resolves at the source rather than working around the symptom.

**Accepted downsides:** Documents may look unpolished when data is partial. This is the right tradeoff — polish should reflect completeness, not paper over absence. For external-facing documents (stakeholder deliverables, partner reports), the researcher reviews and fills gaps before sharing. The system's job is to make the gaps visible, not to hide them.

**Implication for testing:** Tests can assert on specific values appearing in output, since the system no longer compensates for missing inputs by inventing values. This is what makes the Foundation 1a test pattern work — assertions like `expect(output).toContain('$80')` are reliable because the system either produces $80 or produces nothing.

## When to revisit

- A government or enterprise partner explicitly objects to empty sections in delivered documents
- A pattern emerges where researchers consistently abandon document generation because too many sections come back empty (suggests the cascade is broken, not the principle)
- A specific document type requires polish over honesty (e.g., a public-facing summary that must look complete) — handle case-by-case rather than reversing the principle

## References

- `backend/src/utils/yamlProcessor.js` — `TemplateContractError` and contract enforcement
- `backend/src/helpers/slack/commands/planHandler.js` — error handling pattern with researcher DM
- Related: ADR 0005 (Handlebars architecture — sets up where empties render), ADR 0007 (cascade contracts fail loudly — operationalizes this principle for required variables)

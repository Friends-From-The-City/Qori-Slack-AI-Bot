# ADR 0012: LLM emits structured JSON when output needs to render as a table or list

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** When restructuring research_plan to the Handlebars-architecture pattern, the Risks and Brief Operationalization sections presented a problem. Risks aren't extractable from upstream cascade variables — the LLM has to generate them. But they need to render as a structured table with three specific columns (Risk, Likelihood, Mitigation). Letting the LLM write free-form prose for the table cells would let it drift through paraphrasing — exactly the failure mode ADR 0005 fixed. The pattern that worked: LLM emits structured JSON, handler validates the schema, Handlebars iterates and renders mechanically.

## Context

ADR 0005 established that templates render via Handlebars with bounded LLM slots. Most content fits cleanly into one of two categories:

- **Computed/extracted data** — renders mechanically from variables the handler assembles
- **Narrative prose** — renders in `{{ai_generated.X}}` slots written by the LLM

But some content sits awkwardly between those categories:

- **Generated but structured.** The Risks table needs three columns per row. Letting the LLM write "Risk: X. Likelihood: High. Mitigation: Y." in prose form means the table structure depends on the LLM remembering to use that exact format consistently across rows. It doesn't always remember.
- **Multi-item generated lists.** The Brief Operationalization table maps brief commitments to plan responses — typically 6-7 rows. Same shape problem: LLM-prose-as-table-rows is fragile.

The naive approaches fail in different ways:

- **LLM writes the whole table as markdown.** Output drift is high — column counts vary, headers change, ordering is inconsistent. The table structure becomes part of what the LLM might mangle.
- **LLM writes prose, Handlebars renders into a table.** Doesn't compose — Handlebars iterates over arrays, not over prose.
- **Pull from cascade variables.** Doesn't apply for content that's genuinely generated, not extracted.

## Decision

For content that's LLM-generated but needs to render in structured form (tables, multi-item lists with consistent shape), the LLM emits a JSON array matching a defined schema. The handler parses and validates against the schema. Handlebars iterates the validated array and renders mechanically.

Concretely, the YAML template task definition:

```yaml
- id: risks_json
  description: Generate a JSON array of risks for this research plan. 
    Each risk must have exactly these fields: risk (string), 
    likelihood (High/Medium/Low), mitigation (string). 
    Output ONLY valid JSON, no surrounding prose.
  output_format: json
  schema:
    type: array
    items:
      type: object
      required: [risk, likelihood, mitigation]
      properties:
        risk: { type: string }
        likelihood: { type: string, enum: [High, Medium, Low] }
        mitigation: { type: string }
```

The handler:

```js
let risks;
try {
  risks = JSON.parse(aiResults.risks_json);
  validateRisksSchema(risks); // throws if shape is wrong
} catch (err) {
  throw new TemplateContractError(
    "AI returned malformed risks data",
    { templateId: 'research_plan', detail: err.message }
  );
}
```

The template:

```handlebars
| Risk | Likelihood | Mitigation |
|------|:----------:|------------|
{{#each risks}}
| {{this.risk}} | {{this.likelihood}} | {{this.mitigation}} |
{{/each}}
```

The split is clean: LLM provides the content, Handlebars provides the structure. The LLM can't drift the column count, miss a header, or paraphrase a likelihood value into something outside the allowed enum — the schema validation catches that and throws.

## Alternatives considered

**LLM writes table directly in markdown.** Rejected. Structure drift is high; the LLM has been observed mangling column counts and headers across runs. We've seen this happen.

**Add a new structured cascade variable for each generated table.** Define risks as an extracted variable, like target_barriers. Rejected because risks aren't extractable from upstream content — they're emergent at planning time. Adding a separate extractor for risks-from-context is more infrastructure than the problem warrants.

**LLM writes free-form, then a post-processing step parses it back into structure.** Rejected because the parsing step is fragile — any prose variation breaks it. The whole point of having structure is to avoid the parse-the-LLM-output dance.

**Custom Handlebars helper that parses JSON inline in the template.** Considered (`{{#each (parseJSON ai_generated.risks_json)}}...{{/each}}`). Rejected because parsing should happen once in the handler with explicit error handling, not lazily in the template where errors can't be caught and surfaced cleanly.

**Use a structured output API mode if available.** Some LLM providers offer "JSON mode" or structured outputs as a first-class API feature. Considered. Currently we use Anthropic's Claude via Langchain; structured outputs aren't supported the same way as some other providers. The prompt-and-parse approach works reliably with current infrastructure. Worth revisiting if the provider's API capabilities evolve.

## Consequences

**Intended:** Tables and structured lists render predictably. The LLM contributes content but can't break the structure. Adding new generated-but-structured sections follows a known pattern.

**Schema validation surfaces errors loudly.** If the LLM emits invalid JSON (rare but possible), or the shape doesn't match the schema (more common — wrong enum values, missing fields), the handler throws `TemplateContractError`. The researcher gets a clear DM rather than a broken table. Same pattern as ADR 0007 (cascade contracts).

**JSON parsing failures are rare but real.** The LLM sometimes outputs explanatory prose before or after the JSON despite instructions. Mitigation: prompt the LLM with "Output ONLY valid JSON, no surrounding prose" explicitly, and consider stripping common prose patterns in the handler if rate of malformed responses becomes a problem.

**Long-term implication: this pattern may evolve into a cascade variable.** Today's risks are LLM-generated per plan. A future Qori might extract risks from upstream signals (recruitment timeline, methodology complexity, observer coverage) and emit them as a proper cascade variable. At that point this section becomes a Handlebars iteration over an extracted variable, no LLM call required. The current pattern is a stepping stone, not the final form.

**Schema versioning is implicit.** The schema is defined inline in the YAML task. When the schema changes, every existing rendered document is a snapshot of a different schema version. This is acceptable for alpha but worth tracking as part of the v1.1 hardening.

## When to revisit

- The LLM frequently produces malformed JSON despite the prompt instructions — would suggest moving to a different LLM API or a different pattern
- The Anthropic API adds first-class structured output support
- A specific generated-but-structured section's signal becomes reliably extractable from upstream cascade — at that point it migrates to a proper cascade variable
- More than 5 sections use this pattern — at that point the schema validation logic should be factored into a shared utility

## References

- `backend/config/prompts/research_plan.yaml` — risks_json and brief_operationalization_json task definitions
- `backend/src/helpers/slack/commands/planHandler.js` — JSON parsing and schema validation
- Related: ADR 0005 (Handlebars architecture), ADR 0007 (cascade contracts fail loudly — the failure mode this pattern inherits)

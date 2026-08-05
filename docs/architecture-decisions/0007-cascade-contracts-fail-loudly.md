# ADR 0007: Cascade variable contracts fail loudly, not silently

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Architecture audit found that templates declare `consumes: [...]` blocks with `required: true` flags, but missing required variables logged a warning and continued. Combined with ADR 0005's Handlebars rendering, missing required data would render as empty strings in the output. The combination created a silent failure mode where templates could produce broken documents that looked fine on cursory inspection.

## Context

Templates declare what cascade variables they consume:

```yaml
consumes:
  - key: target_barriers
    required: true
  - key: discovery_summary
    required: false
```

Before this decision, the `required` flag had no enforcement teeth. If a required variable was missing, the YAML processor logged `console.warn("Required variable X missing")` and continued rendering. With the new Handlebars architecture (ADR 0005), missing data renders as empty rather than as LLM-fabricated plausible content. This is better — visible failure beats invisible fabrication — but only if the failure is visible to *someone*. A warning in server logs that no one reads isn't visible.

The choice is: keep logging warnings (and let consumers handle missing data however they want), or escalate to errors that block rendering.

## Decision

Missing required variables throw `TemplateContractError` from the YAML processor. The exception propagates up to the handler, which catches it and sends a clear DM to the researcher explaining what's missing and how to fix it.

Example DM:
> Could not generate the research plan — the research brief is missing required data (target_barriers). Run /qori-brief to complete the brief, then try /qori-plan again.

The principle: a contract violation is a hard failure with a recoverable error message, not a silent degradation.

## Alternatives considered

**Keep warnings.** What the system had been doing. Rejected because warnings don't reach the people who can act on them (researchers don't read server logs).

**Render the document anyway with empty sections.** Let the researcher see what's missing in the rendered output. Rejected because rendered documents go to stakeholders, not just researchers. A stakeholder seeing a research plan with empty sections doesn't know that's a system error — they assume the researcher chose to leave those sections blank.

**Render but flag missing sections inline.** Insert visible markers like `[MISSING: target_barriers]` into the document where data should have been. Rejected because it pollutes the output with debug information that shouldn't reach stakeholders.

**Hard fail with DM.** Chosen. The researcher sees the error immediately, knows what to do, and the broken document never reaches a stakeholder.

## Consequences

**Intended:** Required-data contracts are enforced, not aspirational. Researchers get actionable error messages when something is missing. Broken documents never get generated. The `required: true` flag finally means what it says.

**Accepted downsides:** Templates with overly aggressive `required: true` declarations can produce error states for cases that should have been recoverable. Mitigated by carefully reviewing which variables are genuinely required vs. nice-to-have. Default to `required: false` and only escalate to `required: true` when the template fundamentally can't function without the variable.

**Migration risk:** When this enforcement first shipped, any existing production data that had a missing required variable would suddenly fail to render. Mitigation: query for studies in this state before merging, and either backfill the data or downgrade the requirement.

**A "missing" variable is defined narrowly:**
- No row exists in `study_variables` for the requested key
- A row exists but its value is null or undefined

Empty arrays `[]` and empty objects `{}` count as present — that's valid data the upstream legitimately emitted. This avoids false positives where the contract fires for "valid but empty" cases.

## References

- `TemplateContractError` class in `backend/src/helpers/yamlProcessor.ts`
- Foundation 2 instruction document
- Related: ADR 0005 (Handlebars architecture — this enforcement complements it), ADR 0006 (transform-on-consume — shapes can still drift even with the contract)

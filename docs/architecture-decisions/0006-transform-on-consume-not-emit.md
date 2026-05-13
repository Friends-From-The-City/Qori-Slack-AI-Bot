# ADR 0006: Transform upstream variables on consume, not on emit

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** During research_plan template restructure, discovered the brief emits `research_objectives` as a plain string array (`["Understand X", "Identify Y"]`) but the plan template iterates expecting objects (`[{id, objective}]`). Handlebars silently rendered empty bullets six times in the output. Two possible fixes — change what the brief emits, or transform the data in the plan handler before passing to the template. Chose the latter.

## Context

Variable cascade has multiple producers and consumers. A brief emits `research_objectives`. A plan consumes it. Other templates may also consume it (readouts, synthesis, etc.). Each consumer has its own needs for how the data is shaped.

When a consumer's expectations don't match the producer's emitted shape, two general approaches:

1. **Change the producer.** Update the brief's emit schema so `research_objectives` are stored as `[{id, objective}]` from the start. Migrate existing data. Every consumer that referenced the old shape needs updating in lockstep.

2. **Transform on consume.** Each consumer that needs a different shape transforms the data when reading it. The producer keeps emitting whatever shape made sense for it.

Approach 1 is "fix it at the source." Approach 2 is "adapt at the boundary."

## Decision

Transform on consume. The brief continues emitting `research_objectives` as a string array. The plan handler maps that array into the object shape the template expects, generating sequential IDs (`OBJ-001`, `OBJ-002`, ...) at transform time.

```js
const objectives = Array.isArray(upstreamObjectives)
  ? upstreamObjectives.map((text, index) => ({
      id: `OBJ-${String(index + 1).padStart(3, '0')}`,
      objective: typeof text === 'string' ? text : text.objective || '',
    }))
  : [];
```

The defensive `typeof text === 'string'` handles the case where the brief schema evolves to emit objects directly later — the transform still works.

## Alternatives considered

**Change the brief's emit schema to objects with IDs.** Conceptually cleaner — one canonical shape stored. Rejected because:
- Changes a producer with multiple consumers, any of which might break.
- Requires a migration of existing data in production.
- Couples consumers to producer evolution.
- The brief doesn't naturally generate stable IDs for objectives; they'd be derived anyway.

**Have the LLM emit IDs as part of the brief generation.** Make the brief author include IDs at write time. Rejected because the LLM at the brief stage doesn't know how downstream templates will reference objectives, and IDs assigned at one stage may not match what another consumer wants.

**Render without IDs and let citation markers be optional.** Drop the requirement that the plan output show `[OBJ-001]` citation markers. Rejected because the markers are core to the patent's provenance — every recommendation should trace to an objective.

## Consequences

**Intended:** The brief's schema stays stable. New consumers can transform on read as they need. The plan template gets the shape it expects. Citation markers work as designed.

**Accepted downsides:** Transformation logic is duplicated if multiple consumers need the same transform. If three templates all need `objectives` as `[{id, objective}]`, three handlers each do the same map. Acceptable for now; if the duplication becomes a real maintenance burden, factor into a shared helper.

**This is a principle, not a rule for this specific case only:** Going forward, when a consumer's expected shape diverges from the producer's emitted shape, the default is to transform on consume rather than change the producer. The producer's contract stays stable; consumers adapt.

**Risk to monitor:** Silent shape mismatches like this one are easy to miss because Handlebars renders empty without complaint. The audit checklist should include a "shape compatibility" question that lists every upstream variable each template consumes and verifies the expected shape against what the upstream actually emits. See `docs/audits/` for the recurring checklist.

## References

- `backend/src/helpers/slack/commands/planHandler.js`
- Related: ADR 0005 (Handlebars template architecture — sets up the consume layer where this transform lives)
- Quarterly audit checklist (template section)

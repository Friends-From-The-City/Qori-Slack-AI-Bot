# ADR 0011: Hardcoded Qori-style timeline durations for research plans

**Status:** Accepted (alpha-only)
**Date:** 2026-05-13
**Decision drivers:** Research plan output kept showing traditional research timelines — 4 days analysis, 4 days reporting — using durations inherited from the industry standard. Qori actually executes analysis and reporting in minutes via its variable cascade. The mismatch between Qori's real capability and the output documents was undermining the speed-to-value pitch. Two options: derive durations dynamically from cascade signals, or hardcode Qori-appropriate values for now. Chose hardcoding for alpha.

## Context

The research plan output includes a Timeline table with phase durations: Planning, Recruitment, Fieldwork, Analysis, Reporting. The durations historically came from traditional research timelines because that's what the LLM was prompted to generate (and "traditional research timeline" is what's in the LLM's training data).

The problem: Qori's analysis step is the variable cascade running through extracted findings. It takes minutes, not days. Reporting via the readout templates also takes minutes. Putting "4 days analysis" in a research plan is misleading — it suggests the researcher's labor takes 4 days, when in reality the system produces the output in minutes and the researcher's job is review and refinement.

Two ways to address this:

**Hardcoded values.** Decide on appropriate phase durations once, render them as fixed values in every research plan. Simple but inflexible.

**Cascade-derived values.** Compute phase durations from real signal — session count × session length for fieldwork, complexity-of-analysis indicators for analysis duration, deliverable count for reporting duration. More accurate but requires building the derivation logic and having reliable signal.

## Decision

Hardcode Qori-appropriate phase durations for alpha. Reconsider in v1.1 when there's actual data about how long phases take in practice.

The hardcoded values:

| Phase | Duration | Rationale |
|-------|----------|-----------|
| Planning | 3 days | Time for stakeholder alignment and brief review |
| Recruitment | 7 days | Time for outreach and confirmation cycles |
| Fieldwork | calculated from session count × session length | Variable; depends on study |
| Analysis | 1 day | Qori does the heavy lifting in minutes; 1 day allows for review |
| Reporting | 1 day | Readout generation is minutes; 1 day for stakeholder review |

These live in `planHandler.js` as constants. The handler computes phase start/end dates by accumulating durations from the study's planned start date.

The researcher can't currently override these in the modal. This is intentional for alpha — every plan gets the same Qori-style timeline, demonstrating the speed claim consistently.

## Why not cascade-derived for alpha

Cascade derivation requires:
- Reliable signal about what makes analysis longer or shorter (none yet)
- Logic for combining signals into a duration estimate (none designed)
- Empirical calibration — what's the actual time to insight for studies of varying complexity (no data)

Hardcoding the values means every plan ships with the same Qori-style narrative ("1 day analysis, 1 day reporting") and the inconsistency between researchers' expectations and Qori's actual speed becomes visible. That visibility is what we need to gather signal for the v1.1 derivation work.

Premature derivation would either produce noise (wrong durations from bad signal) or false precision (numbers that look calculated but are essentially made up). Hardcoding is honest about what we know.

## Alternatives considered

**LLM-generated durations.** Let the LLM decide phase durations based on study context. Rejected because the LLM defaults to traditional research timelines (the whole reason this ADR exists), and "instruct the LLM to use shorter durations" is exactly the prompt-engineering pattern ADR 0005 was designed to escape from.

**Researcher input.** Add a modal field where researchers specify their preferred durations. Rejected for alpha because asking the researcher requires them to know what the durations should be — which is the question Qori is supposed to answer for them.

**Templated by methodology.** Different methodologies (card sort, usability test, diary study) have different natural durations. Hardcode different values per method. Rejected as premature — we don't have enough data to justify the differentiation, and the marginal accuracy gain is small. Reconsider when the v1.1 derivation work surfaces method-specific patterns.

**Computed from session count and complexity.** Probably the v1.1 answer. Out of scope for alpha.

## Consequences

**Intended:** Research plans consistently show Qori-style timelines, reinforcing the speed-to-value story. Researchers can see at a glance how Qori reframes the time investment compared to traditional research.

**Risk: durations may feel wrong for some studies.** A 50-participant longitudinal study won't have 1 day of analysis in reality; it'll need more. The hardcoded values are right for the typical Qori use case (8-12 participants, focused method, fast turnaround). When researchers run studies that don't match this profile, the timeline will look off.

**Risk: stakeholders may push back on durations.** A government partner reviewing a research plan with "1 day analysis" may question whether the work is actually substantive. The Qori narrative ("the cascade does the heavy lifting; the day is for researcher review") needs to be present in supporting materials.

**Accepted downside:** The fieldwork duration is the only one that's currently calculated (session count × session length). Other phases ignore real context. This is acceptable for alpha because we don't have reliable signal for the other phases yet.

**Signal collection:** As researchers use Qori, we should observe whether the hardcoded durations match reality. If most studies finish in less than 1 day of analysis, the value can decrease; if studies consistently overshoot, the value can increase. The hardcoded values are a starting hypothesis, not a permanent fact.

## When to revisit

- Real usage data from 5-10 completed studies shows consistent patterns of overshoot or undershoot
- A government partner specifically requests dynamic timelines
- v1.1 cascade-derivation work begins — at which point this ADR gets superseded with one documenting the derivation logic
- A researcher reports a study where the hardcoded timeline misled their stakeholder in a meaningful way

## References

- `backend/src/helpers/slack/commands/planHandler.js` — the constants live here
- `backend/config/prompts/research_plan.yaml` — the template references `timeline_phases` from the handler
- Related: ADR 0005 (Handlebars template architecture — sets up the mechanical rendering this depends on)

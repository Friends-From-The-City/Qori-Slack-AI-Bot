# Architecture Decision Records

This directory holds Architecture Decision Records (ADRs) for Qori-Slack. An ADR is a short markdown file capturing a single architectural decision: what was chosen, what alternatives were considered, and why this option won.

ADRs exist for three reasons:

1. **Future readers can reconstruct intent.** When a government partner's engineering team asks "why did you do it this way," the answer lives in the repo, not in someone's head.
2. **Decisions don't get re-litigated.** Without ADRs, the same question gets asked every six months and re-answered slightly differently each time. ADRs lock the answer until something new prompts a revisit.
3. **Drift becomes visible.** When a future change contradicts an ADR, that contradiction is explicit. Either the ADR gets superseded with a clear rationale, or the change gets reconsidered.

## When to write an ADR

Write one when a decision meets any of these criteria:

- Affects more than one file or service
- Constrains future work (e.g., "we will always do X")
- Was non-obvious — multiple reasonable options existed
- Future-you might forget the reasoning in three months
- Will be questioned by a reviewer (internal or external)

You do not need an ADR for routine implementation choices. The bar is "would a thoughtful engineer joining this codebase wonder why we did this." If yes, ADR.

## Format

Each ADR is a single markdown file named `NNNN-short-slug.md` where `NNNN` is a four-digit sequence number. Numbers don't restart; they grow monotonically.

The file follows this structure:

```markdown
# ADR NNNN: [Short title in present tense]

**Status:** [Accepted / Superseded by ADR-XXXX / Deprecated]
**Date:** YYYY-MM-DD
**Decision drivers:** [Who or what prompted this — a bug, a partner requirement, an audit finding]

## Context

What's the situation that requires a decision? What constraints are in play? Two to four paragraphs.

## Decision

What did we choose? Single paragraph, plainly stated.

## Alternatives considered

For each alternative we genuinely considered, one paragraph: what it was, why it didn't win.

## Consequences

What this decision means going forward. Both intended (the wins) and potential downsides (what we accept by choosing this).

## References

Links to relevant Slack threads, PRs, related ADRs, or code locations.
```

## Status lifecycle

- **Accepted** — the active decision
- **Superseded by ADR-XXXX** — a later ADR replaces this one; this ADR is kept for history but no longer reflects current architecture
- **Deprecated** — no longer relevant, but kept for history

Never delete an ADR. Even superseded ones are part of the record.

## Numbering

The first ADR is `0001-record-architecture-decisions.md` (meta — the decision to use ADRs at all). Each subsequent decision gets the next number. If two ADRs are written simultaneously and pick the same number, whoever merges last bumps theirs.

## Reading the existing ADRs

Start with `0001` and read forward. The history is itself useful — it shows how thinking on a topic evolved.

## Index

### Architectural decisions

- [0001 — Record architecture decisions](./0001-record-architecture-decisions.md) — Meta: the decision to use ADRs at all
- [0002 — Canonical participant status enum](./0002-canonical-participant-status-enum.md) — One set of status values, validated at the model layer
- [0003 — Outreach tracking on StudyParticipant](./0003-outreach-tracking-on-studyparticipant.md) — Outreach as first-class event, not derived state
- [0004 — Compensation snapshots on participant creation](./0004-compensation-snapshots-on-creation.md) — Snapshot vs live recalculation
- [0005 — Templates render via Handlebars with bounded LLM slots](./0005-handlebars-template-architecture.md) — The architectural fix; the foundation everything else builds on
- [0006 — Transform upstream variables on consume, not on emit](./0006-transform-on-consume-not-emit.md) — Adapt at the consumer boundary
- [0007 — Cascade variable contracts fail loudly](./0007-cascade-contracts-fail-loudly.md) — Required missing variables throw, don't warn
- [0008 — Render empty rather than fabricate](./0008-empty-over-fabricated.md) — Visible failure beats invisible fabrication
- [0009 — Test infrastructure with factory fixtures and reusable mocks](./0009-test-infrastructure-pattern.md) — The Jest pattern that scales
- [0010 — YAML-processing handlers live in commands/](./0010-handlers-in-commands-directory.md) — events.js is a registration manifest
- [0011 — Hardcoded Qori-style timeline durations](./0011-hardcoded-timeline-durations.md) — Alpha-only; revisit when we have signal
- [0012 — LLM emits structured JSON when output is a table or list](./0012-structured-json-for-llm-outputs.md) — Constrained shape can't drift through paraphrasing

### Lessons (informal ADRs from failure modes)

- [L001 — Service queries default to fetching all model attributes](./L001-fetch-all-model-attributes.md) — From the attribute whitelist bug
- [L002 — Parsers require fuzz inputs covering format variations](./L002-parser-fuzz-coverage.md) — From the comma parser bug
- [L003 — End-to-end tests for critical flows, not just per-layer unit tests](./L003-end-to-end-tests.md) — From three rounds of compensation bugs

The L-prefix distinguishes "lessons" from active design decisions. Lessons capture failure patterns to avoid; decisions document architectural commitments. Both are useful; they serve different purposes.

### Related documents

- [Quarterly architecture audit](../audits/quarterly-architecture-audit.md) — The recurring discipline that surfaces drift

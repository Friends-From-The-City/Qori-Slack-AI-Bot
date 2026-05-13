# ADR 0001: Record architecture decisions

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Government partner readiness; inherited codebase with undocumented design choices; recurring need to re-derive past reasoning.

## Context

Qori-Slack was inherited from a developer who built it as a concept. Many architectural decisions exist in the code but not in any document — the reasoning lives in the original developer's head or has been lost. As the codebase has been hardened for potential government partner handoff, multiple decisions have been made that future readers (or the current owner six months from now) will need to understand: why status is a JavaScript constant rather than a database enum, why compensation snapshots on creation rather than recalculating live, why outreach lives on `StudyParticipant` rather than as a separate table, why templates use Handlebars + bounded LLM slots rather than full LLM generation, and dozens more.

Without a system for capturing decisions, two things keep happening: the same questions get re-asked and re-answered slightly differently each time, and changes that contradict prior decisions get made without anyone noticing. Both are signs that architectural intent isn't being preserved.

This is especially risky for a project headed toward government review, where reviewers will ask "why did you build it this way" and expect the answer to come from documentation, not memory.

## Decision

Adopt Architecture Decision Records (ADRs) as a discipline for capturing architectural decisions. ADRs live in `docs/architecture-decisions/`, follow a standard format (see README.md in that directory), are numbered sequentially, and are committed to the repo alongside the code change that implements the decision.

Going forward, every architectural decision that constrains future work, affects multiple files, or required choosing between non-obvious alternatives gets an ADR.

## Alternatives considered

**No documentation.** What the project has been doing implicitly. The cost is that every architectural conversation gets re-derived from first principles; the value of past decisions decays over time. Rejected because the cost compounds as the codebase grows.

**Comments in code.** Annotate decisions where they apply in the code itself. Useful for tactical choices, insufficient for cross-cutting ones. A decision affecting six files can't live as a comment in any one of them. Rejected as primary mechanism; comments can still be used for local choices.

**Wiki / external docs.** A separate site (Notion, Confluence, etc.) for architectural documentation. Common in larger orgs. Rejected because separation from code creates drift — code changes ship without doc updates. ADRs in-repo are version-controlled with the code they describe.

**ADRs in-repo.** Markdown files committed alongside code. Reviewed in the same PRs as code changes. Discoverable by anyone reading the codebase. Chosen.

## Consequences

**Intended:** Future readers (including future-Lapedra) can reconstruct architectural intent. Government reviewers see a record of deliberate thinking, not just code. Decisions stay decided unless something new prompts a documented revisit. Drift becomes visible when a change contradicts an existing ADR.

**Accepted downsides:** Some friction at the moment of decision — writing the ADR takes 15–30 minutes. Some judgment required about which decisions cross the bar (the README criteria help). Existing decisions made before this point need to be backfilled, which is a separate undertaking.

## References

- `README.md` in this directory — format and process
- Backfill list (see TODOs in ADRs 0002 onward)

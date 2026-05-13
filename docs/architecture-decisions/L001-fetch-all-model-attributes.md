# ADR L001: Service queries default to fetching all model attributes

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Discovered that `getResearchStudyWithRoles` in `research_study.service.js` had a hardcoded `attributes:` whitelist that didn't include `parsed_budget_amount` or `target_participants`. The values were correctly written to Postgres on brief submission, but the plan handler that called `getResearchStudyWithRoles` received a study object where those fields were always `undefined`. Compensation rendered as the fallback for every study, even ones with valid budgets. Three rounds of debugging traced through parser, write path, and finally the service-level read filter.

## Context

Sequelize's `findOne`, `findAll`, etc. accept an `attributes` parameter that acts as a SELECT whitelist. When specified, only the listed columns are fetched from the database. The pattern is appealing for performance — fetch only what you need — and is commonly seen across the codebase.

The pattern has a structural weakness: when a new column is added to a model (via migration and `addColumn`), every service function that uses an `attributes:` whitelist must also be updated to include the new column. There is no compiler check. There is no runtime warning. The new column is silently absent from query results for every caller of that service function.

The pattern's brittleness compounds with the existing JavaScript-without-types reality. A handler accessing `study.parsed_budget_amount` doesn't know the value is undefined because the service excluded it from the SELECT; it just receives `undefined` and downstream logic treats it as "no value." The bug surfaces only when a user notices wrong output.

This is exactly the bug pattern documented in CC's architecture audit as a coupling concern: "Handler ↔ YAML field names. Every handler hardcodes the field names it passes to processYamlTemplate. If we restructure a template's output sections, we need to verify the handler still passes every variable the new static sections reference. There's no validation — missing variables render as empty strings silently." The attribute whitelist is the same problem one layer earlier — missing variables in the service layer become silent undefined values in the handler layer.

## Decision

Service queries default to fetching all model attributes. Whitelisting is an exception requiring explicit justification, not the default.

Concretely:

- New service functions: do not use `attributes:` unless there's a specific performance need
- Existing service functions with `attributes:` arrays: review during quarterly audit (Section 3.1) for missing columns
- When `attributes:` is genuinely needed: add a comment block above the array stating "WARNING: this is a whitelist. Adding a column to the model means adding it here too." The comment makes the maintenance contract visible

For performance optimization: prefer indexed queries, query result caching, or pagination over column whitelisting. The performance gain from omitting a few columns is usually negligible compared to the cost of bugs like the one this ADR was prompted by.

## Why this is a lesson, not just a fix

The fix for the specific bug was one line: add the two columns to the whitelist. The lesson is that *this category of bug will recur* as long as the pattern is used. Every future column added to a model with whitelisted service queries is a potential silent-undefined bug. The decision documented here is to default to the safer pattern going forward.

## Alternatives considered

**Lint rule to detect whitelist drift.** Write a linter that checks every `attributes:` array against the corresponding model's columns. Rejected as a follow-up project, not a now-decision; would require ESLint custom rule infrastructure. Worth pursuing if the pattern recurs after this ADR.

**Type system catches it.** TypeScript would catch the bug at compile time: if `getResearchStudyWithRoles` declares a return type of `Pick<ResearchStudy, 'id' | 'name' | ...>` (the whitelist), then `study.parsed_budget_amount` access fails the type check. This is the right long-term answer and is captured in the TypeScript migration discussion. Doesn't help in the current JavaScript codebase.

**Tests catch it.** Add tests that exercise the service function with every column populated and assert the returned object includes all of them. Rejected as redundant — the test would essentially restate the model's schema. The default-fetch-all approach makes the test unnecessary.

**Convention without enforcement.** Document the pattern in code comments and hope future engineers comply. Rejected because the existing pattern already has implicit convention ("only fetch what you need") and that's what produced the bug. Stronger default needed.

## Consequences

**Intended:** Future column additions automatically flow through service queries to handlers without requiring careful tracking of every read path. The class of bug — column added, read paths not updated, silent undefined values — becomes impossible by construction.

**Performance impact:** Negligible. The columns in question are small (strings, integers, decimals, timestamps). Postgres returning a few extra columns per query is cheaper than the engineering cost of tracking whitelist sync. If a future model accumulates very large columns (large text blobs, JSON blobs) where the size of unwanted columns matters, whitelist in those specific cases with the warning comment.

**Audit implication:** Quarterly audit Section 3.1 explicitly checks for attribute whitelists and verifies they include all model columns. The audit's job is to catch any new whitelists that get introduced.

**Migration of existing whitelists:** Out of scope for this ADR. Existing whitelists stay unless an audit identifies a missing column. New whitelists require justification.

## When to revisit

- A column is identified that's genuinely too large to fetch on every read (large JSON, large text)
- TypeScript migration completes — at that point, type-checked attribute lists become safer than default-fetch-all, and this ADR may be superseded

## References

- `backend/src/services/research_study.service.js`
- The bug that prompted this ADR: `getResearchStudyWithRoles` returning a study without `parsed_budget_amount` or `target_participants`, causing compensation to render as fallback text for every study
- Related: ADR 0008 (empty over fabricated — describes the *visible* failure mode that helped surface this bug)

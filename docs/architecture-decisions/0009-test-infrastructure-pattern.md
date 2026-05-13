# ADR 0009: Test infrastructure with factory fixtures and reusable mocks

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Architecture audit confirmed the template system had effectively zero test coverage — two existing test files (HTTP health check, auth flow) and nothing exercising the YAML processor, handlers, or template rendering. Before restructuring 23 templates we needed a test foundation that could catch regressions, but the patterns for how to write those tests didn't exist in the codebase. Foundation 1a established the pattern; this ADR captures why.

## Context

The codebase had Jest installed but barely used. The two existing tests used Mocha syntax and covered surface-level concerns. The YAML template processor — the most architecturally significant component, responsible for rendering every document Qori produces — had no tests.

Restructuring 23 templates without a regression safety net is reckless. Each restructure changes shape, variable names, output structure. Any of those changes can break downstream behavior in non-obvious ways (a renamed variable silently rendering empty, a moved section breaking expected ordering, a new handler-side calculation diverging from an old prompt-side calculation).

The needs for the test infrastructure:

- Test the actual processor behavior (not just unit functions in isolation)
- Run without external dependencies (no real LLM calls, no real Postgres, no real GitHub)
- Catch the specific failure modes we care about — wrong values in output, missing required variables, malformed structured data
- Be cheap to write (otherwise tests don't get added per template)
- Be cheap to maintain (otherwise tests become technical debt)

## Decision

Test infrastructure consists of three reusable patterns living under `backend/src/__tests__/`:

**1. Factory fixtures.** Each fixture file exports a factory function that returns a fresh object with sensible defaults, accepting an overrides argument for test-specific customization. No shared mutable state between tests. Adding a new test never touches an existing fixture.

```js
// study.fixture.js
function makeStudy(overrides = {}) {
  return {
    id: 1,
    name: 'test-study',
    researcher_name: 'Test Researcher',
    parsed_budget_amount: 800.00,
    target_participants: 10,
    // ... more defaults
    ...overrides,
  };
}
```

**2. Module-level mocks for external dependencies.** Each external dependency that the processor uses has a corresponding mock file that exposes a predictable surface and exports mock functions tests can configure:

- `langchain.mock.js` — stands in for LLM calls, returns predetermined strings
- `github.mock.js` — stands in for GitHub commits and reads, returns fake responses
- `studyVariables.mock.js` — stands in for Postgres reads, returns canned cascade variables
- `variableExtractor.mock.js` — stands in for the async post-write variable extraction

Mocks return safe non-empty defaults so tests don't crash if they forget to set return values. Each test can override the default for the specific scenario it tests.

**3. Tests organized by template.** Each YAML template gets a corresponding test file at `__tests__/templates/{template_name}.test.js`. Tests focus on the template's rendered output behavior, using the fixtures and mocks to set up scenarios.

The README documents the pattern so future tests can be added by copying an existing template's tests, swapping the fixture data, and adjusting assertions.

## Alternatives considered

**Snapshot tests as the default.** Foundation 1b will add snapshot tests — render a template with canonical inputs, save the output as a snapshot, fail any test that produces different output. Considered as the primary pattern instead of explicit assertions. Rejected as the primary pattern because snapshot tests catch all changes (including intentional ones), which produces high-noise test failures during active development. Added as a complement to explicit-assertion tests, not as a replacement.

**End-to-end tests through real services.** Set up a test Postgres database, a sandboxed GitHub repo, and call real APIs. Rejected because the cost is high (CI infrastructure, slow test runs, flaky external calls), and the marginal protection over mocked tests is small for most failure modes. Reconsidered as a separate concern in ADR L003.

**Test specific functions in isolation, not the processor.** Write unit tests for individual handler functions, parser functions, etc. Rejected as the primary pattern because the bugs we cared about were integration bugs — handler not passing the right data to processor, processor not rendering the right shape from the data. Unit tests would have missed all three rounds of compensation bugs.

**No tests, rely on manual verification.** Considered briefly given the project's pace. Rejected because the 23-template restructure is a multi-week effort and manual verification of every template after every change is impossibly expensive. The cost of writing tests is much smaller than the cost of regression bugs that escape to production.

## Consequences

**Intended:** Tests catch regressions during template restructure work. Adding a new template test takes 15-30 minutes by following the established pattern. The test suite grows naturally as templates get restructured rather than as a separate workstream.

**Test count grows with template work, not separately.** Each template restructure instruction includes "add 3-5 tests" as part of acceptance criteria. By the time all 23 templates are restructured, every template has baseline coverage. No catch-up sprint required.

**Test costs are stable.** Adding a 24th template (or 100th) follows the same pattern. The infrastructure scales linearly with templates because each template gets its own test file and fixture overrides.

**What this doesn't catch:** Bugs that span layers (the attribute whitelist bug, the parser bug) aren't caught by template-level tests. ADR L003 addresses end-to-end coverage for those.

**Maintenance cost:** Fixtures and mocks need to evolve when the model or processor evolves. Acceptable cost given the patterns are isolated to `__tests__/` and don't bleed into production code.

## When to revisit

- Foundation 1b adds snapshot tests as a complement — at that point, document the snapshot pattern in this directory too
- The TypeScript migration changes the type signatures — fixtures and mocks may need typing
- A new pattern emerges (e.g., testing async variable extraction) that doesn't fit the existing three patterns

## References

- `backend/jest.config.js`
- `backend/src/__tests__/README.md`
- `backend/src/__tests__/__fixtures__/`
- `backend/src/__tests__/__mocks__/`
- `backend/src/__tests__/templates/research_plan.test.js`
- Foundation 1a: lightweight template processor tests
- Related: ADR L003 (end-to-end tests — fills the integration gap this ADR doesn't cover)

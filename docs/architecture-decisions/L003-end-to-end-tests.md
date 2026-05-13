# ADR L003: End-to-end tests for critical flows, not just per-layer unit tests

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Three rounds of compensation bugs, each in a different layer. Each round we thought we'd fixed the problem; each round revealed the bug was actually one layer earlier. Round 1 was the LLM fabricating values (template architecture). Round 2 was the comma parser bug (parsing logic). Round 3 was the attribute whitelist excluding the columns (service layer). Per-layer unit tests would have caught each in isolation if they'd existed, but the bugs were *gaps between layers* — the parser worked, the handler worked, the service worked, the template worked, and still the system produced wrong output because the layers didn't agree on what data flowed between them.

## Context

The natural unit of testing for the existing infrastructure is the template processor — render a template with mock inputs, assert on output. This is what Foundation 1a established and ADR 0009 documents. It's the right level for catching template-restructure regressions.

But it doesn't catch integration failures. The template processor tests use fixture data that's already in the shape the processor expects. They don't exercise the real path: brief modal submission → parser → service write → service read → handler assembly → template processing → rendered output. Each of those steps has its own surface, and bugs can hide at the boundaries.

Three concrete examples from the compensation incident:

1. **Round 1:** The LLM fabricated `$75` instead of `$80`. Template processor tests didn't catch this because the LLM mock returned predictable strings, so the test never exercised the actual LLM-renders-wrong-value path. Fixed by architectural restructure (ADR 0005).

2. **Round 2:** The parser returned `1` instead of `1000` for `$1,000` input. Parser unit tests didn't catch this because they tested `$1000` (no comma), `$800`, and `$800.00`. The comma case wasn't in the test set. Fixed by regex correction.

3. **Round 3:** The service function excluded `parsed_budget_amount` from the SELECT, so the handler saw `undefined`. No test caught this because:
   - Service tests would have asserted the function returns *some* study object, not that the object contains specific fields
   - Template processor tests used fixture data that already had the field set
   - Handler tests don't exist as a separate category
   - Nothing exercised the full path from "study created with budget" to "plan rendered with correct compensation"

The pattern across all three: each layer in isolation was test-coverable. The integration was not. Each test we had passed; the system still didn't work.

## Decision

For critical flows, add at least one end-to-end test that exercises the full path from input to rendered output. "Critical flow" means any user-facing capability that depends on values flowing correctly across multiple layers.

The initial set of critical flows requiring end-to-end coverage:

- **Compensation flow.** Create a study with a budgeted brief, generate a plan, assert the rendered output contains the correct calculated compensation
- **Status transitions.** Add a participant with status `not_contacted`, update to `confirmed`, assert dashboard count reflects the change
- **Outreach event tracking.** Add a participant, send outreach, assert `outreach_sent_at` is populated and status auto-advances to `contacted`
- **Cascade variable flow.** Submit a brief with objectives, run plan generation, assert objectives appear in plan output with citation markers

Each end-to-end test follows this pattern:

```js
test('compensation flows from brief to plan output', async () => {
  // 1. Set up the input (study with budgeted brief)
  const study = await createStudyWithBrief({ budget: '$1000', target: 10 });
  
  // 2. Trigger the operation (generate the plan)
  const planOutput = await generatePlanForStudy(study);
  
  // 3. Assert on the final output
  expect(planOutput.rendered).toContain('$100 per participant');
  expect(planOutput.rendered).toContain('$1000 budget');
});
```

The test uses the real service functions, the real handlers, the real template processor. It mocks only the external dependencies that can't be in-process (LLM, GitHub, Slack). It exercises every layer between input and output.

## Why this is a lesson, not just a fix

The fix for each round was a one-line change in a specific layer. The lesson is that *per-layer testing creates a false sense of coverage when bugs live at layer boundaries*. Future bugs of this category will recur unless integration-level tests exist.

This is more expensive than unit tests — each end-to-end test is slower, more code, and more setup. But the cost of three rounds of debugging spread over a week (each requiring full diagnostic cycles) is much higher.

## How this complements ADR 0009 (test infrastructure)

ADR 0009's pattern — template processor tests with fixtures and mocks — catches:
- Template rendering regressions
- Handler-to-template data shape issues
- Schema violations in LLM-emitted JSON

This ADR's pattern — end-to-end tests for critical flows — catches:
- Service layer column mismatches (the attribute whitelist bug)
- Cross-layer data shape drift
- Bugs in the path between layers where each layer in isolation looks correct

The two are complements, not alternatives. Per-template tests give wide coverage; end-to-end tests give deep coverage for the flows that matter most.

## Alternatives considered

**Test every layer's outputs against the layer's documented contract.** Write tests that assert "service returns X with field Y populated." Rejected as too prescriptive — would essentially restate every model's schema in tests, with high maintenance cost. The end-to-end test catches the same failure mode at lower maintenance cost (the test only specifies inputs and outputs, not intermediate shapes).

**Manual verification as the final gate.** What we've been doing implicitly. The problem: manual verification of every change across every critical flow doesn't scale, and bugs slip through because manual reviewers see the document looks plausible.

**Property-based testing.** Generate random inputs, run through the system, assert invariants hold. Considered for future. The current unit-test-and-end-to-end-test approach is more accessible to write and reason about for the current codebase. Reconsider as the system matures.

**Visual snapshot tests of rendered documents.** Foundation 1b will add this. Catches different things than end-to-end tests — snapshots catch "output changed" without caring why; end-to-end tests catch "specific value is wrong" with explicit assertions. Both are useful.

## Consequences

**Intended:** Each critical flow has a regression test that exercises the real path. Bugs that hide at layer boundaries become impossible to ship — they fail the test before production.

**Test count grows modestly.** A few end-to-end tests per critical flow, maybe 10-20 total. Not the same scale as per-template tests.

**Setup cost.** End-to-end tests require enough infrastructure to run the real service functions, real handlers, real template processor. Mocking the external boundaries (LLM, GitHub, Slack) needs care to make tests reproducible. This is a one-time setup cost.

**Slower test runs.** End-to-end tests are slower than unit tests. The full test suite may grow from seconds to tens of seconds. Acceptable; still fast enough for developer iteration.

**Audit implication.** Quarterly audit Section 5.4 explicitly checks end-to-end test coverage for critical flows. New critical flows added without end-to-end tests are flagged.

**When to write the e2e test for a new flow:** Same time as the feature ships. If a feature is described as "ships when the compensation flow works end-to-end," then the e2e test is part of the acceptance criteria for that feature. Not a follow-up.

## When to revisit

- A different testing strategy proves more effective (property-based, contract testing)
- The test infrastructure becomes a bottleneck for development speed (would suggest the pattern needs simplification)
- TypeScript migration makes some failure modes impossible at compile time — at that point, this ADR may be partially superseded

## References

- The three compensation bug rounds documented in chat history
- `backend/src/__tests__/` — where end-to-end tests should live (subdirectory TBD: probably `__tests__/integration/`)
- Quarterly audit Section 5.4
- Related: ADR 0009 (test infrastructure pattern — what this complements), ADR L001 (attribute whitelist), ADR L002 (parser fuzz coverage)

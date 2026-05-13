# ADR L002: Parsers require fuzz inputs covering reasonable format variations

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** `parseBudget('$1,000')` returned `1` instead of `1000`. The regex captured the comma-formatted number, `parseFloat` interpreted the comma as a decimal separator (some locales use comma where US uses period), and the result was off by three orders of magnitude. The function shipped with happy-path tests (`$800`, `$800.00`) that all passed. The bug surfaced when a researcher typed `$1,000` — a format that's at least as common as `$1000` in real budget data.

## Context

A parser converts free-text user input into structured data. The fundamental property of a parser is: for any input from the population it's expected to handle, return the right structured result.

Happy-path tests (the input formats the developer thought of) verify only a small slice of expected inputs. The dangerous inputs are the ones the developer didn't think of — the variations that real users naturally produce because of regional convention, professional habit, or simple variation in how people format numbers, dates, or other structured text.

Money parsing is the canonical case: `$1000`, `$1,000`, `$1000.00`, `$1,000.00`, `1000`, `1000 USD`, `$1k`, `$1.0k`, `$1 thousand`, all map to the same intended value. A parser that handles only the first format will silently produce wrong results for any user who types one of the others.

The wrong-result failure mode is particularly bad for money because the result still looks like a number. A budget showing `$1` instead of `$1000` is comical to spot once — but a `$1,500` input parsing as `$1.50` is plausible enough that a stakeholder might not notice. The visible-failure case (`$1`) is fortunate; silent miscalculations in this category are not.

## Decision

Parsers in this codebase require fuzz testing — explicit test inputs covering every reasonable format variation, including ones the developer didn't initially think of.

Concretely:

**For each parser, the test file must include:**

1. Happy-path cases (the formats the developer thought of)
2. Format variations that real users produce (commas, units, prefixes, suffixes, whitespace)
3. Edge cases (empty, null, undefined, very large, very small, zero, negative)
4. Negative cases (inputs that should be rejected — and an assertion that they return the documented null/error)
5. Adversarial cases (inputs with multiple plausible interpretations — and an assertion of which one the parser picks)

**The test must check returned values, not just types.** `expect(parseBudget('$1,000')).toBe(1000)` is the right shape, not `expect(typeof parseBudget('$1,000')).toBe('number')`. The latter would have passed against the buggy implementation that returned `1`.

**Negative-case rejection must be tested as explicitly as positive-case acceptance.** If the parser is documented to reject ranges, qualifiers, or ambiguous inputs, those rejection cases need tests too. Otherwise a future "improvement" might accept them and silently change behavior.

## Why this is a lesson, not just a fix

The fix for the comma bug was one line of regex. The lesson is that this category of bug will recur for any parser that doesn't have fuzz coverage. Date parsers, participant-count parsers, file-path parsers, study-name parsers — any function that converts free-text input into structured data has the same risk pattern. The decision documented here is to make fuzz coverage a parser-writing requirement, not an afterthought.

## Required fuzz cases for budget-like parsers

These specific cases must be covered for any future money parser:

- `$800`, `$800.00` — plain dollar amount
- `800`, `800.00` — no dollar sign
- `$1,000`, `1,000` — comma-formatted thousand
- `$1,000.00`, `1,000.50` — comma plus decimal
- `$1000`, `$10000` — multi-digit no comma
- `$1,000,000` — multi-comma
- ` $800 `, ` 800 ` — leading/trailing whitespace
- `$800 participant incentives` — dollar amount with trailing text
- Empty string, null, undefined — rejection cases
- `TBD`, `Procurement pending`, `Around $800`, `$500-$1000`, `$800 + travel` — rejection cases per spec
- `$0`, `$0.00`, `0` — zero cases (return null per spec; the parser rejects zero)
- `0` (number type, not string) — rejection of non-string input

## Alternatives considered

**Use a parser library.** Adopt a money-parsing library like `currency.js` or `accounting.js`. Rejected for the current parser because the rejection cases (ambiguous inputs that the spec says should return null) are specific to our requirements and don't map cleanly to library behavior. May reconsider if multiple money fields are added.

**Type system constrains inputs.** TypeScript would help slightly — the function signature could require `string` and reject the `parseBudget(1000)` case at compile time. Doesn't help with the comma case, which is still a string input with format variation. Still worth doing in the TypeScript migration but doesn't supersede this ADR.

**Manual review at parse time.** Show the parsed result to the user before saving ("We parsed your budget as $1000. Is this correct?"). Considered for future UX. Doesn't replace this ADR; the parser still needs to be correct in cases where confirmation isn't appropriate (batch processing, API submissions).

## Consequences

**Intended:** Future parsers ship with their failure modes already covered. Format variations don't surface as production bugs three months after release. The class of bug — parser handles happy path but fails on common variation — becomes harder to commit because tests force consideration of variations during development.

**Cost:** Writing fuzz tests is more work than writing happy-path tests. Probably 30 extra minutes per parser. Acceptable for the reliability gain.

**Audit implication:** Quarterly audit Section 5.3 explicitly checks parser test coverage. Parsers without fuzz tests are flagged for follow-up.

**Existing parsers:** `parseBudget` has been fixed. `parseParticipantTarget` (extracts integer from text like "8-12 Veterans") should be audited next; it likely has the same happy-path-only test coverage.

## When to revisit

- A parser library matures that covers our specific rejection cases
- TypeScript migration enables more constraint at the type level (doesn't fully replace this ADR but reduces the surface)
- A new parser is added and its fuzz coverage requirement feels excessive — at which point reconsider whether the parser is doing too much

## References

- `backend/src/utils/budgetParser.js` — the function this lesson applies to
- The bug that prompted this ADR: `parseBudget('$1,000')` returning `1` instead of `1000`
- Quarterly audit Section 5.3
- Related: future parsers (`parseParticipantTarget`, etc.) should follow this pattern

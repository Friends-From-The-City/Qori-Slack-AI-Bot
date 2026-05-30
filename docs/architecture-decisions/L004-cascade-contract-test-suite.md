# L004: Cascade contract test suite

**Status:** Partially implemented (1 of 5 handlers guarded)
**Date:** 2026-05-30
**Learned from:** ADR 0018 audit finding — synthesis declared consumes blocks but bypassed them entirely
**Implemented:** 2026-05-30 — Infrastructure fix + real contract tests for synthesis
**Backfill scope:** 4 remaining cascade handlers (readout, brief, plan, session_summary)

## The failure

The `/qori-synthesis` handler declared cascade dependencies in YAML `consumes:` blocks — `atomic_nugget_core`, `atomic_nugget_detail`, optional enrichments like `validated_themes`. The YAML templates referenced these variables with Handlebars conditionals (`{{#if upstream_atomic_nugget_core}}`).

But the handler never called `readUpstreamVariablesByContext()`. It passed raw `combined_file_content` (concatenated file text) and the templates ran against that. The cascade architecture existed, the contracts were declared, but **the wiring was never connected**.

This went undetected because:
1. Synthesis "worked" — it produced output from raw text
2. No test asserted the declared contract matched actual behavior
3. The consumes blocks looked correct on inspection
4. Output quality degradation was subtle (less traceable, more generic) — not a hard failure

## The lesson

**Cascade contracts need contract tests, not just plumbing tests.**

A test that asserts "the loader returns something" catches plumbing failures. It does not catch contract drift — where the YAML declares one thing and the handler does another.

For every handler that processes a YAML template with a `consumes:` block, there must be a test that:

1. Parses the YAML's `consumes` declarations
2. Mocks the variable store with appropriate test data
3. Runs the handler (or the contract-loading portion)
4. Asserts the loaded variables match the declared contract exactly
   - Required vars are all present
   - No undeclared vars sneak in
   - Pool variables aggregate correctly (N items → array of N)
   - Optional vars load when present, don't block when absent

This test fails if someone adds a `consumes` entry but forgets to wire it, or removes a variable load but leaves the declaration.

## Systemic finding: 4 of 5 cascade handlers lack contract tests

The synthesis bug — declared consumes blocks but bypassed them — could exist unguarded in 4 other handlers. They probably work today (we've run them), but nothing in CI would catch the same class of bug. This is a **guard gap**, not a known active bug.

**The synthesis test was member 1 of 5.** The inject infrastructure is now in place, so each remaining test is cheap (~50 lines following the synthesis pattern).

| Handler | Template | Contract Test Status | Priority |
|---------|----------|---------------------|----------|
| `researchSynthesisHandler` | affinity_mapping, journey_mapping, persona_generation, jobs_to_be_done, usability_issues, design_opportunities | ✅ **Done** (ADR 0018) | — |
| `readoutHandler` | research_readout | ❌ **Unguarded** | High (federal readiness) |
| `briefHandler` | research_brief | ❌ **Unguarded** | High |
| `researchPlanHandler` | research_plan | ❌ **Unguarded** | High |
| `analyzeNotesHandler` | session_summary | ❌ **Unguarded** (emits, not consumes) | Medium |

**What "unguarded" means:** These handlers may correctly load cascade variables today, but if someone breaks the wiring (removes a `readUpstreamVariablesByContext()` call, changes a key name, etc.), no test will fail. The synthesis bug went undetected for this exact reason.

**Backfill pattern:** Each test should:
1. Use `injectSequelizeForTest(getTestDb())` to unify DB connections
2. Seed required cascade variables to the test DB
3. Call the handler's cascade-loading function
4. Assert loaded variables match YAML `consumes` declarations

The synthesis tests (`synthesis-cascade-contract.test.ts`) demonstrate the pattern:
- **Structure tests**: Verify `TEMPLATE_CONSUMES` declarations are correct
- **Integration tests**: Verify handler helpers actually read seeded data from the variable store
- **Readiness tests**: Verify missing required → not ready; all present → ready

## Pattern

```typescript
describe('cascade contract: affinity_mapping', () => {
  it('loads all required variables declared in consumes block', async () => {
    // 1. Parse YAML to get consumes declarations
    const yaml = await fetchYamlTemplate('affinity_mapping.yaml');
    const requiredVars = yaml.consumes
      .filter(c => c.required)
      .map(c => c.key);

    // 2. Set up variable store with test data
    await seedStudyVariables(testStudyId, {
      atomic_nugget_core: [/* pool items */],
      atomic_nugget_detail: [/* pool items */],
    });

    // 3. Run the contract-loading portion
    const loaded = await readUpstreamVariablesByContext(
      { projectId, studyId },
      yaml.consumes
    );

    // 4. Assert contract holds
    for (const key of requiredVars) {
      expect(loaded[key]).toBeDefined();
      expect(loaded[key].value).not.toBeNull();
    }
  });

  it('aggregates pool variables correctly', async () => {
    // Seed 3 participants with nuggets
    await seedPoolVariable('atomic_nugget_core', [
      { participant_id: 'PT-001', ...nugget1 },
      { participant_id: 'PT-002', ...nugget2 },
      { participant_id: 'PT-003', ...nugget3 },
    ]);

    const loaded = await readUpstreamVariablesByContext(...);

    // Should be array of 3, not 1, not flattened
    expect(Array.isArray(loaded.atomic_nugget_core.value)).toBe(true);
    expect(loaded.atomic_nugget_core.value.length).toBe(3);
  });

  it('runs without optional vars when absent', async () => {
    // Seed only required vars, no validated_themes
    await seedStudyVariables(testStudyId, {
      atomic_nugget_core: [...],
      atomic_nugget_detail: [...],
      // NO validated_themes
    });

    // Should not throw
    const loaded = await readUpstreamVariablesByContext(...);
    expect(loaded.validated_themes).toBeUndefined();
  });
});
```

## Infrastructure: DB instance unification

The initial contract tests failed because `studyVariables.ts` used `require('../database')` to get the Sequelize instance, while tests used a separate `getTestDb()` instance. Data seeded to the test DB was invisible to the functions under test.

**Fix**: Added dependency injection to `studyVariables.ts`:

```typescript
// In studyVariables.ts
let _injectedSequelize: Sequelize | null = null;

export function injectSequelizeForTest(instance: Sequelize): void {
  _injectedSequelize = instance;
}

export function clearInjectedSequelize(): void {
  _injectedSequelize = null;
}

function getSequelizeInstance(): Sequelize {
  if (_injectedSequelize) return _injectedSequelize;
  return require('../database') as Sequelize;
}
```

Tests call `injectSequelizeForTest(getTestDb())` in `beforeAll()` to unify the connection. This pattern can be reused for other handlers that need real DB integration tests.

## References

- ADR 0018: Cascade-aware synthesis modal (where this lesson was learned)
- ADR 0007: Cascade contracts fail loudly (the principle; this lesson adds the enforcement)
- `backend/src/helpers/studyVariables.ts`: `readUpstreamVariablesByContext()`, `injectSequelizeForTest()`
- `backend/src/__tests__/integration/synthesis-cascade-contract.test.ts`: Real contract tests

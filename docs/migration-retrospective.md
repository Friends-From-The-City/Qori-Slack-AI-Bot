# TypeScript migration retrospective

**Migration period:** 2026-05-13 to 2026-05-18
**Phases:** 7 (foundation → types → models → handlers → utilities → tests/audit → documentation)
**Estimated total:** 32–48 days CC time
**Actual total:** ~10–12 days CC time (~4x faster than estimated)

## What the migration set out to do

The codebase was untyped JavaScript with no meaningful test coverage. Five distinct bug classes had been identified through production incidents and code audits. The migration aimed to add type safety across the full stack (models → services → handlers → utilities), establish test coverage for critical flows, and create architectural enforcement that outlives any individual developer.

See `docs/typescript-migration-plan.md` for the phase-by-phase plan.

## What was delivered

**Type safety:**
- 13 Sequelize models with `InferAttributes`/`InferCreationAttributes` generics (ADR 0014)
- ~75 handler functions using Bolt's native middleware types (ADR 0015)
- 12 services with typed model return values
- 41 UI builders, 16 helpers, 2 utilities migrated to TypeScript
- `any` count: unmeasured → 202 (all in bounded categories with one-line justification)
- 47 `@ts-expect-error` for genuine Sequelize/Bolt type gaps

**Test coverage:**
- 0 → 110 tests (76 unit + 34 integration)
- 5 critical flow e2e tests against real Postgres (compensation, status transitions, outreach, cascade variables, full workflow)
- 5 pattern enforcement assertions (cascade error typing, deprecated type detection, `any` budget, events.ts boundary, TemplateContractError contract)
- 51 parser fuzz test inputs (budget parsing, participant target parsing)
- All 10 tests deliberately broken and verified to catch their claimed failures

**Architectural enforcement:**
- 15 ADRs + 3 lessons-from-failure documenting significant decisions
- Pattern enforcement tests that fail if conventions are violated
- Quarterly audit checklist with completed post-migration audit
- CI pipeline running typecheck + unit tests + integration tests

**Bug classes closed:**
1. **Attribute whitelist hiding columns** — `getResearchStudyWithRoles` excluded `parsed_budget_amount` and `target_participants`. Typed model returns make missing attributes a compile-time error.
2. **DECIMAL string coercion** — `parsed_budget_amount` returned as string from Sequelize, breaking arithmetic. Model getter coerces to number (ADR 0014).
3. **Participant status casing chaos** — 15 string representations of 9 concepts. Canonical enum with model validation and normalization migration (ADR 0002).
4. **Comma-formatted budget parsing** — `$1,000` parsed as `1`. Parser rewritten with 34 fuzz test inputs (ADR L002).
5. **Silent cascade failures** — Missing upstream variables rendered as empty fields. Now throw `TemplateContractError` with researcher-facing DM (ADR 0007).

## What worked well

**Stage 1 review gates.** Every phase started with a single-file reference migration (planHandler for Phase 4, planHandler again for Phase 6 Bolt typing). The review gate pattern caught pattern issues before they propagated to ~75 files. Both the Sequelize model pattern (Phase 3) and the Bolt middleware pattern (Phase 6) were refined during Stage 1 before bulk migration.

**Pattern discovery → bulk migration cadence.** Once a pattern was established and approved, bulk migration was mechanical and fast. Phase 3 (13 models + 12 services) took ~1 day. Phase 6 Stream 1 (75 handlers + events.ts) took ~0.5 day. The pattern decision is the bottleneck; the migration is just typing.

**Deliberate-break verification.** Stream 3's deliberate-break pass surfaced two real weaknesses in the pattern enforcement tests: the `any` budget test only counted `as any` (missing `: any`), and the TemplateContractError import check was defeated by commented-out import lines. Both were fixed in place. This took ~30 minutes and prevented two latent gaps in long-term enforcement.

**Typed model returns catching real bugs.** The DECIMAL coercion issue and the attribute whitelist bug were found because TypeScript forced explicit handling of return types that JavaScript silently accepted.

## What was harder than expected

**Sequelize TypeScript pattern decision (Phase 3).** Three patterns exist for typing Sequelize v6 models. The evaluation required reading each pattern's trade-offs carefully and testing against the actual model layer. The decision (ADR 0014) was ultimately clear, but the evaluation took disproportionate time relative to the implementation.

**events.js extraction scope (Phase 4 Stage 3).** The registration manifest (`events.js`, later `events.ts`) had inline handler logic mixed with registrations. Extracting 20 handlers into their own files was necessary for the TypeScript migration but wasn't originally in the Phase 4 scope estimate. This was the single biggest scope expansion.

**Transitive dependency chains in test infrastructure (Phase 6 Stream 2).** `user.model.ts` imports `helpers/token.js` which requires `jsonwebtoken`. This chain broke the integration test environment because the test setup loads models but doesn't bootstrap the full application. The fix was targeted mocks for `jsonwebtoken` and `nodemailer`, but diagnosing the chain took longer than writing the mocks.

**Bolt `view_closed` event type gap.** Bolt's `SlackEvent` union type doesn't include `view_closed`. The handler was registered as `slackApp.event('view_closed', ...)` which is valid at runtime but not typeable. This required a documented `as any` cast — the only one remaining in events.ts.

## Time estimates vs. actual

| Phase | Estimated | Actual | Ratio |
|-------|-----------|--------|-------|
| 1 (foundation) | 3–5 days | 0.5 day | 6–10x faster |
| 2 (type definitions) | 3–4 days | 0.5 day | 6–8x faster |
| 3 (models + services) | 4–6 days | 1 day | 4–6x faster |
| 4 (handlers) | 4–6 days | 2 days | 2–3x faster |
| 5 (utilities + close-out) | 6–9 days | 3 days | 2–3x faster |
| 6 (tests + audit) | 8–12 days | 1 day | 8–12x faster |
| 7 (documentation) | 1 day | ~0.5 day | 2x faster |
| **Total** | **32–48 days** | **~10 days** | **~4x faster** |

The early phases were fastest because the pattern decisions (once made) cascaded forward. The later phases were closer to estimates because they involved more unique work (handler extraction, test infrastructure, audit).

## Lessons for future architecture work

1. **Estimate the pattern decision, not the file count.** The migration's actual bottleneck was "how do we type Sequelize models?" and "how do we type Bolt handlers?" — each a 1-2 hour decision. The bulk migration across 75 files was ~2 hours each time. Traditional estimates focus on file count; they should focus on the number of pattern decisions.

2. **Stage 1 review gates prevent exponential rework.** A bad pattern decision propagated to 75 files is 75 files of rework. A bad pattern caught at Stage 1 is one file of rework. The gate adds ~30 minutes and saves potentially days.

3. **Deliberate-break is cheap insurance.** Breaking each test to verify it catches the claimed failure took ~30 minutes total for 10 tests. Two of those breaks surfaced real weaknesses. The expected value of this practice is strongly positive.

4. **Type safety finds bugs that code review misses.** The DECIMAL string coercion bug existed for weeks and passed every code review. TypeScript surfaced it immediately when the model return type was declared as `number | null` but Sequelize returned `string`. This class of bug is invisible to human review and obvious to the type checker.

5. **Test infrastructure is a one-time cost with compound returns.** The Postgres test DB setup (Stream 2) took ~2 hours. Every integration test written after it — 34 so far — uses that infrastructure. The marginal cost of the next test is ~5 minutes of writing, not ~2 hours of setup.

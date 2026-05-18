# TypeScript Migration Plan — Progress Tracker

See ADR 0013 for the decision and rationale. This file tracks actual progress against estimates.

## Phase completion log

| Phase | Scope | Estimated | Actual | Date | Notes |
|-------|-------|-----------|--------|------|-------|
| 1 | TypeScript foundation, tsconfig, Jest TS, CI/CD | 3-5 days | ~0.5 day | 2026-05-13 | Faster than expected. Railway deployment fix added ~1hr of debugging (pre-deploy runs in ephemeral container). |
| 2 | Type definitions: cascade variables, models, handlers | 3-4 days | ~0.5 day | 2026-05-13 | YAML schema audit was the bulk of the work. Sequelize pattern decision (ADR 0014) was straightforward once models were audited. |
| 3 | Service + model layer migration | 4-6 days | ~1 day | 2026-05-13 | Stage 1 review gate caught the model-return-type issue (Option A — class at module scope). Once that pattern was established, bulk migration was mechanical. 13 models, 12 services. |
| 4 | Handler layer migration | 4-6 days | ~2 days CC time | 2026-05-15 | 4 stages over ~3 weeks calendar. Stage 1: planHandler pattern + review gate. Stage 2: synthesis + readout handlers. Stage 3: extraction of 20 handlers from events.js. Stage 4: 7 remaining .js handlers. Smoke tested all 10 command areas on staging. Surfaced 5 latent bugs: studySetupModal static object, private_metadata key mismatch, TemplateContractError instanceof failure, brief modal wrong params, approval import name mismatch. |
| 5 | Utilities, parsers, UI builders, helpers, require→import, modal metadata, cascade audit, variableExtractor, timing logs, close-out cleanup | 6-9 days | ~3 days CC time | 2026-05-18 | 8 streams + close-out. 2 utility + 41 UI builder + 16 helper files migrated to .ts. ~480 require()→import conversions. 28 modal metadata interfaces. Cascade access audit in docs/cascade-access-patterns.md. Typed cascade emission via CascadeVariableMap[K]. 32 timing points in 7 handlers. 51 parser fuzz tests. 4 require() remain (circular deps + bcrypt). 47 @ts-expect-error for deep structural mismatches. **Close-out (2026-05-18):** Eliminated all 133 `catch (error: any)` with proper narrowing. Removed 58 `as any` casts (Sequelize CreationAttributes, StudyVariable row typing, modal builder returns, generateStudyResultBlocks param widening). Total `any` count: 672→413. 258 `as any` remain, all Bolt handler typing — moved to Phase 6. |
| 6 | End-to-end tests, pattern-enforcement assertions, Bolt handler middleware typing, architecture audit | 8-12 days | — | — | Not started. Bolt typing stream (~75 handlers + events.ts, eliminates 258 `as any`) added from Phase 5 audit. |
| 7 | Sign-off, documentation, resume template work | 1 day | — | — | Not started |

**Trajectory:** Phases 1-3 estimated at 10-15 days total, completed in ~2 days. The pattern-discovery phase (Stage 1 of Phase 3) was the bottleneck — once approved, bulk migration was fast. Phase 4 (handlers) should follow a similar pattern: slower on the first file, then mechanical.

## Pending followups from Phase 3

- **User model auth boilerplate cleanup** — ~~`password` column exists in DB but not in `Model.init()`.~~ Phase 5 close-out added `declare password: string` to the User model class. The broader cleanup (removing unused generateToken, sendMail, hooks) remains v1.1 work.
- **`getResearchStudyWithRoles` placeholder fields** — ~~Lines 95-97 assign `total_sessions = 0` as ad-hoc properties.~~ Phase 5 close-out typed these with a `StudyComputedCounts` intersection interface. Still dead code (never computed from real data); safe to remove in v1.1.
- **`StudyVariable.value` narrowing pattern** — Phase 5 close-out used `StudyVariableAttributes` cast pattern in ticketHandler and readoutHandler. Pattern is light enough that a generic helper isn't warranted yet.

## Bugs found and fixed during migration

- **Plan handler cascade contracts (Phase 4, Stage 1):** `planHandler.js` passed `required: false` for all cascade variables including `research_objectives`, `research_questions`, and `target_barriers`. This violated ADR 0007 (cascade contracts fail loudly). Fixed: these are now `required: true` and throw `TemplateContractError` when missing.
- **Synthesis handler nugget validation (Phase 4, Stage 2):** `researchSynthesisHandler.js` used `throw new Error(...)` for missing nuggets instead of `TemplateContractError`. Fixed: nugget-required methods now throw `TemplateContractError` with proper `userMessage`. Emerging pattern: ad-hoc `throw new Error` for cascade contract violations should be `TemplateContractError` throughout. Normalizing during Stage 3 extraction.
- **`trigger_id` passed to `views.update` (Phase 4, Stage 3):** Multiple handlers passed `trigger_id` to `client.views.update()`, which only accepts `view_id` + `view`. Slack API ignores the extra field silently, but TypeScript correctly flagged it. Fixed during extraction — `trigger_id` removed from all `views.update` calls.
- **`allowDeclareFields` missing from `.babelrc` (Phase 4, Stage 3):** Babel's `@babel/preset-typescript` needs `allowDeclareFields: true` to compile the `declare` keyword on Sequelize model class fields. Without it, `npm run build` crashes. Railway was down from Phase 3 merge until this was fixed.
- **`dist/bin/www.js` broken relative paths (Phase 4, Stage 3):** `www.js` does `require('./app')` which resolves to `dist/bin/app.js` (doesn't exist — `app.js` is at `dist/app.js`). This is express-starter boilerplate that never worked from the compiled dist. Railway start command changed to `npm run build && node ./dist/app.js`.

## Phase 5 completed (2026-05-15)

- **Modal metadata contracts:** 28 typed interfaces across all modal+handler pairs. `satisfies` on setter, `as XxxMetadata` on reader.
- **Cascade access patterns:** Audited and documented in `docs/cascade-access-patterns.md`. No consolidation needed — 7 functions serve distinct purposes.
- **Cascade emission typing:** `variableExtractor.ts` has `typedExtraction<K extends CascadeVariableKey>()` generic bridging runtime extraction to `CascadeVariableMap[K]`.
- **require()→import:** 480+ conversions. 4 intentional require() remain (circular deps + bcrypt).
- **Big three helpers migrated:** github.ts (650 lines), studyVariables.ts (940 lines), participantYamlProcessor.ts (593 lines) — all with typed return values.
- **12 additional helpers migrated:** yamlProcessor.ts, langchain.ts, documentParser.ts, pdfProcessor.ts, discoveryLoader.ts, observerYamlProcessor.ts, markChangesCompleteHandler.ts, requestChangesHandler.ts, utils.ts, slackApiClient.ts, mail.ts, generateFileCheckboxOptions.ts.
- **Timing instrumentation:** 32 `⏱️`-prefixed timing points across 7 document-creation handlers.

## Phase 6 scope (planned)

- **Bolt handler middleware typing (~75 handlers + events.ts registrations):** Type every handler function's parameters with Bolt middleware args types (`SlackCommandMiddlewareArgs`, `SlackActionMiddlewareArgs<BlockAction>`, `SlackViewMiddlewareArgs<ViewSubmitAction>`, etc.). Eliminates 258 `as any` casts — 111 handler registration casts in events.ts plus ~147 downstream `(body as any).prop`, `(view.state as any).values`, `(ack as any)({...})` casts in handler bodies. Single root cause, one structural task.
- **End-to-end tests + audit** per Phase 6 instruction scope.

## Pending v1.1

- **9 remaining `.js` helper files:** index.js, prompts.js, queue/\*.js, rag.js, ragV2.js, slack/auth.js, token.js, yamlPrompt.js — all unused by `.ts` handlers (dead code, disabled features, or infrastructure barrels).
- **47 `@ts-expect-error` suppressions:** Deep structural mismatches (null vs undefined in Sequelize model fields, Bolt body type gaps) that need proper interface alignment to resolve.
- **YAML→TypeScript schema generation:** Generate `types/cascade.ts` from YAML schemas mechanically to close the drift gap.

## Key decisions made during migration

- **ADR 0014:** Sequelize v6 built-in generics (InferAttributes pattern)
- **Option A (Phase 3):** Model classes at module scope with `export type` — enables typed return values in services
- **DECIMAL handling:** Model getters coerce `string → number` at read boundary (Approach A)
- **`associate()` parameter:** `Record<string, any>` — Sequelize limitation, accepted on all 13 models
- **`catch (error: any)` eliminated (Phase 5 close-out):** 133 instances across 32 files converted to `catch (error)` with `instanceof Error` narrowing. Zero remain.
- **`as any` quick fixes (Phase 5 close-out):** 58 casts removed — Sequelize `CreationAttributes`, variable store row typing, modal builder returns, `generateStudyResultBlocks` param widening. 258 remain, all Bolt handler typing (Phase 6 scope).

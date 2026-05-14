# TypeScript Migration Plan — Progress Tracker

See ADR 0013 for the decision and rationale. This file tracks actual progress against estimates.

## Phase completion log

| Phase | Scope | Estimated | Actual | Date | Notes |
|-------|-------|-----------|--------|------|-------|
| 1 | TypeScript foundation, tsconfig, Jest TS, CI/CD | 3-5 days | ~0.5 day | 2026-05-13 | Faster than expected. Railway deployment fix added ~1hr of debugging (pre-deploy runs in ephemeral container). |
| 2 | Type definitions: cascade variables, models, handlers | 3-4 days | ~0.5 day | 2026-05-13 | YAML schema audit was the bulk of the work. Sequelize pattern decision (ADR 0014) was straightforward once models were audited. |
| 3 | Service + model layer migration | 4-6 days | ~1 day | 2026-05-13 | Stage 1 review gate caught the model-return-type issue (Option A — class at module scope). Once that pattern was established, bulk migration was mechanical. 13 models, 12 services. |
| 4 | Handler layer migration | 4-6 days | — | — | Not started |
| 5 | Utilities, parsers, events.js | 3-5 days | — | — | Not started |
| 6 | End-to-end tests | 3-5 days | — | — | Not started |
| 7 | Sign-off, documentation, resume template work | 1 day | — | — | Not started |

**Trajectory:** Phases 1-3 estimated at 10-15 days total, completed in ~2 days. The pattern-discovery phase (Stage 1 of Phase 3) was the bottleneck — once approved, bulk migration was fast. Phase 4 (handlers) should follow a similar pattern: slower on the first file, then mechanical.

## Pending followups from Phase 3

- **User model auth boilerplate cleanup** — `password` column exists in DB but not in `Model.init()`. Either add it to init and type properly, or remove the unused auth boilerplate (generateToken, validatePassword, sendMail, hooks). V1.1 work.
- **`getResearchStudyWithRoles` placeholder fields** — Lines 95-97 assign `total_sessions = 0`, `total_transcripts = 0`, `total_summaries = 0` as ad-hoc properties. These are dead code (never computed from real data). Safe to remove.
- **`StudyVariable.value` narrowing pattern** — If Phase 4 handlers frequently narrow `value` to specific cascade types, consider a `readCascadeVariable<K>()` typed helper. Watch for the pattern repeating before abstracting.

## Bugs found and fixed during migration

- **Plan handler cascade contracts (Phase 4, Stage 1):** `planHandler.js` passed `required: false` for all cascade variables including `research_objectives`, `research_questions`, and `target_barriers`. This violated ADR 0007 (cascade contracts fail loudly). Fixed: these are now `required: true` and throw `TemplateContractError` when missing.
- **Synthesis handler nugget validation (Phase 4, Stage 2):** `researchSynthesisHandler.js` used `throw new Error(...)` for missing nuggets instead of `TemplateContractError`. Fixed: nugget-required methods now throw `TemplateContractError` with proper `userMessage`. Emerging pattern: ad-hoc `throw new Error` for cascade contract violations should be `TemplateContractError` throughout. Normalizing during Stage 3 extraction.
- **`trigger_id` passed to `views.update` (Phase 4, Stage 3):** Multiple handlers passed `trigger_id` to `client.views.update()`, which only accepts `view_id` + `view`. Slack API ignores the extra field silently, but TypeScript correctly flagged it. Fixed during extraction — `trigger_id` removed from all `views.update` calls.
- **`allowDeclareFields` missing from `.babelrc` (Phase 4, Stage 3):** Babel's `@babel/preset-typescript` needs `allowDeclareFields: true` to compile the `declare` keyword on Sequelize model class fields. Without it, `npm run build` crashes. Railway was down from Phase 3 merge until this was fixed.
- **`dist/bin/www.js` broken relative paths (Phase 4, Stage 3):** `www.js` does `require('./app')` which resolves to `dist/bin/app.js` (doesn't exist — `app.js` is at `dist/app.js`). This is express-starter boilerplate that never worked from the compiled dist. Railway start command changed to `npm run build && node ./dist/app.js`.

## Pending Phase 5 observations

- **Three cascade access patterns coexist:** `readUpstreamVariables` (consumes-spec style), `readStudyVariables` (full study dump), and direct `StudyVariable.findOne`. Worth auditing during Phase 5 utilities migration — consolidate if they overlap, document the differences if they serve distinct purposes.
- **Cascade emission: two-layer safety with a drift gap.** Runtime validation against YAML schemas checks emission at the extraction boundary. TypeScript types on consumers check reads at the handler boundary. The two layers aren't programmatically linked — drift between YAML schemas and `types/cascade.ts` is invisible. Phase 5: when `variableExtractor.js` migrates, consider typing its return shape using `CascadeVariableMap` (the `variable_key` is runtime-dynamic, so this requires generic gymnastics or a cast at the emission boundary — acceptable to do minimal typing if it adds friction). Future (v1.1 / pre-government-handoff): generate `types/cascade.ts` from YAML schemas via YAML → JSON Schema → TypeScript generator. Closes the drift gap mechanically but adds build complexity.
- **Cascade helper deferred (Phase 4, Stage 2):** Only 7 cascade-specific narrowing points across 8 handlers (0-3 per handler). `as ResearchQuestion[]` assertions are readable at this volume. Revisit if Phase 5 surfaces more.

## Key decisions made during migration

- **ADR 0014:** Sequelize v6 built-in generics (InferAttributes pattern)
- **Option A (Phase 3):** Model classes at module scope with `export type` — enables typed return values in services
- **DECIMAL handling:** Model getters coerce `string → number` at read boundary (Approach A)
- **`associate()` parameter:** `Record<string, any>` — Sequelize limitation, accepted on all 13 models
- **`catch (error: any)`:** Accepted pattern for accessing `.message` in catch blocks (~27 instances across services)

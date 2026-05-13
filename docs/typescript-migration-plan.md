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

## Key decisions made during migration

- **ADR 0014:** Sequelize v6 built-in generics (InferAttributes pattern)
- **Option A (Phase 3):** Model classes at module scope with `export type` — enables typed return values in services
- **DECIMAL handling:** Model getters coerce `string → number` at read boundary (Approach A)
- **`associate()` parameter:** `Record<string, any>` — Sequelize limitation, accepted on all 13 models
- **`catch (error: any)`:** Accepted pattern for accessing `.message` in catch blocks (~27 instances across services)

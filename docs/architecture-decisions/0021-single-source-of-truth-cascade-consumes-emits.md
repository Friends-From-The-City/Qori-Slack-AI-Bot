# ADR 0021: Single source of truth for cascade consumes/emits declarations

**Status:** Accepted
**Date:** 2026-06-03
**Decision drivers:** Two drift incidents (enrichment per-type mismatch, service_blueprint key name mismatch); manual sync comments in code; 80+ lines of hand-maintained duplicate data in `TEMPLATE_CONSUMES`.

## Context

Cascade consumes/emits declarations were maintained in two places:

1. **YAML templates** (`config/prompts/*.yaml`) — `consumes:` and `emits:` blocks declared what each template needed and produced.

2. **TypeScript code** (`cascadeReadinessBlocks.ts`) — `TEMPLATE_CONSUMES` was a hand-written object with the same information, used by modal openers to show cascade readiness warnings.

These two sources had to stay in sync manually. A comment on line 44-45 of `cascadeReadinessBlocks.ts` said:
```typescript
// Consumes specs per template (from cascade contracts in YAML)
// Must stay in sync with YAML templates' consumes: blocks
```

This manual sync failed twice:
- **service_blueprint** used `atomic_nuggets` (the old unsplit name) in YAML, but `TEMPLATE_CONSUMES` had `atomic_nugget_core`/`atomic_nugget_detail`. The cascade readiness check looked for variables that didn't exist under the YAML's declared names.
- **design_opportunities** had `target_barriers` and `research_questions` in YAML but not in `TEMPLATE_CONSUMES`. Modal wouldn't warn if these were missing.

Additionally, `types/cascade.ts` (648 lines) contained hand-written TypeScript interfaces that were supposed to match the YAML schemas in `backend/config/schemas/`. Another manual sync surface.

## Decision

YAML is the single source of truth. TypeScript structures are generated from YAML at build time. CI enforces freshness.

Specifically:
1. **`npm run build:cascade`** reads all `config/prompts/*.yaml` files and generates:
   - `cascadeRegistry.generated.ts` — exports `TEMPLATE_CONSUMES` and `TEMPLATE_EMITS`
   - `cascade.generated.ts` — exports interfaces from `backend/config/schemas/*.yaml`

2. **`cascadeReadinessBlocks.ts`** imports from the generated file instead of defining `TEMPLATE_CONSUMES` inline.

3. **CI freshness check** runs `npm run build:cascade` and fails if the generated files differ from what's committed. This catches cases where someone edits a YAML `consumes:` block but forgets to regenerate.

## Alternatives considered

**Keep manual sync, add tests.** Tests can catch drift after the fact, but don't prevent it. Still requires manual updates in two places. The maintenance burden continues.

**Move truth to TypeScript, generate YAML.** Inverts the natural authoring flow. Researchers and template authors edit YAML templates, not TypeScript. TypeScript-as-source would make template authoring harder.

**Runtime YAML parsing.** Parse YAML at server startup to build `TEMPLATE_CONSUMES`. Adds startup latency (~100-200ms to parse 27 files), requires YAML files bundled with the runtime deployment, and delays error detection to startup rather than build time.

**Eliminate `TEMPLATE_CONSUMES` entirely, read YAML on demand.** Each modal opener would parse the relevant YAML to check cascade readiness. This is wasteful (parsing the same files repeatedly) and spreads YAML-parsing logic across multiple handlers. A generated registry is more efficient.

## Implementation

**Generator script:** `backend/scripts/build-cascade-registry.ts`
- Reads all YAML templates, extracts `consumes:` and `emits:` blocks
- Applies ID aliases (e.g., `persona_generator` → `persona_generation`) where YAML IDs differ from code method keys
- Writes `cascadeRegistry.generated.ts`

**ID Aliases:** Some YAML template IDs don't match the method selection values used in code. The generator has an `ID_ALIASES` map to handle these:
```typescript
const ID_ALIASES: Record<string, string> = {
  persona_generator: 'persona_generation',
};
```

**Type generation:** Interfaces from `backend/config/schemas/*.yaml` are generated to `cascade.generated.ts` (41 interfaces, ~1000 lines). The variable key → interface mapping (`CascadeVariableMap`) remains manual in `types/cascade.ts` because:
- Variable keys don't always match schema names 1:1 (e.g., `atomic_nugget_core` key uses `AtomicNuggetCore` interface)
- Some keys map to primitive types (`methodology_selection: string`) with no schema
- The map rarely changes and is easy to update when adding a new variable

**Scope limitation — code-level consumption:** The registry tracks YAML `consumes:` blocks only. Some variables are consumed by **handler code directly** (e.g., `survey_findings` in `briefHandler.ts:137`, `discovered_journeys` in `research_brief.yaml` via `briefHandler.ts`). These code-level consumers are NOT tracked in `TEMPLATE_CONSUMES`.

This is intentional for the brief handler's discovery selection pattern, where researchers choose which discovery artifacts to include. That consumption path is handler-controlled, not YAML-declared.

**Implication:** To answer "what consumes this variable?", check both:
1. `TEMPLATE_CONSUMES` (or grep YAML `consumes:` blocks for `key: {variable}`)
2. Handler code (grep for `upstream_{variable}` or the variable key in handler files)

## Consequences

**Intended:**
- Drift impossible by construction — there's no second place to update
- Single source of truth for cascade contracts — YAML templates are authoritative
- CI catches staleness before merge
- Future template changes automatically update TypeScript

**Accepted downsides:**
- Build step required — must run `npm run build:cascade` after editing YAML
- Generated files committed to repo (clearly marked with "do not edit" comments)
- ID alias mechanism adds slight indirection for templates with mismatched names

## When to revisit

- If the number of ID aliases grows beyond 3-4, consider standardizing YAML IDs to match code method keys directly
- If runtime configuration of cascade contracts becomes necessary (e.g., feature flags per template), the build-time approach may need adjustment

## Verification

The guard works by construction:
1. Edit a YAML `consumes:` block without running `npm run build:cascade`
2. CI runs `npm run build:cascade` and `git diff --exit-code`
3. Diff shows the stale generated file → CI fails → PR cannot merge

## References

- Generator script: `backend/scripts/build-cascade-registry.ts`
- Generated registry: `backend/src/helpers/slack/ui/cascadeRegistry.generated.ts`
- Consumer: `backend/src/helpers/slack/ui/cascadeReadinessBlocks.ts`
- Audit that surfaced the drift: This conversation (2026-06-03)
- Related: ADR 0007 (cascade contracts fail loudly), ADR 0018 (cascade-aware synthesis modal)

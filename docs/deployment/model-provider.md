# Model Provider Boundary

Qori accesses AI models through a governed boundary defined in `backend/src/helpers/modelProvider.ts` (ADR 0034). Application code never instantiates provider SDKs directly.

## Architecture

```
Workflow / Handler
       │
       ▼ requests tier: haiku | sonnet | opus
┌──────────────────────────────┐
│     modelProvider.ts         │
│  createModel({ tier, ... })  │
│                              │
│  Maps tier → model name      │
│  Reads env var overrides     │
│  Instantiates provider SDK   │
└──────────────┬───────────────┘
               │
               ▼
       Provider SDK (LangChain)
               │
               ▼
        Anthropic API
```

Workflows specify logical tiers (`haiku`, `sonnet`, `opus`), not provider-specific model identifiers. The mapping from tier to concrete model lives in `modelProvider.ts` and can be overridden via environment variables.

## Configuration

| Variable | Tier | Default | Purpose |
|----------|------|---------|---------|
| `ANTHROPIC_API_KEY` | All | (required) | API authentication |
| `ANTHROPIC_MODEL_NAME` | Sonnet | `claude-sonnet-4-6` | Default generation model |
| `EXTRACTION_MODEL_NAME` | Haiku | `claude-haiku-4-5-20251001` | Lightweight extraction tasks |
| `ANTHROPIC_MODEL_OPUS` | Opus | `claude-opus-4-6` | Complex reasoning tasks |
| `ANTHROPIC_TEMPERATURE` | All | `0.4` | Default sampling temperature |
| `ANTHROPIC_MAX_TOKENS` | All | `8192` | Maximum output tokens |

## Privacy Gate

The privacy pipeline runs **before** model invocation:

1. PII scrubbing at ingestion (ADR 0026)
2. Known-name assertion before transmission (H9 gate in `langchain.ts`)
3. Model receives only redacted content

This ordering is architectural — the privacy gate is not provider-dependent.

## Deterministic Compute Boundary

Deterministic research transformations (frequency counts, participant coding, barrier coverage) occur **outside** generative models (ADR 0028). Models interpret computed facts; they don't compute them.

## Provider Substitution

The current implementation is Anthropic-only via `@langchain/anthropic`. The LangChain abstraction layer means provider substitution requires:

1. Install the new provider's LangChain integration package
2. Update `modelProvider.ts` to instantiate the new provider's chat model class
3. Update tier-to-model-name mapping
4. Provide the new provider's API credentials

No other application code requires changes — all model access goes through `createModel()`.

**Constraint:** Provider substitution must preserve the privacy gate ordering. The new provider's SDK must accept the same prompt interface (string or message array) that LangChain provides.

## Pattern Enforcement

A CI test verifies that no code outside `modelProvider.ts` imports `ChatAnthropic` or any provider SDK directly. This prevents provider coupling from spreading into application code.

## Future: Agency-Approved Provider

For government deployments where an agency has an approved AI provider:

1. The deploying organization installs the appropriate LangChain provider package
2. `modelProvider.ts` is updated (or made configurable) to use the agency-approved provider
3. Environment variables are set for the new provider's credentials
4. All existing workflows work without modification (they specify tiers, not providers)

This is a PLAT-2/PLAT-3 concern — PLAT-1 documents the boundary; future slices may add runtime provider selection.

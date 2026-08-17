# ADR 0034: Model Provider Boundary

**Status:** Accepted
**Date:** 2026-08-17
**Decision drivers:** Platform Hardening Phase 2 (PH-2) — establish a single model-provider boundary so workflows select capability tier, not provider implementation.

## Context

Qori uses LLM models for template-driven generation, variable extraction, codebook generation, assignment matching, and query interpretation. Before this decision, five separate files directly imported and instantiated `ChatAnthropic` from `@langchain/anthropic`, each constructing the provider client independently with duplicated environment variable reads and default fallbacks.

This created coupling between workflow logic and provider implementation. Changing the model provider, updating model names, or adjusting default configuration required edits across five files.

## Decision

All model instantiation goes through a single factory in `backend/src/helpers/modelProvider.ts`. Workflows request models by logical tier:

- **haiku** — fast, low-cost tasks (query interpretation, filename generation, simple extraction)
- **sonnet** — primary generation and extraction (template tasks, codebook, assignments, complex extraction)
- **opus** — reserved for complex reasoning (not currently used in production)

The factory owns:
- Provider-specific class construction (`ChatAnthropic`)
- Tier → provider model name mapping (with env var overrides)
- API key validation
- Default temperature and token configuration per tier

Callers pass `{ tier, temperature?, maxTokens?, purpose? }` and receive a configured model instance. They do not import provider SDKs.

### Current tier mapping

| Tier | Default Model | Env Override |
|------|--------------|-------------|
| haiku | `claude-haiku-4-5-20251001` | `EXTRACTION_MODEL_NAME` |
| sonnet | `claude-sonnet-4-6` | `ANTHROPIC_MODEL_NAME` |
| opus | `claude-opus-4-6` | `ANTHROPIC_MODEL_OPUS` |

### Enforcement

A pattern enforcement test fails if any file outside `modelProvider.ts` imports `ChatAnthropic` or `@langchain/anthropic`.

## Consequences

- Provider changes require editing one file instead of five.
- Workflows express intent (tier) not implementation (model name).
- The `purpose` field enables future per-call logging/telemetry without changing callers.
- No multi-provider orchestration introduced — this is a boundary, not a framework.
- Existing behavior is preserved exactly: same models, temperatures, token limits.

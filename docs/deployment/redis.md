# Redis Contract

Redis is **non-authoritative** in Qori. No canonical state is stored in Redis.

## Current Status

Redis is effectively unused:

- `src/libs/redis.js` — Redis client code is **fully commented out**
- `src/helpers/queue/embededFile.queue.js` — Bull queue instantiated but RAG is disabled; worker is a no-op
- `src/helpers/queue/indexRepo.queue.js` — Same: Bull queue for disabled RAG pipeline
- `src/middleware/cache.js` — Cache middleware exists but no routes use it

## What Redis Stores

Currently: **nothing of consequence**. The RAG embedding queue is disabled, and the Redis client module is commented out.

If RAG is re-enabled, Redis would store:
- Bull job queue state for document embedding jobs
- Optional HTTP response cache (via cache middleware)

## Failure Implications

Qori starts and operates correctly without Redis. The Bull queue constructors attempt to connect to Redis at the configured host/port, but:
- Connection failure is non-fatal (Bull retries silently)
- The queue workers are no-ops (RAG disabled)
- No application functionality depends on Redis

## TTL Behavior

No TTLs are currently configured (no active Redis usage).

## Recovery Behavior

Redis data can be lost without impact. On restart, Bull queues are empty, which is the expected state since the RAG pipeline is disabled.

## Required Configuration

None. Redis configuration is optional:

| Variable | Default | Notes |
|----------|---------|-------|
| `REDIS_HOST` | `localhost` | Only relevant if RAG re-enabled |
| `REDIS_PORT` | `6379` | Only relevant if RAG re-enabled |
| `REDIS_URI` | None | Alternative to host/port |

## Feature Degradation

If Redis is unavailable:
- All `/qori-*` commands work normally
- All study/project/participant operations work normally
- All AI generation tasks work normally
- RAG-related commands return "not available yet" (same as current behavior)

## Architectural Constraint

Redis must remain non-authoritative. If future features require Redis:
- Use it for caching, queuing, or ephemeral state only
- Canonical state must remain in PostgreSQL
- Application must degrade gracefully if Redis is unavailable
- Recovery must not require Redis data preservation

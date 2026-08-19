# ADR 0041: Deployable Government Environment Boundary

**Status:** Accepted
**Date:** 2026-08-19
**Decision drivers:** Government partner interest; need to demonstrate Qori can operate in agency-controlled infrastructure without architectural dependency on Friends Innovation Lab's current hosting

## Context

Qori is currently deployed on Railway (production and development environments). While the application is largely configurable via environment variables, several assumptions tie it to our specific deployment:

1. **Railway-specific references** — The Sentry release tag reads `RAILWAY_GIT_COMMIT_SHA`, a Railway-injected variable. Documentation references Railway for deployment instructions.
2. **Organization-specific defaults** — `QORI_TEAM_SLUG` defaults to `friends-lab`. Documentation references Friends Innovation Lab-specific Slack apps and workspace IDs.
3. **Implicit infrastructure assumptions** — No formal contracts for what a deployment environment must provide (database, Redis, backup, observability).
4. **No deployment validation** — No tool to verify that a new environment has all required configuration before startup.

However, the application code itself is already substantially portable:
- All credentials are environment variables
- GitHub integration is fully configurable (owner, repo, token)
- Model provider is behind an abstraction boundary (ADR 0034)
- Database configuration uses standard Sequelize parameters
- Health check exists but is minimal

## Decision

Qori is a deployable application/platform whose canonical research state remains under the operating organization's control. All interfaces and infrastructure providers are adapters or configuration choices.

Specifically:

- **Qori is not architecturally dependent on Railway.** Railway is a current deployment choice. The container, startup, migration, and health check infrastructure works with any container runtime or bare Node.js.
- **Qori is not architecturally dependent on Supabase.** Supabase is used only for the currently-disabled RAG pipeline's vector store. The core application has no Supabase dependency.
- **Qori is not architecturally dependent on Slack.** Slack is a user interface adapter. Canonical state lives in PostgreSQL. The architecture supports future alternative adapters (web UI, API).
- **GitHub is not canonical authority.** GitHub is a projection/handoff store for documents. PostgreSQL is the single source of truth for research state.
- **The external AI provider is behind a governed model boundary (ADR 0034).** Workflows specify logical tiers (haiku/sonnet/opus). Provider substitution requires changes only in `modelProvider.ts`.
- **The agency controls its deployment environment and canonical database.** No Friends Innovation Lab infrastructure is required.

## Alternatives considered

### Remain Railway-specific, provide deployment documentation only

Would require less work but would not produce the formal contracts, validation tooling, or portability tests that a government partner needs to evaluate Qori for their environment. Documentation without enforcement drifts.

### Full multi-provider abstraction (provider-agnostic hosting layer)

Premature. The current codebase is already 90%+ portable. Adding a hosting abstraction layer would be over-engineering for a single Railway→government deployment. The contracts and tests we write now are sufficient to support the first deployment; abstraction can follow if needed.

## Consequences

### Intended

- Any organization with PostgreSQL, a Slack workspace, a GitHub organization, and an Anthropic API key can deploy Qori
- Formal contracts document every requirement, making evaluation straightforward
- Deployment validator catches misconfiguration before startup
- Portability tests prevent regression
- Health and readiness endpoints work with any orchestrator (Kubernetes, ECS, etc.)

### Accepted tradeoffs

- `QORI_TEAM_SLUG` still defaults to `friends-lab` for backward compatibility — new deployments must override it
- The authentication boundary is documented but not yet implemented — Slack identity remains the current auth source
- Provider substitution for AI models is possible but not yet runtime-configurable — it requires a code change in `modelProvider.ts`
- Redis configuration still exists in docker-compose even though Redis is unused — it's harmless but could confuse new deployers

### Future work (PLAT-2, PLAT-3)

- **PLAT-2:** Organization/team/repo isolation, canonical actor model, multi-tenant workspace
- **PLAT-3:** Channel-independent application API, web adapter, API authentication

## References

- [Deployment guide](../deployment/README.md)
- [Configuration contract](../deployment/configuration.md)
- [Secrets contract](../deployment/secrets.md)
- [ADR 0034 — Model provider boundary](./0034-model-provider-boundary.md)
- [ADR 0024 — Project-level authorization model](./0024-project-level-authorization-model.md)
- [ADR 0039 — Disaster recovery posture](./0039-disaster-recovery-posture.md)

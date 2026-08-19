# ADR 0044: Channel-Independent Application Boundary

**Status:** Accepted
**Date:** 2026-08-19
**Decision drivers:** PLAT-3; future Workspace web UI; adapter taxonomy from platform audit

## Context

All Qori orchestration currently lives in Slack handlers (~30 files in `backend/src/helpers/slack/commands/`). These handlers interleave Slack-specific concerns (ack, modal parsing, Block Kit formatting) with application logic (workflow transitions, LLM orchestration, variable extraction, artifact operations). The future Workspace web UI needs the same capabilities, and reimplementing them in a second adapter would create divergent behavior and doubled maintenance.

PLAT-3 introduces an application service layer between adapters (Slack, HTTP API, future Workspace) and domain services. The goal is that any adapter can invoke the same governed capabilities through a single application boundary, with Slack handlers becoming thin translation layers.

The platform completeness audit identified two adapter categories that must be distinguished: interaction adapters (Slack, Workspace, Teams) that represent user-facing channels, and implementation/handoff adapters (GitHub, Jira) that represent external systems Qori projects into. These have fundamentally different contracts and failure modes.

## Decision

Introduce an application service layer that owns all orchestration logic. Adapters translate between their protocol and the application boundary. The application boundary enforces identity, authorization, and scoping — adapters cannot create authority.

### ApplicationContext

```typescript
interface ApplicationContext {
  actor: Actor;
  organization: Organization;
  authenticationProvider: string;  // 'slack' | 'oidc' | 'local_test'
  correlationId: string;
}
```

ApplicationContext contains identity and authority only. No project or study scope — those are request inputs resolved per-request through canonical DB lookups and access checks.

### ScopedApplicationContext

```typescript
interface ScopedApplicationContext extends ApplicationContext {
  project: Project;
  study?: Study;
}
```

ScopedApplicationContext extends ApplicationContext with project/study AFTER canonical DB resolution and access checks. A client cannot create a ScopedApplicationContext directly — it is produced by the application layer after verifying the actor has access to the requested project.

### Extraction scope

All 7 BEFORE_WORKSPACE orchestration areas are extracted into application services:

1. **Brief** — research brief creation and cascade variable emission
2. **Plan** — research plan creation with brief consumption
3. **Transcript review** — session summary processing and evidence extraction
4. **Synthesis** — analysis template execution with cascade consumption
5. **Discovery** — desk research, stakeholder, and survey workflows
6. **Readout** — research readout generation with full cascade consumption
7. **Approval state** — artifact status transitions

### Adapter responsibilities

Slack handlers become thin adapters following the pattern: ack → parse modal → call application service → format Block Kit response. Application services own workflow transitions, canonical reads/writes, LLM orchestration, calculations, and artifact operations.

### Adapter taxonomy

- **Interaction adapters** (Slack, Workspace, Teams) — user-facing channels that translate user intent into application service calls and format responses for display. Different protocols, same application operations.
- **Implementation/handoff adapters** (GitHub, Jira) — external systems that Qori projects artifacts and state into. Different domain — different contracts. GitHub failure never changes research status.

### Artifact state domains

Artifacts have two distinct state domains that must not be conflated:

- **Canonical workflow status:** `generating`, `draft`, `needs_review`, `approved`, `superseded`, `archived` — research lifecycle managed by application services
- **Projection/publication status:** `not_published`, `publishing`, `published`, `projection_failed` — external system state managed by implementation adapters

A GitHub projection failure sets projection status to `projection_failed` but never alters the canonical workflow status. A document can be `approved` in Qori even if GitHub projection failed.

### HTTP API contract

- Stable public IDs (UUIDs) in all responses — never internal integer IDs
- Response shape: `{ data, meta? }` — consistent envelope
- Deterministic error codes: `AUTHENTICATION_REQUIRED`, `AUTHORIZATION_DENIED`, `ORG_SCOPE_MISMATCH`, `PROJECT_NOT_FOUND`, `ACTOR_NOT_IN_PROJECT`, `INVALID_INPUT`, `INTERNAL_ERROR`
- No raw database errors, no PII leakage in error responses

## Alternatives considered

### Extract only the 4 most complex handlers

Extract brief, synthesis, readout, and transcript review — the handlers with the most orchestration logic — and leave plan, discovery, and approval as Slack-only. Rejected — contradicts PLAT-3's objective of channel independence. The Workspace would need separate implementations for the remaining handlers, creating exactly the divergence this ADR aims to prevent.

### Include scope in base ApplicationContext

Put project and study in ApplicationContext so callers can pass them directly. Rejected — a client could create authority via query parameters or modal values. Scope must be resolved and access-checked by the application layer, which is why ScopedApplicationContext is a separate type produced only by the application boundary.

### Single artifact status column

Use one status enum covering both research lifecycle and GitHub projection state. Rejected — conflates two independent state machines. A GitHub outage would either block research workflow transitions (if projection is required for status change) or lose projection failure information (if research status overwrites projection status). Two columns with independent transitions are cleaner.

## Consequences

### Intended

- Any future adapter (Workspace web UI, Teams, CLI) can invoke the same governed capabilities without reimplementation
- Slack UX is unchanged — handlers are thinner but behavior is identical from the researcher's perspective
- Application services are testable without Slack infrastructure — unit tests call services directly with a test ApplicationContext
- Artifact canonical state is protected from GitHub failures — research continues even when external systems are degraded
- Error responses are predictable and safe — no accidental PII or internal state leakage

### Accepted tradeoffs

- Extraction is incremental — handlers are migrated one at a time, so during transition some orchestration lives in application services and some still lives in Slack handlers
- Application services add an indirection layer — Slack handler code that was previously self-contained now calls through to a service, which adds a level of abstraction
- HTTP API design decisions (pagination, filtering, field selection) are deferred to implementation — this ADR establishes the boundary, not the full API surface
- The 7 extraction areas are scoped to BEFORE_WORKSPACE; post-Workspace orchestration areas will follow the same pattern but are not committed here

## References

- [ADR 0042 — Canonical organization and actor boundary](./0042-canonical-organization-and-actor-boundary.md)
- [ADR 0043 — Adapter-neutral authentication and actor resolution](./0043-adapter-neutral-authentication-and-actor-resolution.md)
- [ADR 0041 — Deployable government environment boundary](./0041-deployable-government-environment-boundary.md)
- [ADR 0038 — Canonical artifact identity and navigation](./0038-canonical-artifact-identity-and-navigation.md)
- [ADR 0033 — State classification and GitHub projection removal](./0033-state-classification-and-github-projection-removal.md)
- [Platform completeness audit](../audits/platform-completeness-audit-2026-08-19.md)

# ADR 0043: Adapter-Neutral Authentication and Actor Resolution

**Status:** Accepted
**Date:** 2026-08-19
**Decision drivers:** PLAT-3 channel-independent application API; platform completeness audit items I-1, Z-2

## Context

Qori needs an authentication boundary that supports multiple identity providers (Slack OAuth, OIDC from agency IdPs, future SAML) without coupling to any single provider. Currently authentication is implicit via Slack Socket Mode — the Slack platform authenticates users before events reach Qori. PLAT-3 introduces HTTP API endpoints accessible outside Slack, requiring explicit authentication.

The existing actor model (ADR 0042) established canonical actors with provider-mapped identities, but the authentication mechanism itself — how an incoming request is verified and mapped to an actor — was left to implementation. With HTTP endpoints, Qori must verify tokens, validate issuers, and resolve actors before any application logic runs.

Government deployments add further constraints: agency IdPs use OIDC with JWKS rotation, audience validation is mandatory, and identity uniqueness must account for multiple issuers potentially sharing subject identifiers.

## Decision

Define an AuthAdapter interface that extracts identity evidence from incoming requests. Each transport gets its own adapter; all adapters produce the same IdentityEvidence shape. Authorization is never derived from token claims — all authorization flows through canonical Qori actors and ProjectMembership.

### AuthAdapter interface

Each adapter implements a single responsibility: extract `IdentityEvidence` from a request.

```typescript
interface IdentityEvidence {
  provider: 'slack' | 'oidc' | 'saml' | 'local_test';
  providerSubject: string;   // Slack user ID, OIDC sub, SAML NameID
  providerIssuer: string | null;  // OIDC iss, SAML entityID; null for Slack
}
```

### Adapters

- **SlackAdapter** — extracts Slack user ID from Bolt middleware context. Issuer is null (Slack workspace binding handles org resolution).
- **OidcAdapter** — validates JWT against configured issuer. Production contract requires: configured issuer, issuer validation (iss claim), audience/client validation (aud = OIDC_CLIENT_ID), JWKS signature verification, expiry/nbf validation, stable subject extraction (sub).
- **LocalTestAdapter** — deterministic actor resolution for tests. No tokens, no secrets. Accepts a plaintext actor identifier in a test-only header.

### Identity uniqueness

Identity uniqueness is `(provider, provider_issuer, provider_subject)`. Two different IdPs may issue the same `sub` claim — the issuer distinguishes them.

The existing `actor_identities` table gains a nullable `provider_issuer` column with two partial unique indexes:

- `WHERE provider_issuer IS NOT NULL` — covers OIDC/SAML identities
- `WHERE provider_issuer IS NULL` — covers Slack identities (backward compatible)

A single composite unique index with NULLs was rejected because PostgreSQL NULL semantics allow duplicate rows when any indexed column is NULL.

### Organization resolution

A new `identity_provider_bindings` table maps `(provider, issuer_url)` to exactly one organization. When an OIDC token arrives, the issuer claim resolves the organization deterministically.

Organization is NEVER inferred from email domain, token groups, or browser state. The binding is explicit and admin-configured.

### Authorization boundary

No authorization is derived from token roles, groups, or scopes. Tokens prove identity only. All authorization flows through canonical Qori actor lookup → ProjectMembership checks, as established in ADR 0024.

## Alternatives considered

### Shared-secret JWT

Issue Qori's own JWTs with a shared secret for API authentication. Rejected — insecure for government OIDC environments, doesn't support JWKS key rotation, and creates a secret management burden that OIDC avoids.

### Reusing adapter_workspace_bindings for OIDC issuers

Map OIDC issuers through the existing `adapter_workspace_bindings` table by treating an issuer URL as a "workspace." Rejected — different domain concepts. A Slack workspace is a communication platform binding; an identity provider is an authentication authority. Conflating them would create confusing queries and misleading column names. Separate tables keep the concepts clean.

### Single composite unique index with NULLs

Use one unique index on `(provider, provider_issuer, provider_subject)` instead of two partial indexes. Rejected — PostgreSQL treats NULL != NULL in unique indexes, meaning `(slack, NULL, U123)` could be inserted multiple times. The two partial indexes enforce uniqueness correctly for both NULL and non-NULL issuer cases.

## Consequences

### Intended

- Multiple identity providers can coexist safely within one Qori deployment
- Future SAML support adds another adapter without changing the auth framework
- Government agencies can bring their own IdP; Qori validates tokens without managing credentials
- Tests use LocalTestAdapter with deterministic actor resolution — no tokens, no secrets, no external dependencies

### Accepted tradeoffs

- OIDC runtime integration (JWKS fetching, token validation) is classified MUST_BEFORE_WORKSPACE if scope is too large for PLAT-3 — the interface and Slack/test adapters ship first
- `provider_issuer` is nullable on `actor_identities` — existing Slack rows have NULL, which is correct for Slack but requires the partial index pattern
- LocalTestAdapter must be gated so it cannot activate in production (environment check at adapter registration)

## References

- [ADR 0042 — Canonical organization and actor boundary](./0042-canonical-organization-and-actor-boundary.md)
- [ADR 0041 — Deployable government environment boundary](./0041-deployable-government-environment-boundary.md)
- [ADR 0024 — Project-level authorization model](./0024-project-level-authorization-model.md)
- [Platform completeness audit](../audits/platform-completeness-audit-2026-08-19.md)

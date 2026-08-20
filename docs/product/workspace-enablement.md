# Workspace Enablement Foundation (WS-0)

This document describes the technical prerequisites resolved in WS-0 before the Qori Research Workspace UI can be safely implemented.

## What WS-0 Is

WS-0 is an **enablement layer**. It adds the infrastructure that the Workspace UI will consume — it does not build UI screens.

## What WS-0 Is Not

- Not a UI implementation
- Not a redesign of Qori Core
- Not Qori Ask
- Does not change existing Slack behavior

## Components

### 1. Stable Project Public IDs

Projects now have immutable UUID `public_id` fields. The mutable `slug` remains as a human-readable identifier. API routes accept both `public_id` (canonical) and `slug` (backwards-compatible) for project resolution.

### 2. Web Session Contract

Server-side sessions backed by Redis with:
- HttpOnly, Secure (in production), SameSite=Lax cookies
- 24-hour absolute expiration, rolling idle timeout
- CSRF protection via double-submit cookie pattern
- Logout with session destruction and cookie clearing
- Session middleware disabled when `SESSION_SECRET` is not set (Slack-only mode)

### 3. Production OIDC Runtime

Complete OIDC authentication path:
- Issuer validation via `OIDC_ISSUER` env var
- Audience/client validation via `OIDC_CLIENT_ID`
- JWKS signature verification via `OIDC_JWKS_URI`
- Expiry/nbf validation with 30-second clock skew tolerance
- Issuer + subject → actor resolution via `identity_provider_bindings`
- Auto-provisioning of new actors on first login within a bound IdP

### 4. Organization-Scoped Admin API

`/api/v1/admin/*` endpoints for:
- Organization profile (read/update)
- Teams (list/create/update)
- Actors (list/get with memberships)
- Project memberships (list/add/remove)
- Integration status (credentials, workspace bindings, repo bindings, IdP bindings)

All operations require owner-role authorization and remain within the actor's organization.

### 5. Agency Branding Runtime

Per-organization branding configuration:
- Display name, short name
- Logo asset reference with content type/size validation
- Favicon reference
- Theme tokens (JSONB, no executable content)
- Public URL
- Exposed via `/api/v1/branding`

### 6. Per-Org GitHub Credential Boundary

Provider-neutral credential resolver:
- `integration_credentials` table maps org → credential reference
- Credential references resolve to env vars (`env:VAR_NAME`)
- Future: vault, AWS Secrets Manager, etc.
- Global fallback for single-org backward compatibility
- Cross-org credential use impossible by design

### 7. Workspace Security Foundation

- Enhanced CSP supporting future workspace assets
- HSTS (1 year, includeSubDomains)
- Configurable frame-ancestors
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Configurable CORS origins
- CSRF protection for browser requests
- Auth endpoint rate limiting (10 req/min)
- AI/write endpoint rate limiting hooks (20 req/min)
- Trusted proxy configuration via `TRUSTED_PROXY`

### 8. Agency Hostname Contract

Configurable deployment URLs:
- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`
- `AUTH_CALLBACK_URL`
- `CORS_ALLOWED_ORIGINS`
- `WEBHOOK_BASE_URL`

No vendor-owned hostname requirement. Application works under `https://qori.agency.gov` or any agency-controlled hostname.

### 9. Traceability as UI Capability

Traceability API enhanced with:
- Artifact nodes in forward traversal
- Supporting evidence counts
- Provenance metadata
- Study context on trace nodes

### 10. Accessibility Foundation

Technical baseline for WCAG 2.2 AA / Section 508:
- Semantic component primitive contracts
- Focus management contract
- Keyboard interaction patterns
- ARIA live region announcements
- Reduced-motion support
- Color-independent state indicators
- Accessible form/dialog contracts
- USWDS-compatible design token contract

### 11. Synthetic Demo/Test Environment

Deterministic fixture contract with:
- Synthetic organization, teams, actors
- Active/completed/archived projects
- Evidence chain (source → nugget → theme → finding → recommendation)
- Branding configuration
- DSAR-safe examples
- No real PII

## Environment Variables Added

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | For web sessions | Session cookie signing key |
| `OIDC_ISSUER` | For web auth | OIDC identity provider issuer URL |
| `OIDC_CLIENT_ID` | For web auth | OIDC client/audience identifier |
| `OIDC_JWKS_URI` | For web auth | OIDC JWKS endpoint for signature verification |
| `PUBLIC_APP_URL` | Recommended | Public-facing application URL |
| `PUBLIC_API_URL` | Recommended | Public-facing API URL |
| `AUTH_CALLBACK_URL` | For web auth | OIDC callback URL |
| `FRAME_ANCESTORS` | Optional | CSP frame-ancestors (comma-separated) |
| `TRUSTED_PROXY` | Optional | Express trusted proxy setting |
| `AI_RATE_LIMIT_MAX` | Optional | AI endpoint rate limit per minute (default: 20) |

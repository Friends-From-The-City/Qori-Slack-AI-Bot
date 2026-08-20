# Authentication Boundary

This document defines the current authentication architecture and the future boundary required for government/institutional deployments.

## Current State

Qori currently uses **Slack identity as the authentication source**:

```
Slack user ID → Qori actor (1:1 mapping)
                    │
                    ▼
           Project membership check
           (channel-based, ADR 0024)
                    │
                    ▼
              Authorized action
```

- User identity comes from the Slack `user_id` in each event/command
- Slack's own authentication (OAuth, SSO) is the trust boundary
- No separate Qori login or session management exists
- Slack workspace membership = access to Qori commands

This is sufficient for the current Slack-only deployment but insufficient for multi-adapter or government IdP requirements.

## Authorization Model (current)

Authorization is project-based (ADR 0024):

| Role | Scope | How assigned |
|------|-------|--------------|
| Member | Can act on project studies | Channel membership |
| Creator | Can delete studies | Study creator (Slack user ID) |
| Admin | Records management | Admin center access |

Authorization decisions use Slack user IDs as actor identifiers. Channel membership is the membership check.

## Future Authentication Boundary

Government deployments require institutional identity integration. The architecture must support:

```
┌─────────────────────────────────────────────────────┐
│              Authentication Adapter                  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Slack   │  │  OIDC /  │  │  SAML (via      │  │
│  │ Identity │  │  OAuth   │  │  identity broker)│  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                 │            │
│       └──────────────┼─────────────────┘            │
│                      │                              │
│                      ▼                              │
│           Canonical Qori Actor                      │
│           (stable internal ID)                      │
│                      │                              │
└──────────────────────┼──────────────────────────────┘
                       │
                       ▼
              Authorization Service
              (project/study access)
```

### Requirements (not yet implemented)

1. **Authentication adapter interface** — pluggable identity providers
   - Slack identity (current, preserved)
   - OIDC for web/API access
   - SAML-backed environments through an identity broker (e.g., Keycloak)
   - Agency IdP integration

2. **Canonical Qori actor** — stable internal identity
   - Not tied to any specific provider's user ID
   - Maps from external identity (Slack user ID, OIDC subject, SAML NameID) to internal actor
   - Survives provider changes

3. **Authorization service** — decoupled from authentication
   - Actor → project/study access mapping
   - Not dependent on Slack channel membership
   - Supports role-based and attribute-based access control

4. **Workspace authentication** — future PLAT-2 concern
   - Multi-tenant isolation
   - Organization-level administration
   - Cross-workspace collaboration (if needed)

### What Must NOT Happen

- UI/Slack identity metadata must not become authorization authority
- Slack user IDs must not be the only way to identify an actor in the database
- Channel membership must not be the only way to check project access
- No single authentication provider should be required for Qori to function

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| PLAT-1 | Complete | Boundary documented |
| PLAT-2 | Complete | Canonical actor table, Slack ID → actor mapping |
| PLAT-3 | Complete | OIDC adapter, identity provider bindings |
| WS-0 | Complete | Web sessions, CSRF, logout, session adapter |

## WS-0: Web Session + OIDC Runtime

WS-0 added server-side session management for the Workspace web UI:

### Session Architecture

```
Browser → OIDC IdP → auth code → Backend callback
                                       │
                                       ▼
                              OIDC token validation
                              (issuer, audience, JWKS sig, expiry)
                                       │
                                       ▼
                              Actor resolution
                              (identity_provider_bindings → actor)
                                       │
                                       ▼
                              Session creation
                              (Redis-backed, HttpOnly cookie)
                                       │
                                       ▼
                              Subsequent requests use session cookie
                              (no JWT needed per request)
```

### Auth Adapter Chain

1. **OIDC Bearer** — validates JWT from Authorization header
2. **Session** — checks server-side session cookie
3. **Local Test** — `X-Test-Actor-PublicId` header (test env only)

### CSRF Protection

Double-submit cookie pattern:
- `GET /api/v1/auth/csrf-token` → sets signed cookie + returns token
- State-changing requests must include `X-CSRF-Token` header matching cookie
- Bearer token requests are exempt (CSRF is a browser-origin attack)

### Agency OIDC Configuration

An agency supplies these values via deployment environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `OIDC_ISSUER` | IdP issuer URL | `https://idp.agency.gov` |
| `OIDC_CLIENT_ID` | Client/audience identifier | `qori-workspace` |
| `OIDC_JWKS_URI` | JWKS endpoint | `https://idp.agency.gov/.well-known/jwks.json` |
| `AUTH_CALLBACK_URL` | Callback after auth | `https://qori.agency.gov/api/v1/auth/callback` |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/auth/csrf-token` | Get CSRF token |
| `POST` | `/api/v1/auth/callback` | OIDC callback (establish session) |
| `GET` | `/api/v1/auth/session` | Check session status |
| `POST` | `/api/v1/auth/logout` | Destroy session |

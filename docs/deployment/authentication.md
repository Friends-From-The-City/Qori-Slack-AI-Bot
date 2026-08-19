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

## Migration Path

1. **PLAT-1 (this slice):** Document the boundary. No implementation changes.
2. **PLAT-2:** Introduce canonical actor table. Map Slack user IDs to internal actors. Preserve backward compatibility.
3. **PLAT-3:** Add OIDC adapter for API/web access. Decouple authorization from Slack channel membership.
4. **Future:** SAML integration via identity broker for agencies that require it.

## No ADR Required (Yet)

The authentication boundary is documented here as a deployment contract requirement. An ADR will be written when the canonical actor model is implemented (PLAT-2), as that is the architectural decision point.

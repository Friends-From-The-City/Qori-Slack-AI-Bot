# Qori Application API

## Overview

`/api/v1` is the initial public application boundary for Qori. This API serves the future Workspace web surface and any authorized external consumers. It does not replace the Slack Bolt handler layer -- Slack interactions continue through Socket Mode.

## Authentication

All requests require authentication via one of:

- **OIDC Bearer token** -- `Authorization: Bearer <token>` header. Tokens are validated against the configured OIDC provider.
- **Session cookie** -- `qori.sid` cookie established via `/api/v1/auth/callback`. Used by the Workspace web UI.
- **Test headers** (non-production only) -- `X-Test-Actor-PublicId` header bypasses OIDC validation in test environments.

State-changing browser requests must include a `X-CSRF-Token` header (obtained from `GET /api/v1/auth/csrf-token`). Bearer token requests are exempt from CSRF.

Unauthenticated requests receive a `401` with error code `AUTHENTICATION_REQUIRED`.

## Response Envelope

All successful responses use a consistent envelope:

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 25,
    "totalCount": 142
  }
}
```

- `data` -- the requested resource or collection. Always present.
- `meta` -- optional. Present for paginated collections, includes pagination state.

## Public Identifiers

All resources exposed through the API use **public IDs** -- UUIDs or human-readable slugs. Internal database auto-increment IDs are never exposed in API responses, request parameters, or URL paths.

Clients should treat public IDs as opaque strings. The format (UUID v4 vs. slug) varies by resource type but is stable for the lifetime of the resource.

## Error Codes

Error responses use deterministic, machine-readable codes:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `AUTHENTICATION_REQUIRED` | 401 | No valid credentials provided |
| `AUTHORIZATION_DENIED` | 403 | Authenticated but insufficient permissions |
| `RESOURCE_NOT_FOUND` | 404 | Resource does not exist or is not visible to actor |
| `VALIDATION_FAILED` | 422 | Request body failed schema validation |
| `CONFLICT` | 409 | Operation conflicts with current resource state |
| `REVIEW_NOT_ALLOWED` | 400 | Construct type does not support review |
| `INVALID_REVIEW_TRANSITION` | 409 | Status transition not valid from current state |
| `ARTIFACT_NOT_APPROVED` | 409 | Artifact must be approved before publication |
| `PUBLICATION_NOT_RETRYABLE` | 409 | Publication is not in a retryable state |
| `PROJECTION_FAILED` | 502 | External publication/projection failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

Error response body:

```json
{
  "error": {
    "code": "AUTHORIZATION_DENIED",
    "message": "Actor does not have access to this organization's resources."
  }
}
```

## Organization Scoping

All queries are filtered by the authenticated actor's organization. An actor in Organization A cannot read, list, or modify resources belonging to Organization B. This scoping is enforced at the query layer, not at the application layer -- there is no code path that can bypass it.

Cross-organization access is not supported. Platform-level admin operations (if needed) will use a separate administrative API surface.

## Content Type

All requests and responses use `Content-Type: application/json`.

## Endpoint Index

### Authentication (`/api/v1/auth`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/csrf-token` | Get CSRF token |
| POST | `/callback` | OIDC callback (establish session) |
| GET | `/session` | Check session status |
| POST | `/logout` | Destroy session |

### Current Actor (`/api/v1/me`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Current actor profile + org + memberships |

### Projects (`/api/v1/projects`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List accessible projects |
| GET | `/:projectSlug` | Get project (by slug or public_id) |
| GET | `/:projectSlug/studies` | Studies for a project |
| GET | `/:projectSlug/governance` | Governance summary |

### Studies (`/api/v1/studies`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:studyId` | Get study |
| GET | `/:studyId/sources` | Evidence sources |
| GET | `/:studyId/evidence` | Evidence constructs |
| GET | `/:studyId/artifacts` | Artifacts |

### Artifacts (`/api/v1/artifacts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:publicId` | Get artifact |
| GET | `/:publicId/preview` | Artifact content preview |
| GET | `/:publicId/provenance` | Artifact provenance |
| POST | `/:publicId/approve` | Approve artifact |
| POST | `/:publicId/publish` | Publish to GitHub |
| POST | `/:publicId/retry` | Retry failed publication |
| GET | `/:publicId/status` | Publication status |

### Findings (`/api/v1/findings`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:publicId/trace` | Traceability graph |
| POST | `/:publicId/review` | Review finding (accept/reject) |

### Recommendations (`/api/v1/recommendations`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:publicId/trace` | Traceability graph |
| POST | `/:publicId/review` | Review recommendation (accept/reject) |

### Admin (`/api/v1/admin`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/organization` | Organization profile |
| PATCH | `/organization` | Update organization |
| GET | `/teams` | List teams |
| POST | `/teams` | Create team |
| PATCH | `/teams/:teamPublicId` | Update team |
| GET | `/actors` | List actors |
| GET | `/actors/:actorPublicId` | Get actor with memberships |
| GET | `/projects/:id/memberships` | List project memberships |
| POST | `/projects/:id/memberships` | Add membership |
| DELETE | `/projects/:id/memberships/:actorId` | Remove membership |
| GET | `/integrations` | Integration status |

### Branding (`/api/v1/branding`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get org branding config |
| PUT | `/` | Update branding (admin) |
| POST | `/logo/validate` | Validate logo upload |

### Search (`/api/v1/search`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Search (placeholder — returns 501) |

# Qori Application API

## Overview

`/api/v1` is the initial public application boundary for Qori. This API serves the future Workspace web surface and any authorized external consumers. It does not replace the Slack Bolt handler layer -- Slack interactions continue through Socket Mode.

## Authentication

All requests require authentication via one of:

- **OIDC Bearer token** -- `Authorization: Bearer <token>` header. Tokens are validated against the configured OIDC provider. The token's claims establish the actor's identity, organization membership, and role.
- **Test headers** (non-production only) -- `X-Test-Actor-Id`, `X-Test-Org-Id`, `X-Test-Role` headers bypass OIDC validation in test environments. These headers are rejected in production.

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

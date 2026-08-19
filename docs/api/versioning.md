# API Versioning Policy

## Current Version

`/api/v1` is the current and only stable version.

## Versioning Rules

### Additive-compatible changes (no version bump)

The following changes are applied to the current version without requiring a new version prefix:

- Adding new fields to response objects
- Adding new endpoints
- Adding new optional query parameters
- Adding new enum values to fields (when clients are expected to handle unknown values)
- Adding new error codes

Clients should be written to tolerate unknown fields in responses.

### Breaking changes (require version bump)

The following changes require introducing `/api/v2`:

- Removing or renaming existing response fields
- Changing the type or semantics of an existing field
- Removing an endpoint
- Changing required request parameters
- Changing the meaning of an existing error code
- Changing the response envelope structure

### Deprecation

When a field or endpoint is scheduled for removal:

1. The field continues to appear in responses under the current version.
2. A `deprecated` notice is added to the field's documentation.
3. Deprecated fields may include an inline deprecation marker in the response metadata when feasible.
4. The field is removed only in the next major version (`v2`).

Clients are given at minimum one major version cycle of overlap before deprecated fields are removed.

## Stable Public IDs

Public IDs (UUIDs and slugs) are the stable contract between the API and its consumers. Clients should never depend on internal database schema, auto-increment ordering, or any identifier format that is not explicitly documented as a public ID.

If a public ID format must change (e.g., migrating from slug to UUID), the old format will continue to resolve for a documented transition period.

## Content Type

All API communication uses `Content-Type: application/json`. The API does not support content negotiation -- requests with other `Accept` types receive the JSON response regardless.

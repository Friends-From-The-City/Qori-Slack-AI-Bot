# Project External Identifier Contract

Date: 2026-08-19

## Current State

Projects use `slug` as the external API identifier in `/api/v1/projects/:projectSlug`.

Properties:
- **Organization-scoped**: Slug uniqueness is not enforced at DB level across organizations, but the API resolves slugs only within the caller's organization.
- **No internal IDs exposed**: API responses use `slug` as `public_id`, never the internal integer primary key.
- **Currently mutable**: `updateProject()` in `project.service.ts` accepts `slug` as an optional update field. Slug can change.

## BEFORE_WORKSPACE Gap

Because slug is **mutable**, it cannot serve as a stable external identifier for:
- Workspace URLs (`/projects/:slug` would break if slug changes)
- API client caches (stored slugs become stale)
- Cross-system references (Jira links, bookmarks)

### Required Migration (BEFORE_WORKSPACE)

1. Add `public_id` UUID column to `projects` table (default `gen_random_uuid()`)
2. Backfill existing projects with UUIDs
3. Add unique index on `(organization_id, public_id)`
4. Update API to use `public_id` in responses and accept both `public_id` and `slug` in route params
5. Evaluate whether to make `slug` immutable after creation (recommended) or keep it mutable with redirect support

### Current PLAT-3 Decision

For PLAT-3, `slug` is the external identifier. This is acceptable because:
- Slug changes are rare (admin action, not common workflow)
- No Workspace URLs exist yet to break
- The API already resolves by slug within org scope
- All other canonical entities (studies, artifacts, evidence) already have UUID `public_id`

### Other Entity Identifiers

| Entity | Identifier | Type | Stable |
|--------|-----------|------|--------|
| Organization | `public_id` | UUID | Yes |
| Actor | `public_id` | UUID | Yes |
| ResearchStudy | `public_id` | UUID | Yes |
| ResearchArtifact | `public_id` | UUID | Yes |
| EvidenceSource | `public_id` | UUID | Yes |
| EvidenceConstruct | `public_id` | UUID | Yes |
| **Project** | **`slug`** | **String** | **No (mutable)** |

Project is the only entity without a stable UUID identifier. This is the single BEFORE_WORKSPACE migration needed for identifier stability.

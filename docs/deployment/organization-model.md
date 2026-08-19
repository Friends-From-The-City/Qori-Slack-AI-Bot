# Organization Model

Qori uses explicit organizational entities for multi-tenant isolation. See ADR 0042.

## Entity Hierarchy

```
Organization (tenant boundary)
  ├── Team (subdivision within org)
  ├── Actor (canonical user identity)
  │    └── ActorIdentity (Slack, OIDC, SAML, local_test)
  ├── Project (scoped to org, optionally to team)
  │    └── ProjectMembership (actor → project, role-based)
  ├── AdapterWorkspaceBinding (Slack workspace → org)
  └── RepositoryBinding (GitHub repo → org/team/project)
```

## Organizations

Top-level tenant boundary. All projects, actors, and bindings are scoped to an organization.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | Internal ID |
| `public_id` | UUID UNIQUE | Stable external reference |
| `slug` | TEXT UNIQUE | URL-safe identifier |
| `name` | TEXT | Display name |
| `status` | TEXT | `active` or `inactive` |

## Teams

Subdivisions within an organization. Projects can optionally belong to a team.

Unique constraint: `(organization_id, slug)` — same slug allowed across different orgs.

## Actors

Canonical user identity, independent of any interface (Slack, web, API). Each actor belongs to exactly one organization.

Actor identities map provider-specific identifiers (Slack user IDs, OIDC subjects) to canonical actors. The `(provider, provider_subject)` pair is globally unique.

Supported providers: `slack`, `oidc`, `saml`, `local_test`.

## Authorization

Authorization flows through project membership:

```
Interface identity (e.g., Slack user ID)
  → ActorIdentity lookup (provider + subject)
  → Canonical Actor
  → ProjectMembership check (actor + project)
  → Role-based decision (owner/admin/researcher)
```

Roles:
- **owner** — project creator, records authority, can delete
- **admin** — full project access, can manage members
- **researcher** — standard project access

## Workspace Bindings

Maps adapter workspaces (Slack) to organizations. When a Slack command arrives, the workspace ID resolves the organization context.

## Repository Bindings

Maps GitHub repositories to organization/team/project scope. Supports:
- Organization-level default repo
- Team-level override
- Project-level override

## Backfill

On first deployment with PLAT-2 migrations:
1. A "default" organization is created
2. A default team is created (from `QORI_TEAM_SLUG` or "default")
3. All existing projects are assigned to the default org/team
4. Existing Slack user IDs in `project_members` are mapped to canonical actors
5. Project memberships are mirrored from `project_members` to `project_memberships`

No data is destroyed. The migration is reversible.

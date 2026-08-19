# ADR 0042: Canonical Organization and Actor Boundary

**Status:** Accepted
**Date:** 2026-08-19
**Decision drivers:** PLAT-2 government deployment requirement; need for multi-tenant isolation without breaking existing Slack-based workflows

## Context

Qori currently uses Slack user IDs as actor identifiers throughout the system. Projects are created by Slack users, project membership is tracked by Slack user ID, and authorization checks resolve against Slack channel membership. There is no canonical organization entity — all projects exist in a flat namespace scoped only by their slug.

For government deployments, Qori needs:
1. Explicit organizational boundaries (tenant isolation)
2. Actor identity independent of Slack (future OIDC/SAML support)
3. GitHub repository bindings per organization (not one global repo)
4. DSAR and records governance scoped to organizations

## Decision

Interface identities (Slack user IDs, future OIDC subjects, SAML NameIDs) map to canonical Qori actors. Organizations, teams, and projects define authority. Slack workspaces and future web/OIDC identities are adapters, not authority.

### Entity model

```
Organization (tenant boundary)
  └── Team (subdivision)
  └── Actor (canonical user)
       └── ActorIdentity (provider mapping: slack, oidc, saml, local_test)
  └── Project (scoped to org)
       └── ProjectMembership (actor-based)
  └── AdapterWorkspaceBinding (Slack workspace → org)
  └── RepositoryBinding (GitHub repo → org/team/project)
```

### Key invariants

- Organization is the top-level isolation boundary
- Actors belong to exactly one organization
- Projects belong to exactly one organization
- Cross-organization access is denied at the service layer
- Slack workspace maps to organization (not the reverse)
- Slack user ID maps to actor identity, not to authorization
- Existing `project_members` table is preserved during transition; `project_memberships` (actor-based) is the canonical table going forward

### Transition strategy

- Existing data is backfilled into a "default" organization
- Existing Slack user IDs are mapped to canonical actors with `provider=slack` identities
- Existing `project_members` rows are mirrored to `project_memberships`
- Current authorization service continues to work via Slack user IDs (transitional)
- New code should use actor-based authorization where possible

## Alternatives considered

### Enterprise RBAC framework (Casbin, CASL, etc.)

Premature. Current authorization needs are simple (owner/admin/researcher per project). Adding a policy engine would add complexity without solving the tenancy problem. Can be added later if role complexity increases.

### Slack workspace as organization

Tempting but wrong — Slack workspace is an adapter detail. An organization might use multiple workspaces, or might not use Slack at all (future web/API access). Using workspace as organization would cement the Slack dependency we're trying to abstract.

## Consequences

### Intended

- Multiple organizations can exist in one Qori deployment
- Each organization's data is isolated (projects, studies, evidence, artifacts)
- Actors can have multiple identity providers (Slack now, OIDC later)
- GitHub repositories can be bound per organization, not just globally
- DSAR and records governance are scoped through project → organization

### Accepted tradeoffs

- `projects.organization_id` is nullable during transition (to be made NOT NULL in a future migration after backfill verification)
- Existing `project_members` table is kept alongside new `project_memberships` — dual writes during transition
- Cross-org integrity is enforced at service layer, not fully at DB constraint level (some polymorphic relationships make pure FK enforcement impractical)
- Actor display names may be null until Slack profile resolution populates them

## References

- [ADR 0024 — Project-level authorization model](./0024-project-level-authorization-model.md)
- [ADR 0041 — Deployable government environment boundary](./0041-deployable-government-environment-boundary.md)
- [Deployment authentication boundary](../deployment/authentication.md)

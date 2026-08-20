# Admin Model

Admin exists for org owners/admins; it is visually separated from research work so the Workspace never feels like an enterprise console.

## Separation

- Admin is the last SideNav item, below a divider, gated by role.
- Entering Admin switches the AppShell to the **admin variant**: muted header band labeled "Organization administration", its own left section nav, breadcrumb returns to Home. Research nav is replaced by "← Back to workspace".
- Admin never interleaves with research screens; no admin widgets on Home (governance alerts appear on Home only when relevant and only as links into Admin).

## Sections (IA)

Route `/admin/:section`.

1. **Organization** — name, display name, short name, logo, branding preview, public hostname (read-mostly; hostname changes show impact copy).
2. **People & Access** — users/actors table (role, status, last active), teams, organization roles (owner/admin/member), project memberships. Role semantics respected: owners manage admins; admins manage members; members don't see Admin.
3. **Identity** — OIDC/SSO status (connected provider, health), login configuration, session concepts (duration, active sessions count). No secrets displayed.
4. **Integrations** — GitHub (org/repo targets, connection health, last publish), Slack (workspace link, health), future Jira/messaging as disabled "Planned" cards. Credentials masked; actions are Connect / Rotate / Disconnect with consequence copy.
5. **AI** — provider status, model policy (which tasks may run, review requirements), usage visibility where appropriate. Plain language: "Qori uses [provider] to analyze interviews."
6. **Research configuration** — taxonomy/tags management (system taxonomy CRUD, AI-suggestion mapping review), defaults (staleness threshold, review requirements).
7. **Governance** — records schedules, legal holds (with visible scope of what a hold freezes), archival policy, audit/review status summaries.

## Rules

- No raw credentials, ever — masked values + rotate actions.
- Every destructive/consequential admin action states scope and consequence; changes are audit-logged (visible in Governance).
- Forms follow AdminForm component: 720px max width, sticky save bar, error summary focus.
- Integration health here is the source that research-side banners link to ("GitHub is unreachable" banner → Admin → Integrations for admins; for members, "ask your administrator").

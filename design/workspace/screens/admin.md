# Screens: Admin (Organization · People & Access · Branding · Integrations)

**Routes** `/admin/organization`, `/admin/people`, `/admin/organization#branding` (branding lives in Organization), `/admin/integrations`. Shell = admin variant (`admin-model.md`). All forms = AdminForm (720px, sticky save bar, error summary).

## Admin / Organization (+ Branding)
- **Fields**: name, display name, short name, public hostname (change shows impact copy), logo + favicon upload with slot previews (32px/20px).
- **Branding panel**: themable tokens only (`brand`, `brand-ink`, `link`, `focus`, `surface-selected`) each with swatch input; **live preview** card (TopBar lockup + button + selected nav item rendered with proposed values); contrast validation blocks failing combos with guidance ("Link on surface is 3.2:1 — needs 4.5:1").
- **States**: dirty guard, validation, hostname pending-DNS state.
- **A11y**: preview has text alternative summarizing changes; color inputs paired with hex text fields.
- **API**: `GET/PATCH /admin/org`, logo upload, theme validation endpoint.

## Admin / People & Access
- **Users table** (P1 name, role, status · P2 last active · P3 auth method) + Invite (email, role). Role menu enforces semantics: owner > admin > member; admins cannot edit owners (rows disabled with reason).
- **Teams** and **project memberships** per user (drawer).
- **States**: pending invites, deactivated (consequence copy: attribution kept, access removed), SSO-managed users (role editable, identity read-only).
- **A11y**: table semantics; role changes confirmed with consequence; invite errors inline.
- **API**: users CRUD, invites, role changes (audited), memberships.

## Admin / Integrations
- **Cards**: GitHub (health, target org/repo for artifacts, last publish, Test connection, Rotate credentials — always masked, Disconnect with consequence "publishing pauses; research unaffected"), Slack (workspace, health), Jira + agency messaging ("Planned" disabled cards).
- **States**: healthy, degraded (error cause + affected capability), disconnected, rotating.
- **A11y**: health icon+label; masked values announced "hidden"; test results announced.
- **API**: `GET /admin/integrations`, connect/rotate/test/disconnect per adapter.

## Shared unresolved
- SCIM/directory sync scope for People
- Multi-repo publishing targets per project?
- Hostname provisioning flow ownership (Qori ops vs agency IT)

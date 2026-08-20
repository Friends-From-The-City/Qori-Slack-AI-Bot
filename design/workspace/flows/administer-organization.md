# Flow: Administer the Organization

**Actors**: Org owner/admin. **Entry**: SideNav → Admin (gated).

1. **Enter** — Shell switches to admin variant ("Organization administration" band, own section nav, "← Back to workspace").
2. **Branding** — Organization section: display name, short name, logo upload (slot preview), theme tokens (themable set only) with **live preview panel** (TopBar + card + button rendered with proposed tokens) and automatic contrast validation — failing combos blocked with guidance.
3. **People** — People & Access: invite user (email + role), change role (owner/admin/member semantics enforced — an admin cannot edit an owner), project memberships per user. Deactivation states consequence ("keeps authorship attribution; removes access").
4. **Integrations** — GitHub card: connection health, target repo/org, last publish, Rotate credentials (masked always), Test connection. Slack card: workspace link + health. Jira/messaging: "Planned" disabled cards.
5. **Governance** — Records schedules, holds (creating a hold names its scope: "Freezes 2 studies, 14 artifacts — nothing can be archived or deleted"), audit log view (filterable, exportable).

**States**: permission tiers (member never sees Admin; admin sees owner-gated rows disabled with reason), integration unhealthy (banner + affected-capability copy mirrored on research side), unsaved changes guard on section switch, validation errors with summary focus.

**A11y checkpoints**: section nav is labeled secondary nav; sticky save bar not obscuring focus; masked credentials announced as "hidden"; audit tables real tables.

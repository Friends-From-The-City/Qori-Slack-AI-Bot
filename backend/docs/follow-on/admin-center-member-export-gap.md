# Follow-on: Admin Center Member Export Gap

**Filed:** 2026-06-05
**Related:** ADR 0025 (Admin Center)
**Priority:** Low (design reconciliation, not a bug)
**Status:** RESOLVED (2026-06-05) — Option A implemented

## Issue

The Admin Center design specified two gating levels:
- **Export:** membership-gated (members can export)
- **Delete:** owner-gated (only owners can delete)

The current build implements owner-only UI access:
- Owners see action buttons (Participant Data, Delete Study)
- Non-owners (including members) see "contact an owner" with no action buttons

The membership-gating for export is enforced in handler code but unreachable — members have no UI path to trigger it.

## Resolution

**Option A implemented:** All Admin Center operations are now owner-only.

Changes made:
1. `adminActionsHandler.ts`: Export audit log now records `actor_role: 'owner'` and `authorization_basis: 'Project owner per ADR 0025'`
2. `adminCenterModal.ts`: Added JSDoc note that `isMember` parameter is vestigial (UX text only)
3. ADR 0025: Updated to note all Admin Center ops are owner-gated

The `isMember` distinction in `buildNonOwnerModal()` is kept for UX clarity only — it affects the explanatory message ("You are a project member, but..." vs "You are not a member...") but grants no access to actions.

## Rationale

- Simpler mental model: "members work the data, owners manage and dispose it"
- No need for a separate member export UI path
- Uniform authorization model for Admin Center
- If member self-service export is needed later, it can be added as a separate `/qori-export` command outside the Admin Center

/**
 * Organization Bootstrap Service — WS-0
 *
 * Provides explicit, idempotent organization owner assignment.
 *
 * BOOTSTRAP RULE:
 * Organization owner is NEVER inferred from actor creation order, email,
 * Slack identity, GitHub identity, project ownership, or first login.
 *
 * Owner must be assigned explicitly by a deployment operator via:
 * 1. CLI command: npm run admin:bootstrap-owner -- --org <slug> --actor <public_id>
 * 2. Direct SQL: UPDATE organization_memberships SET role = 'owner' WHERE ...
 *
 * This service validates the assignment and ensures idempotency.
 */

import type { Sequelize } from 'sequelize';

export interface BootstrapResult {
  success: boolean;
  organizationSlug: string;
  actorPublicId: string;
  previousRole: string | null;
  newRole: string;
  message: string;
}

/**
 * Assign an actor as organization owner.
 *
 * Idempotent: if the actor is already owner, succeeds with no-op.
 * Validates: actor must belong to the organization.
 * Does NOT demote existing owners — an org can have multiple owners.
 */
export async function bootstrapOrganizationOwner(
  sequelize: Sequelize,
  orgSlug: string,
  actorPublicId: string,
): Promise<BootstrapResult> {
  // Resolve organization
  const [orgRows] = await sequelize.query(
    `SELECT id, slug FROM organizations WHERE slug = :slug`,
    { replacements: { slug: orgSlug } },
  ) as [Array<{ id: number; slug: string }>, unknown];

  if (orgRows.length === 0) {
    return {
      success: false,
      organizationSlug: orgSlug,
      actorPublicId,
      previousRole: null,
      newRole: 'owner',
      message: `Organization "${orgSlug}" not found`,
    };
  }
  const orgId = orgRows[0].id;

  // Resolve actor — must belong to this organization
  const [actorRows] = await sequelize.query(
    `SELECT id, public_id, organization_id FROM actors WHERE public_id = :publicId`,
    { replacements: { publicId: actorPublicId } },
  ) as [Array<{ id: number; public_id: string; organization_id: number }>, unknown];

  if (actorRows.length === 0) {
    return {
      success: false,
      organizationSlug: orgSlug,
      actorPublicId,
      previousRole: null,
      newRole: 'owner',
      message: `Actor "${actorPublicId}" not found`,
    };
  }

  const actor = actorRows[0];
  if (actor.organization_id !== orgId) {
    return {
      success: false,
      organizationSlug: orgSlug,
      actorPublicId,
      previousRole: null,
      newRole: 'owner',
      message: `Actor "${actorPublicId}" does not belong to organization "${orgSlug}"`,
    };
  }

  // Check existing membership
  const [membershipRows] = await sequelize.query(
    `SELECT id, role FROM organization_memberships
     WHERE organization_id = :orgId AND actor_id = :actorId`,
    { replacements: { orgId, actorId: actor.id } },
  ) as [Array<{ id: number; role: string }>, unknown];

  const previousRole = membershipRows.length > 0 ? membershipRows[0].role : null;

  if (previousRole === 'owner') {
    return {
      success: true,
      organizationSlug: orgSlug,
      actorPublicId,
      previousRole: 'owner',
      newRole: 'owner',
      message: 'Actor is already organization owner (no-op)',
    };
  }

  // Upsert membership as owner
  if (membershipRows.length > 0) {
    await sequelize.query(
      `UPDATE organization_memberships SET role = 'owner', updated_at = NOW()
       WHERE organization_id = :orgId AND actor_id = :actorId`,
      { replacements: { orgId, actorId: actor.id } },
    );
  } else {
    await sequelize.query(
      `INSERT INTO organization_memberships (organization_id, actor_id, role)
       VALUES (:orgId, :actorId, 'owner')`,
      { replacements: { orgId, actorId: actor.id } },
    );
  }

  return {
    success: true,
    organizationSlug: orgSlug,
    actorPublicId,
    previousRole,
    newRole: 'owner',
    message: previousRole
      ? `Actor promoted from "${previousRole}" to "owner"`
      : 'Actor assigned as organization owner',
  };
}

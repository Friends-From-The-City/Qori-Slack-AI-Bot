/**
 * Actor Resolution Service (PLAT-2)
 *
 * Resolves interface identities (Slack user IDs, OIDC subjects, etc.)
 * to canonical Qori actors. Creates actors on-demand for first-time users.
 *
 * Resolution flow:
 *   interface identity (provider + subject)
 *   → actor_identities lookup
 *   → canonical actor
 *   → organization scope
 *
 * SECURITY CONTRACT:
 * - Resolution FAILS CLOSED — if lookup fails, deny access
 * - Never auto-create actors outside a known organization
 * - Slack workspace → organization mapping is required
 */

import type { Actor } from '../database/models/actor';
import type { ActorIdentity, IdentityProvider } from '../database/models/actor_identity';
import type { Organization } from '../database/models/organization';
import type { AdapterWorkspaceBinding } from '../database/models/adapter_workspace_binding';
import sequelize from '../database';

const ActorModel = sequelize.models.Actor as typeof Actor;
const ActorIdentityModel = sequelize.models.ActorIdentity as typeof ActorIdentity;
const OrganizationModel = sequelize.models.Organization as typeof Organization;
const WorkspaceBindingModel = sequelize.models.AdapterWorkspaceBinding as typeof AdapterWorkspaceBinding;

/**
 * Resolve a provider identity to a canonical actor.
 * Returns the actor if found, null if not.
 *
 * @param providerIssuer - Required for OIDC (two IdPs may issue same sub). Optional for Slack.
 */
export async function resolveActor(
  provider: IdentityProvider,
  providerSubject: string,
  providerIssuer?: string,
): Promise<Actor | null> {
  const where: Record<string, unknown> = { provider, provider_subject: providerSubject };
  if (providerIssuer) {
    where.provider_issuer = providerIssuer;
  } else {
    where.provider_issuer = null;
  }

  const identity = await ActorIdentityModel.findOne({ where });

  if (!identity) return null;

  return ActorModel.findByPk(identity.actor_id);
}

/**
 * Resolve a Slack user ID to a canonical actor, creating one if needed.
 *
 * Requires a workspace binding to determine the organization.
 * If no workspace binding exists, returns null (fail-closed).
 *
 * @param slackUserId - Slack user ID (e.g., U01234ABCDE)
 * @param slackTeamId - Slack workspace/team ID (e.g., T01234ABCDE)
 * @param displayName - Optional display name for actor creation
 */
export async function resolveOrCreateSlackActor(
  slackUserId: string,
  slackTeamId: string,
  displayName?: string,
): Promise<Actor | null> {
  // Fast path: identity already exists
  const existing = await resolveActor('slack', slackUserId);
  if (existing) return existing;

  // Resolve organization from workspace binding
  const binding = await WorkspaceBindingModel.findOne({
    where: { provider: 'slack', workspace_external_id: slackTeamId, status: 'active' },
  });

  if (!binding) {
    console.warn(
      `[ACTOR] No workspace binding for Slack team ${slackTeamId}. ` +
      `Cannot create actor for user ${slackUserId}. ` +
      `Register the workspace via adapter_workspace_bindings first.`,
    );
    return null;
  }

  // Create actor and identity in a transaction
  const transaction = await sequelize.transaction();
  try {
    // Double-check within transaction (race condition protection)
    const raceCheck = await ActorIdentityModel.findOne({
      where: { provider: 'slack', provider_subject: slackUserId },
      transaction,
    });
    if (raceCheck) {
      await transaction.commit();
      return ActorModel.findByPk(raceCheck.actor_id);
    }

    const actor = await ActorModel.create({
      organization_id: binding.organization_id,
      display_name: displayName || null,
      status: 'active',
    }, { transaction });

    await ActorIdentityModel.create({
      actor_id: actor.id,
      provider: 'slack',
      provider_subject: slackUserId,
      metadata: { slack_team_id: slackTeamId },
    }, { transaction });

    await transaction.commit();
    return actor;
  } catch (error) {
    await transaction.rollback();
    console.error(
      `[ACTOR] Failed to create actor for Slack user ${slackUserId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Resolve a Slack workspace ID to an organization.
 * Returns null if no binding exists.
 */
export async function resolveOrganizationFromWorkspace(
  provider: string,
  workspaceExternalId: string,
): Promise<Organization | null> {
  const binding = await WorkspaceBindingModel.findOne({
    where: { provider, workspace_external_id: workspaceExternalId, status: 'active' },
  });

  if (!binding) return null;

  return OrganizationModel.findByPk(binding.organization_id);
}

/**
 * Resolve an OIDC subject to a canonical actor, creating one if needed.
 *
 * Requires an identity_provider_binding to determine the organization.
 * If no binding exists for this issuer, returns null (fail-closed).
 *
 * @param oidcSubject - OIDC sub claim
 * @param issuer - OIDC issuer URL
 * @param displayName - Optional display name from token
 */
export async function resolveOrCreateOidcActor(
  oidcSubject: string,
  issuer: string,
  displayName?: string,
): Promise<Actor | null> {
  // Fast path: identity already exists
  const existing = await resolveActor('oidc', oidcSubject, issuer);
  if (existing) return existing;

  // Resolve organization from identity provider binding
  const IdpBindingModel = sequelize.models.IdentityProviderBinding;
  const binding = await IdpBindingModel.findOne({
    where: { provider: 'oidc', issuer_url: issuer, status: 'active' },
  });

  if (!binding) {
    console.warn(
      `[ACTOR] No identity provider binding for OIDC issuer ${issuer}. ` +
      `Cannot create actor for subject ${oidcSubject}. ` +
      `Register the issuer via identity_provider_bindings first.`,
    );
    return null;
  }

  // Create actor and identity in a transaction
  const transaction = await sequelize.transaction();
  try {
    // Double-check within transaction (race condition protection)
    const raceCheck = await ActorIdentityModel.findOne({
      where: { provider: 'oidc', provider_issuer: issuer, provider_subject: oidcSubject },
      transaction,
    });
    if (raceCheck) {
      await transaction.commit();
      return ActorModel.findByPk(raceCheck.actor_id);
    }

    const actor = await ActorModel.create({
      organization_id: binding.get('organization_id') as number,
      display_name: displayName || null,
      status: 'active',
    }, { transaction });

    await ActorIdentityModel.create({
      actor_id: actor.id,
      provider: 'oidc',
      provider_issuer: issuer,
      provider_subject: oidcSubject,
      metadata: { issuer },
    }, { transaction });

    await transaction.commit();
    return actor;
  } catch (error) {
    await transaction.rollback();
    console.error(
      `[ACTOR] Failed to create actor for OIDC subject ${oidcSubject}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Get actor by canonical ID.
 */
export async function getActorById(actorId: number): Promise<Actor | null> {
  return ActorModel.findByPk(actorId);
}

/**
 * Get all identities for an actor.
 */
export async function getActorIdentities(actorId: number): Promise<ActorIdentity[]> {
  return ActorIdentityModel.findAll({
    where: { actor_id: actorId },
  });
}

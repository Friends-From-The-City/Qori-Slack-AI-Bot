/**
 * Slack Context Bridge — PLAT-3
 *
 * Builds an ApplicationContext from Slack event/command context.
 * Used by Slack handlers to delegate to channel-independent application services.
 *
 * This is the bridge between the Slack adapter and the application layer.
 */

import type { ApplicationContext } from '../../types/application-context';
import { resolveOrCreateSlackActor } from '../../services/actorResolution.service';
import type { Organization } from '../../database/models/organization';
import sequelize from '../../database';
import { randomUUID } from 'crypto';

const OrganizationModel = sequelize.models.Organization as typeof Organization;

/**
 * Build an ApplicationContext from Slack user/team IDs.
 *
 * Returns null if actor or organization cannot be resolved (fail-closed).
 * Callers should fall back to legacy Slack-only flow if null.
 */
export async function buildSlackApplicationContext(
  slackUserId: string,
  slackTeamId: string,
  displayName?: string,
): Promise<ApplicationContext | null> {
  try {
    const actor = await resolveOrCreateSlackActor(slackUserId, slackTeamId, displayName);
    if (!actor) return null;

    const organization = await OrganizationModel.findByPk(actor.organization_id);
    if (!organization) return null;

    return {
      actor: {
        id: actor.id,
        publicId: actor.public_id,
        organizationId: actor.organization_id,
        displayName: actor.display_name,
      },
      organization: {
        id: organization.id,
        publicId: organization.public_id,
        slug: organization.slug,
        name: organization.name,
      },
      authenticationProvider: 'slack',
      correlationId: randomUUID(),
    };
  } catch (error) {
    console.error(
      `[SLACK-BRIDGE] Failed to build ApplicationContext for user=${slackUserId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Context Builder — PLAT-3
 *
 * Takes IdentityEvidence from an auth adapter and resolves it to a
 * canonical ApplicationContext through database lookups.
 *
 * Per ADR 0044: ApplicationContext contains identity/authority only.
 * Project/study scope is NOT included — that's request input resolved
 * per-request by application services.
 *
 * SECURITY CONTRACT:
 * - Fails closed: unknown actor → deny
 * - Never infers organization from email/token claims
 * - OIDC resolution uses identity_provider_bindings for issuer→org
 * - local_test resolution uses direct actor lookup by public_id
 */

import type { ApplicationContext } from '../../types/application-context';
import type { IdentityEvidence } from './types';
import type { Actor } from '../../database/models/actor';
import type { ActorIdentity } from '../../database/models/actor_identity';
import type { Organization } from '../../database/models/organization';
import type { IdentityProviderBinding } from '../../database/models/identity_provider_binding';
import sequelize from '../../database';
import { authenticationRequired } from '../../types/api-errors';
import { randomUUID } from 'crypto';

const ActorModel = sequelize.models.Actor as typeof Actor;
const ActorIdentityModel = sequelize.models.ActorIdentity as typeof ActorIdentity;
const OrganizationModel = sequelize.models.Organization as typeof Organization;
const IdpBindingModel = sequelize.models.IdentityProviderBinding as typeof IdentityProviderBinding;

/**
 * Build ApplicationContext from identity evidence.
 *
 * Resolution paths:
 * - OIDC: lookup identity by (provider, provider_issuer, provider_subject)
 *   → actor → organization. If not found, check identity_provider_bindings
 *   for issuer→org mapping and create actor.
 * - local_test: lookup actor directly by public_id (providerSubject)
 *
 * Returns null if identity cannot be resolved (fail-closed).
 */
export async function buildApplicationContext(
  evidence: IdentityEvidence,
): Promise<ApplicationContext> {
  let actor: Actor | null = null;
  let organization: Organization | null = null;

  if (evidence.provider === 'local_test') {
    // Test path: providerSubject is actor public_id
    actor = await ActorModel.findOne({
      where: { public_id: evidence.providerSubject },
    });
    if (!actor) {
      throw authenticationRequired('Unknown test actor');
    }
    organization = await OrganizationModel.findByPk(actor.organization_id);
  } else if (evidence.provider === 'oidc') {
    if (!evidence.providerIssuer) {
      throw authenticationRequired('OIDC identity missing issuer');
    }

    // Look up existing identity
    const identity = await ActorIdentityModel.findOne({
      where: {
        provider: 'oidc',
        provider_issuer: evidence.providerIssuer,
        provider_subject: evidence.providerSubject,
      },
    });

    if (identity) {
      actor = await ActorModel.findByPk(identity.actor_id);
    } else {
      // First-time OIDC user — resolve org from issuer binding
      const binding = await IdpBindingModel.findOne({
        where: {
          provider: 'oidc',
          issuer_url: evidence.providerIssuer,
          status: 'active',
        },
      });

      if (!binding) {
        throw authenticationRequired(
          'Identity provider not recognized. Contact your administrator.',
        );
      }

      // Create actor and identity in transaction
      const transaction = await sequelize.transaction();
      try {
        // Race condition check
        const raceCheck = await ActorIdentityModel.findOne({
          where: {
            provider: 'oidc',
            provider_issuer: evidence.providerIssuer,
            provider_subject: evidence.providerSubject,
          },
          transaction,
        });

        if (raceCheck) {
          await transaction.commit();
          actor = await ActorModel.findByPk(raceCheck.actor_id);
        } else {
          actor = await ActorModel.create(
            {
              organization_id: binding.organization_id,
              display_name: evidence.displayName || null,
              status: 'active',
            },
            { transaction },
          );

          await ActorIdentityModel.create(
            {
              actor_id: actor.id,
              provider: 'oidc',
              provider_issuer: evidence.providerIssuer,
              provider_subject: evidence.providerSubject,
              metadata: { issuer: evidence.providerIssuer },
            },
            { transaction },
          );

          await transaction.commit();
        }
      } catch (error) {
        await transaction.rollback();
        console.error(
          `[AUTH] Failed to create OIDC actor: ${error instanceof Error ? error.message : error}`,
        );
        throw authenticationRequired('Authentication failed');
      }
    }

    if (actor) {
      organization = await OrganizationModel.findByPk(actor.organization_id);
    }
  }

  if (!actor || !organization) {
    throw authenticationRequired('Unable to resolve identity');
  }

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
    authenticationProvider: evidence.provider,
    correlationId: randomUUID(),
  };
}

/**
 * Credential Resolver Service — WS-0
 *
 * Provider-neutral credential resolution interface.
 * Organization determines credential context.
 * Raw tokens come from deployment secret infrastructure (env vars).
 * Cross-org credential use is impossible by design.
 *
 * Resolution chain:
 * 1. Check integration_credentials table for org-specific credential_ref
 * 2. Resolve credential_ref to actual secret from env vars
 * 3. Fall back to global env var (single-org backward compatibility)
 */

import sequelize from '../database';
import type { IntegrationCredential } from '../database/models/integration_credential';

export interface ResolvedCredential {
  token: string;
  provider: string;
  organizationId: number;
  source: 'org_specific' | 'global_fallback';
}

/**
 * Resolve a credential for a provider within an organization.
 *
 * @param organizationId - The organization requesting the credential
 * @param provider - The integration provider (e.g., 'github')
 * @returns The resolved credential, or null if not available
 */
export async function resolveCredential(
  organizationId: number,
  provider: string,
): Promise<ResolvedCredential | null> {
  const IntegrationCredentialModel = sequelize.models.IntegrationCredential as typeof IntegrationCredential | undefined;

  // 1. Try org-specific credential
  if (IntegrationCredentialModel) {
    const credential = await IntegrationCredentialModel.findOne({
      where: {
        organization_id: organizationId,
        provider,
        status: 'active',
      },
    });

    if (credential) {
      const token = resolveCredentialRef(credential.credential_ref);
      if (token) {
        return {
          token,
          provider,
          organizationId,
          source: 'org_specific',
        };
      }
    }
  }

  // 2. Fall back to global env var (backward compatibility for single-org)
  const globalToken = getGlobalCredential(provider);
  if (globalToken) {
    return {
      token: globalToken,
      provider,
      organizationId,
      source: 'global_fallback',
    };
  }

  return null;
}

/**
 * Resolve a GitHub credential for an organization.
 * Convenience wrapper for the common case.
 */
export async function resolveGitHubCredential(
  organizationId: number,
): Promise<ResolvedCredential | null> {
  return resolveCredential(organizationId, 'github');
}

/**
 * Check if an organization has a configured credential for a provider.
 * Does not return the actual token.
 */
export async function hasCredential(
  organizationId: number,
  provider: string,
): Promise<boolean> {
  const resolved = await resolveCredential(organizationId, provider);
  return resolved !== null;
}

// ─── Internal ──────────────────────────────────────────────────────

/**
 * Resolve a credential reference to an actual secret value.
 *
 * credential_ref format:
 * - "env:VAR_NAME" — read from environment variable
 * - Future: "vault:path/to/secret" — read from secret manager
 */
function resolveCredentialRef(ref: string): string | null {
  if (ref.startsWith('env:')) {
    const envVar = ref.slice(4);
    return process.env[envVar] || null;
  }

  // Future: support vault:, aws-sm:, etc.
  console.warn(`[CREDENTIAL] Unknown credential_ref format: ${ref.slice(0, 10)}...`);
  return null;
}

/**
 * Get global credential from well-known env vars.
 * Used as backward-compatible fallback for single-org deployments.
 */
function getGlobalCredential(provider: string): string | null {
  const envMap: Record<string, string> = {
    github: 'GITHUB_TOKEN',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
  };

  const envVar = envMap[provider];
  if (!envVar) return null;

  return process.env[envVar] || null;
}

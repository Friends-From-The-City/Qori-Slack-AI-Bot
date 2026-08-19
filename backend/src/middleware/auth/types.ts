/**
 * Auth Adapter Types — PLAT-3
 *
 * Defines the adapter interface for extracting identity evidence
 * from incoming requests, regardless of authentication provider.
 */

import type { Request } from 'express';
import type { AuthenticationProvider } from '../../types/application-context';

/**
 * Identity evidence extracted from a request by an auth adapter.
 *
 * This is raw evidence — it has NOT been resolved to a canonical actor yet.
 * The contextBuilder does the resolution.
 */
export interface IdentityEvidence {
  /** Which provider authenticated this identity */
  provider: AuthenticationProvider;
  /** Provider-specific subject identifier (e.g., Slack user ID, OIDC sub) */
  providerSubject: string;
  /** Issuer URL — required for OIDC (two IdPs may issue same sub) */
  providerIssuer?: string;
  /** Optional display name from the identity token */
  displayName?: string;
}

/**
 * Auth adapter interface.
 *
 * Each adapter (Slack, OIDC, localTest) implements this to extract
 * identity evidence from requests in its own way.
 */
export interface AuthAdapter {
  /** Human-readable name for logging */
  name: string;

  /**
   * Attempt to extract identity evidence from the request.
   * Returns null if this adapter does not recognize the request
   * (e.g., no Bearer token for OIDC adapter).
   * Throws on malformed/invalid credentials (e.g., expired JWT).
   */
  extractIdentity(req: Request): Promise<IdentityEvidence | null>;
}

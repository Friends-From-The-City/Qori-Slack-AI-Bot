/**
 * OIDC Auth Adapter — PLAT-3
 *
 * Validates JWT Bearer tokens per the production OIDC contract:
 * 1. Configured issuer (OIDC_ISSUER env var)
 * 2. Issuer validation (iss claim must match)
 * 3. Audience/client validation (aud must match OIDC_CLIENT_ID)
 * 4. Signature verification against issuer JWKS (OIDC_JWKS_URI)
 * 5. Expiry (exp) and not-before (nbf) validation
 * 6. Stable subject extraction (sub)
 *
 * No authorization derived from token roles/groups/scopes.
 */

import type { Request } from 'express';
import type { AuthAdapter, IdentityEvidence } from './types';
import { authenticationRequired } from '../../types/api-errors';

// jose is ESM-only — use dynamic import with any-typed cache
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let joseModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jwksCache: any = null;

async function loadJose(): Promise<{ createRemoteJWKSet: Function; jwtVerify: Function }> {
  if (!joseModule) {
    joseModule = await import('jose');
  }
  return joseModule;
}

async function getJwks() {
  if (!jwksCache) {
    const jwksUri = process.env.OIDC_JWKS_URI;
    if (!jwksUri) {
      throw new Error('[AUTH/OIDC] OIDC_JWKS_URI not configured');
    }
    const jose = await loadJose();
    jwksCache = jose.createRemoteJWKSet(new URL(jwksUri));
  }
  return jwksCache;
}

export const oidcAdapter: AuthAdapter = {
  name: 'oidc',

  async extractIdentity(req: Request): Promise<IdentityEvidence | null> {
    // Only process Bearer tokens
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const issuer = process.env.OIDC_ISSUER;
    const audience = process.env.OIDC_CLIENT_ID;

    if (!issuer || !audience) {
      // OIDC not configured — skip this adapter
      return null;
    }

    const token = authHeader.slice(7);

    let payload: { sub?: string; iss?: string; name?: unknown };
    try {
      const jose = await loadJose();
      const jwks = await getJwks();
      const result = await jose.jwtVerify(token, jwks, {
        issuer,
        audience,
        clockTolerance: 30, // 30 seconds clock skew tolerance
      });
      payload = result.payload;
    } catch (error) {
      if (error instanceof Error) {
        const name = error.constructor?.name || error.name;
        if (name === 'JWTExpired') {
          throw authenticationRequired('Token expired');
        }
        if (name === 'JWTClaimValidationFailed') {
          throw authenticationRequired('Token validation failed: invalid claims');
        }
        if (name === 'JWSSignatureVerificationFailed') {
          throw authenticationRequired('Token signature verification failed');
        }
      }
      throw authenticationRequired('Invalid authentication token');
    }

    // Extract stable subject
    const sub = payload.sub;
    if (!sub) {
      throw authenticationRequired('Token missing subject claim');
    }

    const iss = payload.iss;
    if (!iss) {
      throw authenticationRequired('Token missing issuer claim');
    }

    return {
      provider: 'oidc',
      providerSubject: sub,
      providerIssuer: iss,
      displayName: typeof payload.name === 'string' ? payload.name : undefined,
    };
  },
};

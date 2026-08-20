/**
 * Session Auth Adapter — WS-0
 *
 * Extracts identity from server-side session cookie.
 * Used by the Workspace web UI (browser clients).
 *
 * Session contains actorPublicId established during OIDC login flow.
 * The session itself is the authentication proof — no JWT needed per request.
 *
 * Uses 'local_test' provider path in contextBuilder (direct actor lookup
 * by public_id) since the session has already authenticated the user.
 */

import type { Request } from 'express';
import type { AuthAdapter, IdentityEvidence } from './types';

export const sessionAdapter: AuthAdapter = {
  name: 'session',

  async extractIdentity(req: Request): Promise<IdentityEvidence | null> {
    if (!req.session?.actorPublicId) {
      return null;
    }

    // Session was established via OIDC — actor is already resolved and stored.
    // Use the same resolution path as local_test (direct actor public_id lookup)
    // since we don't need to re-validate the OIDC token on every request.
    return {
      provider: 'session' as any, // Resolved by contextBuilder session path
      providerSubject: req.session.actorPublicId,
    };
  },
};

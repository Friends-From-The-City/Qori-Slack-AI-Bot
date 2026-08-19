/**
 * Local Test Auth Adapter — PLAT-3
 *
 * Test-only adapter that accepts X-Test-Actor-PublicId header.
 * Resolves actor from DB by public_id. No tokens, no secrets.
 *
 * ONLY active when NODE_ENV === 'test'.
 */

import type { Request } from 'express';
import type { AuthAdapter, IdentityEvidence } from './types';

export const localTestAdapter: AuthAdapter = {
  name: 'local_test',

  async extractIdentity(req: Request): Promise<IdentityEvidence | null> {
    if (process.env.NODE_ENV !== 'test') {
      return null;
    }

    const actorPublicId = req.headers['x-test-actor-publicid'] as string | undefined;
    if (!actorPublicId) {
      return null;
    }

    return {
      provider: 'local_test',
      providerSubject: actorPublicId,
      displayName: undefined,
    };
  },
};

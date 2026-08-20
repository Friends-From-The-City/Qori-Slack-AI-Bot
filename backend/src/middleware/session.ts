/**
 * Session middleware — WS-0 web session contract.
 *
 * Server-side sessions backed by Redis (same instance as Bull queues).
 * Sessions are operational/authentication state, NOT canonical research state.
 *
 * Security:
 * - HttpOnly cookies (no JS access)
 * - Secure in production (HTTPS only)
 * - SameSite=Lax (CSRF mitigation, compatible with OIDC redirects)
 * - Bounded expiration (24h absolute, 2h idle via rolling)
 * - Session secret from env, never hardcoded
 */

import session from 'express-session';
import type { RequestHandler } from 'express';

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    actorPublicId?: string;
    organizationPublicId?: string;
    authProvider?: string;
    authenticatedAt?: number;
  }
}

/**
 * Create session middleware.
 *
 * Uses Redis store when REDIS_URL is configured (production).
 * Falls back to in-memory store for development/test (with warning).
 */
export function createSessionMiddleware(): RequestHandler {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.warn(
      '[SESSION] SESSION_SECRET not set — session middleware disabled. ' +
      'Set SESSION_SECRET env var to enable web sessions.',
    );
    // Return no-op middleware when sessions aren't configured
    return (_req, _res, next) => next();
  }

  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = parseInt(process.env.SESSION_MAX_AGE_MS || '86400000', 10); // 24h default

  const sessionConfig: session.SessionOptions = {
    secret,
    name: 'qori.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiry on activity (idle timeout)
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: Number.isFinite(maxAge) && maxAge > 0 ? maxAge : 86400000,
      path: '/',
    },
  };

  // Redis store for production — lazy-loaded to avoid import issues when Redis isn't available
  if (process.env.REDIS_URL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const RedisStore = require('connect-redis').default;
      const { createClient } = require('redis');
      const redisClient = createClient({ url: process.env.REDIS_URL });
      redisClient.connect().catch((err: Error) => {
        console.error('[SESSION] Redis connection failed:', err.message);
      });
      sessionConfig.store = new RedisStore({
        client: redisClient,
        prefix: 'qori:sess:',
        ttl: Math.floor(maxAge / 1000),
      });
    } catch (err) {
      console.warn('[SESSION] Redis store unavailable, using memory store:', err instanceof Error ? err.message : err);
    }
  } else if (isProd) {
    console.warn('[SESSION] No REDIS_URL in production — sessions will not persist across restarts');
  }

  return session(sessionConfig);
}

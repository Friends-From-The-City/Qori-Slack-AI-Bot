/**
 * Rate limiting middleware for API routes.
 *
 * Configurable via environment variables:
 * - API_RATE_LIMIT_WINDOW_MS — window duration in milliseconds (default: 60000 = 1 minute)
 * - API_RATE_LIMIT_MAX — max requests per window (default: 100)
 *
 * Applied only to /api routes. Slack Socket Mode is unaffected.
 */

import rateLimit from 'express-rate-limit';

export function createApiRateLimiter() {
  const windowMs = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10);
  const max = parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10);

  return rateLimit({
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60000,
    max: Number.isFinite(max) && max > 0 ? max : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    },
  });
}

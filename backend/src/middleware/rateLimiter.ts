/**
 * Rate limiting middleware for API routes — WS-0 enhanced.
 *
 * Three tiers:
 * - General API: 100 req/min (configurable)
 * - Auth endpoints: 10 req/min (brute-force protection)
 * - AI/write endpoints: 20 req/min (cost protection)
 *
 * Applied only to /api routes. Slack Socket Mode is unaffected.
 */

import rateLimit from 'express-rate-limit';

const rateLimitMessage = {
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
};

/** General API rate limiter */
export function createApiRateLimiter() {
  const windowMs = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10);
  const max = parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10);

  return rateLimit({
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60000,
    max: Number.isFinite(max) && max > 0 ? max : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
  });
}

/** Auth endpoint rate limiter — stricter to prevent brute-force */
export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 60000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
  });
}

/** AI/write endpoint rate limiter — cost and abuse protection */
export function createAiRateLimiter() {
  const max = parseInt(process.env.AI_RATE_LIMIT_MAX || '20', 10);

  return rateLimit({
    windowMs: 60000, // 1 minute
    max: Number.isFinite(max) && max > 0 ? max : 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
  });
}

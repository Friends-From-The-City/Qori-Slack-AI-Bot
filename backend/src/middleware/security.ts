/**
 * Security middleware — helmet configuration for HTTP API.
 *
 * Provides CSP baseline, HSTS, and standard security headers.
 * Only applied to API routes (not Slack Socket Mode).
 */

import helmet from 'helmet';

/**
 * Create security headers middleware via helmet.
 *
 * CSP is intentionally restrictive for an API-only surface:
 * - default-src 'none' — no resource loading
 * - frame-ancestors 'none' — cannot be embedded
 *
 * HSTS is enabled with a conservative max-age.
 * Agency deployments can increase via reverse proxy headers.
 */
export function createSecurityMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: false, // Agency controls preload submission
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: false, // Deprecated header; CSP is the protection
  });
}

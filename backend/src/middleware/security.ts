/**
 * Security middleware — WS-0 enhanced helmet configuration.
 *
 * Provides CSP baseline, HSTS, and standard security headers.
 * Only applied to API routes (not Slack Socket Mode).
 *
 * WS-0 additions:
 * - CSP supports future workspace app assets (script-src, style-src, img-src)
 * - frame-ancestors configurable for agency embedding requirements
 * - CORS origin configurable per deployment
 * - No agency hostname hardcoded
 */

import helmet from 'helmet';

/**
 * Create security headers middleware via helmet.
 *
 * CSP directives:
 * - API-only paths: default-src 'none'
 * - Workspace paths (future): self + configured asset origins
 * - frame-ancestors: 'none' by default, configurable via FRAME_ANCESTORS env
 *
 * HSTS: 1 year, includeSubDomains, no preload (agency controls preload submission).
 */
export function createSecurityMiddleware() {
  const frameAncestors = process.env.FRAME_ANCESTORS
    ? process.env.FRAME_ANCESTORS.split(',').map(s => s.trim())
    : ["'none'"];

  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Required for styled-components/CSS-in-JS
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors,
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: false, // Agency controls preload submission
    },
    frameguard: false, // CSP frame-ancestors supersedes X-Frame-Options
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: false, // Deprecated header; CSP is the protection
  });
}

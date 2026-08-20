/**
 * CSRF protection middleware — WS-0 web session contract.
 *
 * Strategy: Double-submit cookie pattern.
 * - On GET to /api/v1/auth/csrf-token: set a signed CSRF cookie + return token in body
 * - On state-changing requests (POST/PUT/PATCH/DELETE): verify X-CSRF-Token header matches cookie
 * - Bearer token requests (API clients) are exempt — CSRF is a browser-origin attack
 *
 * This avoids the deprecated `csurf` package and implements the pattern directly.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomBytes, createHmac } from 'crypto';

const CSRF_COOKIE_NAME = 'qori.csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.CSRF_SECRET;
  if (!secret) {
    throw new Error('[CSRF] SESSION_SECRET or CSRF_SECRET must be set');
  }
  return secret;
}

function signToken(token: string): string {
  return createHmac('sha256', getSecret()).update(token).digest('hex');
}

/**
 * Generate a new CSRF token and set the cookie.
 */
export function generateCsrfToken(res: Response): string {
  const token = randomBytes(TOKEN_LENGTH).toString('hex');
  const signature = signToken(token);
  const isProd = process.env.NODE_ENV === 'production';

  res.cookie(CSRF_COOKIE_NAME, `${token}.${signature}`, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400000, // 24h
  });

  return token;
}

/**
 * CSRF validation middleware.
 *
 * Exemptions:
 * - Safe methods (GET, HEAD, OPTIONS)
 * - Bearer token auth (API clients, not browser sessions)
 * - Requests without a session cookie (no session = no CSRF risk)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methods don't need CSRF protection
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safeMethod) {
    next();
    return;
  }

  // Bearer token requests are exempt — CSRF is a browser-origin attack
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // No session cookie = no CSRF risk
  if (!req.cookies?.['qori.sid']) {
    next();
    return;
  }

  // Validate CSRF token
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;
  const cookieValue = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;

  if (!headerToken || !cookieValue) {
    res.status(403).json({
      error: { code: 'CSRF_VALIDATION_FAILED', message: 'Missing CSRF token' },
    });
    return;
  }

  const [cookieToken, cookieSignature] = cookieValue.split('.');
  if (!cookieToken || !cookieSignature) {
    res.status(403).json({
      error: { code: 'CSRF_VALIDATION_FAILED', message: 'Invalid CSRF cookie' },
    });
    return;
  }

  // Verify signature
  const expectedSignature = signToken(cookieToken);
  if (cookieSignature !== expectedSignature) {
    res.status(403).json({
      error: { code: 'CSRF_VALIDATION_FAILED', message: 'CSRF cookie tampered' },
    });
    return;
  }

  // Verify header matches cookie token
  if (headerToken !== cookieToken) {
    res.status(403).json({
      error: { code: 'CSRF_VALIDATION_FAILED', message: 'CSRF token mismatch' },
    });
    return;
  }

  next();
}

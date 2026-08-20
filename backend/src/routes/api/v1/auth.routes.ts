/**
 * /api/v1/auth — Authentication endpoints for web session management.
 *
 * Provides:
 * - OIDC callback (establishes session after IdP authentication)
 * - CSRF token endpoint
 * - Logout / session revocation
 * - Session status check
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { generateCsrfToken } from '../../../middleware/csrf';

const router = Router();

/**
 * GET /api/v1/auth/csrf-token
 * Returns a CSRF token for the current session. Sets the CSRF cookie.
 */
router.get('/csrf-token', (req, res) => {
  const token = generateCsrfToken(res);
  res.json({ data: { token } });
});

/**
 * POST /api/v1/auth/callback
 * OIDC callback — receives identity evidence and establishes a session.
 *
 * In production, the OIDC flow works as:
 * 1. Browser redirects to IdP authorization endpoint
 * 2. IdP authenticates user, redirects back with authorization code
 * 3. Backend exchanges code for tokens (server-side)
 * 4. Backend validates ID token, creates session
 * 5. Browser receives session cookie
 *
 * This endpoint handles step 4-5. The actual OIDC code exchange
 * must be implemented per-IdP when a live IdP is available.
 * For now, this accepts a Bearer token (ID token) and establishes a session.
 */
router.post('/callback', requireAuth, (req, res) => {
  if (!req.ctx) {
    res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication failed' } });
    return;
  }

  // Establish session from the authenticated context
  if (req.session) {
    req.session.actorPublicId = req.ctx.actor.publicId;
    req.session.organizationPublicId = req.ctx.organization.publicId;
    req.session.authProvider = req.ctx.authenticationProvider;
    req.session.authenticatedAt = Date.now();
  }

  res.json({
    data: {
      actor_public_id: req.ctx.actor.publicId,
      organization_public_id: req.ctx.organization.publicId,
      session_established: true,
    },
  });
});

/**
 * GET /api/v1/auth/session
 * Check current session status.
 */
router.get('/session', (req, res) => {
  if (!req.session?.actorPublicId) {
    res.json({ data: { authenticated: false } });
    return;
  }

  res.json({
    data: {
      authenticated: true,
      actor_public_id: req.session.actorPublicId,
      organization_public_id: req.session.organizationPublicId,
      authenticated_at: req.session.authenticatedAt
        ? new Date(req.session.authenticatedAt).toISOString()
        : null,
    },
  });
});

/**
 * POST /api/v1/auth/logout
 * Destroy session and clear cookies.
 */
router.post('/logout', (req, res) => {
  if (!req.session) {
    res.json({ data: { logged_out: true } });
    return;
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('[AUTH] Session destruction failed:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Logout failed' },
      });
      return;
    }

    // Clear session and CSRF cookies
    res.clearCookie('qori.sid', { path: '/' });
    res.clearCookie('qori.csrf', { path: '/' });
    res.json({ data: { logged_out: true } });
  });
});

export default router;

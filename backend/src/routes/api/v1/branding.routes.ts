/**
 * /api/v1/branding — Organization branding endpoints.
 *
 * Public read (for workspace shell rendering).
 * Write requires admin authorization.
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import * as brandingAppService from '../../../application/branding.app-service';

const router = Router();

/**
 * GET /api/v1/branding
 * Public branding config for the authenticated actor's organization.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await brandingAppService.getBranding(req.ctx!);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/branding
 * Update branding config. Requires admin role.
 */
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const result = await brandingAppService.updateBranding(req.ctx!, req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/branding/logo/validate
 * Validate a logo upload (content type, size) without storing it.
 * Actual upload/storage is deployment-specific.
 */
router.post('/logo/validate', requireAuth, async (req, res, next) => {
  try {
    const result = await brandingAppService.validateLogoUpload(req.ctx!, req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

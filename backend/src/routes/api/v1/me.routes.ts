/**
 * /api/v1/me — Current actor profile and memberships.
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { getCurrentActor } from '../../../application/me.app-service';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await getCurrentActor(req.ctx!);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

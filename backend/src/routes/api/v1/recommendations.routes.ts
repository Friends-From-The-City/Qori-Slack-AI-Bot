/**
 * /api/v1/recommendations — Recommendation endpoints with traceability.
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { getTraceGraph } from '../../../application/traceability.app-service';

const router = Router();

// Get traceability graph for a recommendation (evidence construct)
router.get('/:publicId/trace', requireAuth, async (req, res, next) => {
  try {
    const result = await getTraceGraph(req.ctx!, req.params.publicId as string, 'both');
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

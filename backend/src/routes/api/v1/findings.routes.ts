/**
 * /api/v1/findings — Finding endpoints with traceability and review.
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { getTraceGraph } from '../../../application/traceability.app-service';
import { reviewFinding } from '../../../application/evidence-review.app-service';
import { validationError } from '../../../types/api-errors';
import type { ReviewDecision } from '../../../application/evidence-review.app-service';

const router = Router();

// Get traceability graph for a finding (evidence construct)
router.get('/:publicId/trace', requireAuth, async (req, res, next) => {
  try {
    const result = await getTraceGraph(req.ctx!, req.params.publicId as string, 'both');
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Review a finding (accept or reject)
router.post('/:publicId/review', requireAuth, async (req, res, next) => {
  try {
    const { decision } = req.body as { decision?: string };

    if (!decision || (decision !== 'accept' && decision !== 'reject')) {
      throw validationError(
        'Invalid decision — must be "accept" or "reject"',
        { field: 'decision', allowed: ['accept', 'reject'] },
      );
    }

    const result = await reviewFinding(
      req.ctx!,
      req.params.publicId as string,
      decision as ReviewDecision,
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

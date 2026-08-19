/**
 * /api/v1/search — Placeholder for future retrieval boundary (PH-9 Qori Ask).
 *
 * Reserved for future:
 * - authorization scope → org/team/project/study scope
 * - entity/status/freshness filters
 * - taxonomy/tags
 * - evidence graph
 * - semantic retrieval
 * - answer with lineage
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Search is not yet available. This endpoint is reserved for future use.',
    },
  });
});

export default router;

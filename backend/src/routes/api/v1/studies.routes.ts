/**
 * /api/v1/studies — Study endpoints, org-scoped.
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import * as studyAppService from '../../../application/study.app-service';

const router = Router();

// Get a single study
router.get('/:studyId', requireAuth, async (req, res, next) => {
  try {
    const result = await studyAppService.getStudy(req.ctx!, req.params.studyId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get evidence sources for a study
router.get('/:studyId/sources', requireAuth, async (req, res, next) => {
  try {
    const result = await studyAppService.getStudySources(req.ctx!, req.params.studyId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get evidence constructs for a study
router.get('/:studyId/evidence', requireAuth, async (req, res, next) => {
  try {
    const result = await studyAppService.getStudyEvidence(req.ctx!, req.params.studyId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get artifacts for a study
router.get('/:studyId/artifacts', requireAuth, async (req, res, next) => {
  try {
    const result = await studyAppService.getStudyArtifacts(req.ctx!, req.params.studyId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

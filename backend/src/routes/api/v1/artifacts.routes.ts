/**
 * /api/v1/artifacts — Artifact endpoints with workflow + publication status.
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import * as artifactAppService from '../../../application/artifact.app-service';

const router = Router();

// Get a single artifact
router.get('/:publicId', requireAuth, async (req, res, next) => {
  try {
    const result = await artifactAppService.getArtifact(req.ctx!, req.params.publicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get artifact preview/content
router.get('/:publicId/preview', requireAuth, async (req, res, next) => {
  try {
    const result = await artifactAppService.getArtifactPreview(req.ctx!, req.params.publicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get artifact provenance
router.get('/:publicId/provenance', requireAuth, async (req, res, next) => {
  try {
    const result = await artifactAppService.getArtifactProvenance(req.ctx!, req.params.publicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Approve an artifact
router.post('/:publicId/approve', requireAuth, async (req, res, next) => {
  try {
    const result = await artifactAppService.approveArtifact(req.ctx!, req.params.publicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Publish an artifact to GitHub
router.post('/:publicId/publish', requireAuth, async (req, res, next) => {
  try {
    const result = await artifactAppService.publishArtifact(req.ctx!, req.params.publicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Retry a failed publication
router.post('/:publicId/retry', requireAuth, async (req, res, next) => {
  try {
    const result = await artifactAppService.retryPublication(req.ctx!, req.params.publicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get publication status
router.get('/:publicId/status', requireAuth, async (req, res, next) => {
  try {
    const result = await artifactAppService.getPublicationStatus(req.ctx!, req.params.publicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

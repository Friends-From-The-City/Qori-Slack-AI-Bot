/**
 * /api/v1/projects — Project endpoints, org-scoped.
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import * as projectAppService from '../../../application/project.app-service';

const router = Router();

// List projects the actor has access to
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await projectAppService.listProjects(req.ctx!);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get a single project by slug
router.get('/:projectSlug', requireAuth, async (req, res, next) => {
  try {
    const result = await projectAppService.getProject(req.ctx!, req.params.projectSlug as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get studies for a project
router.get('/:projectSlug/studies', requireAuth, async (req, res, next) => {
  try {
    const result = await projectAppService.getProjectStudies(req.ctx!, req.params.projectSlug as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// Get governance summary for a project
router.get('/:projectSlug/governance', requireAuth, async (req, res, next) => {
  try {
    const result = await projectAppService.getProjectGovernance(req.ctx!, req.params.projectSlug as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

/**
 * /api/v1/admin — Organization-scoped administration endpoints.
 *
 * All operations:
 * - Resolve canonical actor
 * - Require owner/admin authorization
 * - Remain within actor's organization
 * - Fail closed cross-org
 */

import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import * as adminAppService from '../../../application/admin.app-service';

const router = Router();

// ─── Organization Profile ──────────────────────────────────────────

router.get('/organization', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.getOrganization(req.ctx!);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.patch('/organization', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.updateOrganization(req.ctx!, req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// ─── Teams ─────────────────────────────────────────────────────────

router.get('/teams', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.listTeams(req.ctx!);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/teams', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.createTeam(req.ctx!, req.body);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.patch('/teams/:teamPublicId', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.updateTeam(req.ctx!, req.params.teamPublicId as string, req.body);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// ─── Actors / Users ────────────────────────────────────────────────

router.get('/actors', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.listActors(req.ctx!);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/actors/:actorPublicId', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.getActor(req.ctx!, req.params.actorPublicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// ─── Project Memberships ───────────────────────────────────────────

router.get('/projects/:projectPublicId/memberships', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.listProjectMemberships(req.ctx!, req.params.projectPublicId as string);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:projectPublicId/memberships', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.addProjectMembership(req.ctx!, req.params.projectPublicId as string, req.body);
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.delete('/projects/:projectPublicId/memberships/:actorPublicId', requireAuth, async (req, res, next) => {
  try {
    await adminAppService.removeProjectMembership(req.ctx!, req.params.projectPublicId as string, req.params.actorPublicId as string);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ─── Integration Status ────────────────────────────────────────────

router.get('/integrations', requireAuth, async (req, res, next) => {
  try {
    const result = await adminAppService.listIntegrations(req.ctx!);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;

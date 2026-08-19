/**
 * API v1 Router — initial public application boundary.
 *
 * All routes require authentication via requireAuth middleware.
 * Scope (project, study) is resolved per-request from canonical state,
 * never trusted from client input.
 */

import { Router } from 'express';
import meRoutes from './me.routes';
import projectsRoutes from './projects.routes';
import studiesRoutes from './studies.routes';
import artifactsRoutes from './artifacts.routes';
import findingsRoutes from './findings.routes';
import recommendationsRoutes from './recommendations.routes';
import searchRoutes from './search.routes';

const v1Router = Router();

v1Router.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', version: 'v1' } });
});

v1Router.use('/me', meRoutes);
v1Router.use('/projects', projectsRoutes);
v1Router.use('/studies', studiesRoutes);
v1Router.use('/artifacts', artifactsRoutes);
v1Router.use('/findings', findingsRoutes);
v1Router.use('/recommendations', recommendationsRoutes);
v1Router.use('/search', searchRoutes);

export default v1Router;

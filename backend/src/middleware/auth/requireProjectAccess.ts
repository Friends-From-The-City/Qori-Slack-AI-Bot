/**
 * requireProjectAccess — Express middleware for project-level authorization.
 *
 * Extracts projectPublicId from route params, resolves project from DB,
 * verifies organization scope, checks ProjectMembership for the actor.
 *
 * This middleware must be mounted AFTER requireAuth (req.ctx must exist).
 *
 * On success: attaches resolved project to req.resolvedProject
 * On failure: returns 403 or 404
 */

import type { Request, Response, NextFunction } from 'express';
import type { Project } from '../../database/models/project';
import type { ProjectMembership } from '../../database/models/project_membership';
import sequelize from '../../database';
import { ApiErrorCode } from '../../types/api-errors';

const ProjectModel = sequelize.models.Project as typeof Project;
const ProjectMembershipModel = sequelize.models.ProjectMembership as typeof ProjectMembership;

// Extend Express Request to include resolved project
declare global {
  namespace Express {
    interface Request {
      resolvedProject?: {
        id: number;
        publicId: string;
        slug: string;
        name: string;
      };
    }
  }
}

/**
 * Create middleware that checks project access from a route parameter.
 *
 * Resolves by: UUID public_id → numeric ID → slug (backwards-compat).
 *
 * @param paramName - route param containing the project identifier (default: 'projectId')
 */
export function requireProjectAccess(paramName = 'projectId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = req.ctx;
    if (!ctx) {
      res.status(401).json({
        error: { code: ApiErrorCode.AUTHENTICATION_REQUIRED, message: 'Authentication required' },
      });
      return;
    }

    const identifier = req.params[paramName] as string;
    if (!identifier) {
      res.status(400).json({
        error: { code: ApiErrorCode.VALIDATION_ERROR, message: `Missing ${paramName} parameter` },
      });
      return;
    }

    try {
      // Resolve project — try UUID public_id, then numeric ID, then slug
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let where: Record<string, unknown>;
      if (uuidPattern.test(identifier)) {
        where = { public_id: identifier };
      } else {
        const numericId = Number(identifier);
        where = Number.isFinite(numericId) && numericId > 0
          ? { id: numericId }
          : { slug: identifier };
      }

      const project = await ProjectModel.findOne({
        where,
        attributes: ['id', 'public_id', 'slug', 'name', 'organization_id'],
      });

      if (!project) {
        res.status(404).json({
          error: { code: ApiErrorCode.RESOURCE_NOT_FOUND, message: 'Project not found' },
        });
        return;
      }

      // Verify organization scope
      if (project.organization_id !== ctx.organization.id) {
        // Return 404 instead of 403 to prevent information disclosure
        res.status(404).json({
          error: { code: ApiErrorCode.RESOURCE_NOT_FOUND, message: 'Project not found' },
        });
        return;
      }

      // Check actor-based project membership
      const membership = await ProjectMembershipModel.findOne({
        where: { project_id: project.id, actor_id: ctx.actor.id },
      });

      if (!membership) {
        res.status(403).json({
          error: { code: ApiErrorCode.AUTHORIZATION_DENIED, message: 'Not a project member' },
        });
        return;
      }

      // Attach resolved project
      req.resolvedProject = {
        id: project.id,
        publicId: project.public_id,
        slug: project.slug,
        name: project.name,
      };

      next();
    } catch (error) {
      console.error(
        `[AUTH] requireProjectAccess failed:`,
        error instanceof Error ? error.message : error,
      );
      res.status(500).json({
        error: { code: ApiErrorCode.INTERNAL_ERROR, message: 'Authorization check failed' },
      });
    }
  };
}

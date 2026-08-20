/**
 * Project Application Service — PLAT-3
 *
 * Organization-scoped project operations.
 * All queries are filtered by the actor's organization.
 */

import type { ApplicationContext } from '../types/application-context';
import type { ProjectResource, StudyResource, GovernanceResource } from '../types/api-responses';
import { listProjectsByOrg, getProjectByIdAndOrg, getProjectStudiesByOrg } from '../services/project.service';
import { isProjectMemberByActor } from '../services/authorization.service';
import { resourceNotFound, authorizationDenied } from '../types/api-errors';
import sequelize from '../database';

/**
 * List all projects the actor has access to within their organization.
 */
export async function listProjects(ctx: ApplicationContext): Promise<ProjectResource[]> {
  const projects = await listProjectsByOrg(ctx.organization.id);

  // Filter to projects the actor is a member of
  const accessible: ProjectResource[] = [];
  for (const p of projects) {
    const isMember = await isProjectMemberByActor(ctx.actor.id, p.id);
    if (isMember) {
      accessible.push(mapProjectResource(p, ctx.organization.publicId));
    }
  }

  return accessible;
}

/**
 * Get a single project by slug or public_id, verifying org scope and membership.
 */
export async function getProject(ctx: ApplicationContext, slugOrPublicId: string): Promise<ProjectResource> {
  const project = await getProjectBySlugOrId(slugOrPublicId, ctx.organization.id) as any;
  if (!project) throw resourceNotFound('Project');

  const isMember = await isProjectMemberByActor(ctx.actor.id, project.id);
  if (!isMember) throw authorizationDenied('Not a project member');

  return mapProjectResource(project, ctx.organization.publicId);
}

/**
 * Get studies for a project.
 */
export async function getProjectStudies(
  ctx: ApplicationContext,
  projectSlug: string,
): Promise<StudyResource[]> {
  const project = await getProjectBySlugOrId(projectSlug, ctx.organization.id) as any;
  if (!project) throw resourceNotFound('Project');

  const isMember = await isProjectMemberByActor(ctx.actor.id, project.id);
  if (!isMember) throw authorizationDenied('Not a project member');

  const studies = await getProjectStudiesByOrg(project.id, ctx.organization.id);
  return studies.map(s => mapStudyResource(s as any, projectSlug));
}

/**
 * Get governance summary for a project.
 */
export async function getProjectGovernance(
  ctx: ApplicationContext,
  projectSlug: string,
): Promise<GovernanceResource> {
  const project = await getProjectBySlugOrId(projectSlug, ctx.organization.id) as any;
  if (!project) throw resourceNotFound('Project');

  const isMember = await isProjectMemberByActor(ctx.actor.id, project.id);
  if (!isMember) throw authorizationDenied('Not a project member');

  // Count governance state
  const RecordsHoldModel = sequelize.models.RecordsHold;
  const RecordsAssignmentModel = sequelize.models.RecordsManagementAssignment;

  const [holdsCount, assignmentsCount] = await Promise.all([
    RecordsHoldModel
      ? RecordsHoldModel.count({ where: { project_id: project.id, status: 'active' } })
      : 0,
    RecordsAssignmentModel
      ? RecordsAssignmentModel.count({ where: { project_id: project.id } })
      : 0,
  ]);

  return {
    project_public_id: project.public_id || projectSlug,
    active_holds_count: holdsCount,
    pending_dispositions_count: 0, // Requires eligibility evaluation — deferred
    records_assignments_count: assignmentsCount,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

async function getProjectBySlugOrId(slugOrId: string, orgId: number) {
  const { Project: ProjectModel } = sequelize.models;
  const numericId = Number(slugOrId);
  if (Number.isFinite(numericId) && numericId > 0) {
    return getProjectByIdAndOrg(numericId, orgId);
  }
  // Try public_id (UUID) first, then fall back to slug
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(slugOrId)) {
    const byPublicId = await ProjectModel.findOne({ where: { public_id: slugOrId, organization_id: orgId } });
    if (byPublicId) return byPublicId;
  }
  return ProjectModel.findOne({ where: { slug: slugOrId, organization_id: orgId } });
}

function mapProjectResource(p: any, orgPublicId: string): ProjectResource {
  return {
    public_id: p.public_id || p.slug,
    slug: p.slug,
    name: p.name,
    description: p.description || null,
    status: p.status || 'active',
    organization_public_id: orgPublicId,
    team_public_id: null, // Team public_id resolution deferred
    created_at: p.created_at?.toISOString() || new Date().toISOString(),
  };
}

function mapStudyResource(s: any, projectSlug: string): StudyResource {
  return {
    public_id: s.public_id || String(s.id),
    name: s.name,
    status: s.status || 'active',
    project_public_id: projectSlug,
    created_at: s.created_at?.toISOString() || new Date().toISOString(),
  };
}

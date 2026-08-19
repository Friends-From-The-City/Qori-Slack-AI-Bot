/**
 * Me Application Service — PLAT-3
 *
 * Returns current actor profile and memberships.
 */

import type { ApplicationContext } from '../types/application-context';
import type { MeResource } from '../types/api-responses';
import type { ProjectMembership } from '../database/models/project_membership';
import type { Project } from '../database/models/project';
import sequelize from '../database';

const ProjectMembershipModel = sequelize.models.ProjectMembership as typeof ProjectMembership;
const ProjectModel = sequelize.models.Project as typeof Project;

export async function getCurrentActor(ctx: ApplicationContext): Promise<MeResource> {
  // Get actor's project memberships within their organization
  const memberships = await ProjectMembershipModel.findAll({
    where: { actor_id: ctx.actor.id },
  });

  const projectIds = memberships.map(m => m.project_id);
  const projects = projectIds.length > 0
    ? await ProjectModel.findAll({
        where: { id: projectIds, organization_id: ctx.organization.id },
        attributes: ['id', 'slug', 'name'],
      })
    : [];

  const projectMap = new Map(projects.map(p => [p.id, p]));

  return {
    actor: {
      public_id: ctx.actor.publicId,
      display_name: ctx.actor.displayName,
      organization_public_id: ctx.organization.publicId,
    },
    organization: {
      public_id: ctx.organization.publicId,
      slug: ctx.organization.slug,
      name: ctx.organization.name,
    },
    authentication_provider: ctx.authenticationProvider,
    memberships: memberships
      .filter(m => projectMap.has(m.project_id))
      .map(m => {
        const project = projectMap.get(m.project_id)!;
        return {
          project_public_id: project.slug,
          project_name: project.name,
          role: m.role,
        };
      }),
  };
}

/**
 * Admin Application Service — WS-0
 *
 * Organization-scoped administration operations.
 * All operations:
 * - Resolve canonical actor from ApplicationContext
 * - Require owner/admin authorization
 * - Remain within actor's organization
 * - Fail closed cross-org
 */

import type { ApplicationContext } from '../types/application-context';
import { authorizationDenied, resourceNotFound, validationError } from '../types/api-errors';
import sequelize from '../database';
import type { Organization } from '../database/models/organization';
import type { Team } from '../database/models/team';
import type { Actor } from '../database/models/actor';
import type { OrganizationMembership } from '../database/models/organization_membership';
import type { ProjectMembership } from '../database/models/project_membership';
import type { Project } from '../database/models/project';
import type { IntegrationCredential } from '../database/models/integration_credential';
import type { AdapterWorkspaceBinding } from '../database/models/adapter_workspace_binding';
import type { RepositoryBinding } from '../database/models/repository_binding';
import type { IdentityProviderBinding } from '../database/models/identity_provider_binding';

const OrganizationModel = sequelize.models.Organization as typeof Organization;
const TeamModel = sequelize.models.Team as typeof Team;
const ActorModel = sequelize.models.Actor as typeof Actor;
const ProjectMembershipModel = sequelize.models.ProjectMembership as typeof ProjectMembership;
const ProjectModel = sequelize.models.Project as typeof Project;

// ─── Organization-Level Authorization ──────────────────────────────

/**
 * Resolve the actor's organization membership.
 * Returns null if no membership exists (fail-closed).
 */
async function getOrgMembership(ctx: ApplicationContext): Promise<OrganizationMembership | null> {
  const OrgMembershipModel = sequelize.models.OrganizationMembership as typeof OrganizationMembership | undefined;
  if (!OrgMembershipModel) return null;

  return OrgMembershipModel.findOne({
    where: {
      organization_id: ctx.organization.id,
      actor_id: ctx.actor.id,
    },
  });
}

/**
 * Assert the actor has org-level owner or admin role.
 *
 * SECURITY CONTRACT:
 * - Authorization comes from organization_memberships, NOT project_memberships
 * - A project owner without org admin role is DENIED
 * - Session/token metadata cannot override this check
 * - Fails closed on missing model or membership
 */
async function assertOrgAdmin(ctx: ApplicationContext): Promise<void> {
  const membership = await getOrgMembership(ctx);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw authorizationDenied('Organization admin access required');
  }
}

/**
 * Assert the actor has org-level owner role specifically.
 * Used for destructive/sensitive operations.
 */
async function assertOrgOwner(ctx: ApplicationContext): Promise<void> {
  const membership = await getOrgMembership(ctx);
  if (!membership || membership.role !== 'owner') {
    throw authorizationDenied('Organization owner access required');
  }
}

// ─── Organization Profile ──────────────────────────────────────────

export async function getOrganization(ctx: ApplicationContext) {
  const org = await OrganizationModel.findByPk(ctx.organization.id);
  if (!org) throw resourceNotFound('Organization');
  return {
    public_id: org.public_id,
    slug: org.slug,
    name: org.name,
    status: org.status,
  };
}

export async function updateOrganization(ctx: ApplicationContext, body: { name?: string; slug?: string }) {
  await assertOrgAdmin(ctx);
  const org = await OrganizationModel.findByPk(ctx.organization.id);
  if (!org) throw resourceNotFound('Organization');

  if (body.name) org.name = body.name;
  if (body.slug) {
    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(body.slug)) {
      throw validationError('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    org.slug = body.slug;
  }
  await org.save();

  return {
    public_id: org.public_id,
    slug: org.slug,
    name: org.name,
    status: org.status,
  };
}

// ─── Teams ─────────────────────────────────────────────────────────

export async function listTeams(ctx: ApplicationContext) {
  const teams = await TeamModel.findAll({
    where: { organization_id: ctx.organization.id },
    order: [['name', 'ASC']],
  });
  return teams.map(t => ({
    public_id: t.public_id,
    slug: t.slug,
    name: t.name,
    status: t.status,
  }));
}

export async function createTeam(ctx: ApplicationContext, body: { name: string; slug: string }) {
  await assertOrgAdmin(ctx);
  if (!body.name || !body.slug) {
    throw validationError('name and slug are required');
  }
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    throw validationError('Slug must contain only lowercase letters, numbers, and hyphens');
  }

  const team = await TeamModel.create({
    organization_id: ctx.organization.id,
    name: body.name,
    slug: body.slug,
    status: 'active',
  });

  return {
    public_id: team.public_id,
    slug: team.slug,
    name: team.name,
    status: team.status,
  };
}

export async function updateTeam(ctx: ApplicationContext, teamPublicId: string, body: { name?: string; slug?: string; status?: string }) {
  await assertOrgAdmin(ctx);
  const team = await TeamModel.findOne({
    where: { public_id: teamPublicId, organization_id: ctx.organization.id },
  });
  if (!team) throw resourceNotFound('Team');

  if (body.name) team.name = body.name;
  if (body.slug) {
    if (!/^[a-z0-9-]+$/.test(body.slug)) {
      throw validationError('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    team.slug = body.slug;
  }
  if (body.status && ['active', 'inactive'].includes(body.status)) {
    (team as any).status = body.status;
  }
  await team.save();

  return {
    public_id: team.public_id,
    slug: team.slug,
    name: team.name,
    status: team.status,
  };
}

// ─── Actors ────────────────────────────────────────────────────────

export async function listActors(ctx: ApplicationContext) {
  const actors = await ActorModel.findAll({
    where: { organization_id: ctx.organization.id },
    order: [['display_name', 'ASC']],
  });
  return actors.map(a => ({
    public_id: a.public_id,
    display_name: a.display_name,
    status: a.status,
  }));
}

export async function getActor(ctx: ApplicationContext, actorPublicId: string) {
  const actor = await ActorModel.findOne({
    where: { public_id: actorPublicId, organization_id: ctx.organization.id },
  });
  if (!actor) throw resourceNotFound('Actor');

  // Get memberships
  const memberships = await ProjectMembershipModel.findAll({
    where: { actor_id: actor.id },
    include: [{
      model: ProjectModel,
      as: 'project',
      where: { organization_id: ctx.organization.id },
      attributes: ['public_id', 'slug', 'name'],
    }],
  });

  return {
    public_id: actor.public_id,
    display_name: actor.display_name,
    status: actor.status,
    memberships: memberships.map(m => ({
      project_public_id: (m as any).project?.public_id || (m as any).project?.slug,
      project_name: (m as any).project?.name,
      role: m.role,
    })),
  };
}

// ─── Project Memberships ───────────────────────────────────────────

export async function listProjectMemberships(ctx: ApplicationContext, projectPublicId: string) {
  await assertOrgAdmin(ctx);
  const project = await resolveProjectByPublicId(projectPublicId, ctx.organization.id);

  const memberships = await ProjectMembershipModel.findAll({
    where: { project_id: project.id },
    include: [{
      model: ActorModel,
      as: 'actor',
      attributes: ['public_id', 'display_name', 'status'],
    }],
  });

  return memberships.map(m => ({
    actor_public_id: (m as any).actor?.public_id,
    actor_display_name: (m as any).actor?.display_name,
    role: m.role,
  }));
}

export async function addProjectMembership(
  ctx: ApplicationContext,
  projectPublicId: string,
  body: { actor_public_id: string; role?: string },
) {
  await assertOrgAdmin(ctx);
  if (!body.actor_public_id) throw validationError('actor_public_id is required');

  const project = await resolveProjectByPublicId(projectPublicId, ctx.organization.id);
  const actor = await ActorModel.findOne({
    where: { public_id: body.actor_public_id, organization_id: ctx.organization.id },
  });
  if (!actor) throw resourceNotFound('Actor');

  const role = body.role || 'researcher';
  if (!['owner', 'admin', 'researcher'].includes(role)) {
    throw validationError('role must be owner, admin, or researcher');
  }

  const [membership, created] = await ProjectMembershipModel.findOrCreate({
    where: { project_id: project.id, actor_id: actor.id },
    defaults: { project_id: project.id, actor_id: actor.id, role } as any,
  });

  if (!created && membership.role !== role) {
    membership.role = role as any;
    await membership.save();
  }

  return {
    actor_public_id: actor.public_id,
    project_public_id: project.public_id || project.slug,
    role: membership.role,
    created,
  };
}

export async function removeProjectMembership(
  ctx: ApplicationContext,
  projectPublicId: string,
  actorPublicId: string,
) {
  await assertOrgAdmin(ctx);
  const project = await resolveProjectByPublicId(projectPublicId, ctx.organization.id);
  const actor = await ActorModel.findOne({
    where: { public_id: actorPublicId, organization_id: ctx.organization.id },
  });
  if (!actor) throw resourceNotFound('Actor');

  await ProjectMembershipModel.destroy({
    where: { project_id: project.id, actor_id: actor.id },
  });
}

// ─── Integrations ──────────────────────────────────────────────────

export async function listIntegrations(ctx: ApplicationContext) {
  const IntegrationCredentialModel = sequelize.models.IntegrationCredential as typeof IntegrationCredential | undefined;
  const AdapterWorkspaceBindingModel = sequelize.models.AdapterWorkspaceBinding as typeof AdapterWorkspaceBinding | undefined;
  const RepositoryBindingModel = sequelize.models.RepositoryBinding as typeof RepositoryBinding | undefined;
  const IdpBindingModel = sequelize.models.IdentityProviderBinding as typeof IdentityProviderBinding | undefined;

  const [credentials, workspaceBindings, repoBindings, idpBindings] = await Promise.all([
    IntegrationCredentialModel
      ? IntegrationCredentialModel.findAll({ where: { organization_id: ctx.organization.id } })
      : [],
    AdapterWorkspaceBindingModel
      ? AdapterWorkspaceBindingModel.findAll({ where: { organization_id: ctx.organization.id } })
      : [],
    RepositoryBindingModel
      ? RepositoryBindingModel.findAll({ where: { organization_id: ctx.organization.id } })
      : [],
    IdpBindingModel
      ? IdpBindingModel.findAll({ where: { organization_id: ctx.organization.id } })
      : [],
  ]);

  return {
    credentials: (credentials as any[]).map(c => ({
      provider: c.provider,
      status: c.status,
      has_credential: !!c.credential_ref,
    })),
    workspace_bindings: (workspaceBindings as any[]).map(w => ({
      provider: w.provider,
      workspace_external_id: w.workspace_external_id,
      status: w.status,
    })),
    repository_bindings: (repoBindings as any[]).map(r => ({
      provider: r.provider,
      owner: r.owner,
      repository: r.repository,
      status: r.status,
    })),
    identity_providers: (idpBindings as any[]).map(i => ({
      provider: i.provider,
      issuer_url: i.issuer_url,
      status: i.status,
    })),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

async function resolveProjectByPublicId(publicIdOrSlug: string, orgId: number): Promise<Project> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const where: Record<string, unknown> = uuidPattern.test(publicIdOrSlug)
    ? { public_id: publicIdOrSlug, organization_id: orgId }
    : { slug: publicIdOrSlug, organization_id: orgId };

  const project = await ProjectModel.findOne({ where });
  if (!project) throw resourceNotFound('Project');
  return project;
}

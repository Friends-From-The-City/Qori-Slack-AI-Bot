// services/project.service.ts — Project CRUD and channel binding

import type { Project, ProjectStatus } from '../database/models/project';
import type { ResearchStudy } from '../database/models/research_study';
import type { CreationAttributes } from 'sequelize';

import sequelize from '../database';

// Typed model references — cast once, use everywhere.
const ProjectModel = sequelize.models.Project as typeof Project;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

interface CreateProjectInput {
  name: string;
  slug: string;
  description?: string | null;
  problem_statement?: string | null;
  status?: ProjectStatus;
  created_by: string;
  channel_id?: string | null;
  team_slug?: string | null;
}

interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  problem_statement?: string | null;
  status?: ProjectStatus;
  channel_id?: string | null;
  team_slug?: string | null;
}

/**
 * Create a new project.
 */
export async function createProject(data: CreateProjectInput): Promise<Project> {
  return ProjectModel.create(data as CreationAttributes<Project>);
}

/**
 * Find a project by ID.
 */
export async function getProjectById(id: number): Promise<Project | null> {
  return ProjectModel.findByPk(id);
}

/**
 * Find a project by slug.
 */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  return ProjectModel.findOne({ where: { slug } });
}

/**
 * Find a project by its bound channel ID.
 */
export async function getProjectByChannelId(channelId: string): Promise<Project | null> {
  return ProjectModel.findOne({ where: { channel_id: channelId } });
}

/**
 * Update a project.
 */
export async function updateProject(id: number, data: UpdateProjectInput): Promise<Project | null> {
  const project = await ProjectModel.findByPk(id);
  if (!project) return null;
  await project.update(data);
  return project;
}

/**
 * Delete a project. Cascade deletes studies and variables.
 *
 * @deprecated Use Admin Center deletion flow (adminActionsHandler → handleDeleteStudyConfirm)
 * which enforces assertProjectOwner and writes audit logs. This method bypasses authorization
 * and audit logging. Zero handler call sites. Scheduled for removal or access restriction in GOV-2.
 */
export async function deleteProject(id: number): Promise<boolean> {
  const project = await ProjectModel.findByPk(id);
  if (!project) return false;
  await project.destroy();
  return true;
}

/**
 * List all projects, optionally filtered by status.
 */
export async function listProjects(options: { status?: ProjectStatus } = {}): Promise<Project[]> {
  const where: Record<string, unknown> = {};
  if (options.status) where.status = options.status;
  return ProjectModel.findAll({
    where,
    order: [['created_at', 'DESC']],
  });
}

/**
 * List projects created by a specific user.
 */
export async function getProjectsByUser(userId: string): Promise<Project[]> {
  return ProjectModel.findAll({
    where: { created_by: userId },
    order: [['created_at', 'DESC']],
  });
}

/**
 * Bind a project to a Slack channel (bidirectional).
 * Updates both projects.channel_id AND channel_config.project_id.
 * Unbinds any existing project from that channel first.
 */
export async function bindProjectToChannel(projectId: number, channelId: string): Promise<Project | null> {
  const ChannelConfigModel = sequelize.models.ChannelConfig;
  const t = await sequelize.transaction();
  try {
    // Unbind any existing project from this channel (projects side)
    await ProjectModel.update(
      { channel_id: null },
      { where: { channel_id: channelId }, transaction: t }
    );

    // Unbind any existing project from this channel (channel_config side)
    await ChannelConfigModel.update(
      { project_id: null },
      { where: { channel_id: channelId }, transaction: t }
    );

    // Bind the new project (projects side)
    const project = await ProjectModel.findByPk(projectId, { transaction: t });
    if (!project) {
      await t.rollback();
      return null;
    }
    await project.update({ channel_id: channelId }, { transaction: t });

    // Bind the new project (channel_config side) — upsert
    const [config] = await ChannelConfigModel.findOrCreate({
      where: { channel_id: channelId },
      defaults: { channel_id: channelId, project_id: projectId },
      transaction: t,
    });
    if (config.get('project_id') !== projectId) {
      await config.update({ project_id: projectId }, { transaction: t });
    }

    await t.commit();
    return project;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Unbind a project from its channel.
 */
export async function unbindProjectFromChannel(projectId: number): Promise<Project | null> {
  const project = await ProjectModel.findByPk(projectId);
  if (!project) return null;
  await project.update({ channel_id: null });
  return project;
}

/**
 * Get all studies belonging to a project.
 */
export async function getProjectStudies(projectId: number): Promise<ResearchStudy[]> {
  return ResearchStudyModel.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
  });
}

/**
 * Find or create a project by slug. Useful for migration scenarios.
 */
export async function findOrCreateProject(
  slug: string,
  defaults: Omit<CreateProjectInput, 'slug'>
): Promise<[Project, boolean]> {
  const [project, created] = await ProjectModel.findOrCreate({
    where: { slug },
    defaults: { ...defaults, slug } as CreationAttributes<Project>,
  });
  return [project, created];
}

/**
 * Generate a URL-safe slug from a project name.
 * "My Project Name" → "my-project-name"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
}

// ─── Organization-Scoped Queries (PLAT-3) ──────────────────────────

/**
 * List projects scoped to an organization.
 * PLAT-3: All API queries must be org-scoped.
 */
export async function listProjectsByOrg(
  organizationId: number,
  options: { status?: ProjectStatus } = {},
): Promise<Project[]> {
  const where: Record<string, unknown> = { organization_id: organizationId };
  if (options.status) where.status = options.status;
  return ProjectModel.findAll({
    where,
    order: [['created_at', 'DESC']],
  });
}

/**
 * Get a project by slug, scoped to organization.
 * Returns null if project doesn't exist or belongs to different org.
 */
export async function getProjectBySlugAndOrg(
  slug: string,
  organizationId: number,
): Promise<Project | null> {
  return ProjectModel.findOne({
    where: { slug, organization_id: organizationId },
  });
}

/**
 * Get a project by ID, verifying organization scope.
 * Returns null if project doesn't belong to the specified org.
 */
export async function getProjectByIdAndOrg(
  id: number,
  organizationId: number,
): Promise<Project | null> {
  return ProjectModel.findOne({
    where: { id, organization_id: organizationId },
  });
}

/**
 * Get studies for a project, verifying the project belongs to the org.
 * Returns empty array if project doesn't belong to org.
 */
export async function getProjectStudiesByOrg(
  projectId: number,
  organizationId: number,
): Promise<ResearchStudy[]> {
  // Verify project belongs to org
  const project = await ProjectModel.findOne({
    where: { id: projectId, organization_id: organizationId },
    attributes: ['id'],
  });
  if (!project) return [];

  return ResearchStudyModel.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
  });
}

/**
 * Check if a slug is available (not already used by another project).
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const existing = await ProjectModel.findOne({ where: { slug } });
  return existing === null;
}

/**
 * Create a project from a name, auto-generating the slug.
 * Throws if the generated slug is already taken.
 */
export async function createProjectFromName(
  name: string,
  data: Omit<CreateProjectInput, 'name' | 'slug'>
): Promise<Project> {
  const slug = generateSlug(name);
  if (!slug) {
    throw new Error('Project name must contain at least one alphanumeric character');
  }
  const available = await isSlugAvailable(slug);
  if (!available) {
    throw new Error(`A project with slug "${slug}" already exists. Choose a different name.`);
  }
  return createProject({ ...data, name, slug });
}

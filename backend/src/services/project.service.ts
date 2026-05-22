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
  status?: ProjectStatus;
  created_by: string;
  channel_id?: string | null;
  team_slug?: string | null;
}

interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
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
 * Bind a project to a Slack channel. Unbinds any existing project from that channel first.
 */
export async function bindProjectToChannel(projectId: number, channelId: string): Promise<Project | null> {
  const t = await sequelize.transaction();
  try {
    // Unbind any existing project from this channel
    await ProjectModel.update(
      { channel_id: null },
      { where: { channel_id: channelId }, transaction: t }
    );

    // Bind the new project
    const project = await ProjectModel.findByPk(projectId, { transaction: t });
    if (!project) {
      await t.rollback();
      return null;
    }

    await project.update({ channel_id: channelId }, { transaction: t });
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

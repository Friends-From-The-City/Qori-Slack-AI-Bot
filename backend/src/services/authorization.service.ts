/**
 * Authorization Service
 *
 * Per ADR 0024: Project-Level Authorization Model
 *
 * SECURITY CONTRACT:
 * - All functions FAIL CLOSED — errors result in DENY, never bypass
 * - Slack API failures → DENY
 * - Database errors → DENY
 * - A transient error must never become an authorization bypass
 */

import type { ProjectMember, MembershipSource } from '../database/models/project_member';
import type { Project } from '../database/models/project';
import type { ResearchStudy } from '../database/models/research_study';
import sequelize from '../database';
import { WebClient } from '@slack/web-api';

// Typed model references
const ProjectMemberModel = sequelize.models.ProjectMember as typeof ProjectMember;
const ProjectModel = sequelize.models.Project as typeof Project;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

/**
 * Custom error for authorization failures.
 * Distinguishes auth errors from other application errors.
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// ─── Core Membership Check ───────────────────────────────────────────

/**
 * Check if user is a member of the project.
 *
 * SECURITY CONTRACT:
 * - Returns true ONLY if membership is positively confirmed
 * - Returns false on ANY error (fail-closed)
 * - Slack API failures → DENY, never bypass
 *
 * @param userId - Slack user ID
 * @param projectId - Project database ID
 * @param slackClient - Optional Slack client for channel membership fallback
 */
export async function isProjectMember(
  userId: string,
  projectId: number,
  slackClient?: WebClient,
): Promise<boolean> {
  try {
    // 1. Fast path: check project_members table (cache hit)
    const membership = await ProjectMemberModel.findOne({
      where: { project_id: projectId, user_id: userId },
    });
    if (membership) return true;

    // 2. Slow path: check Slack channel membership (cache miss)
    // Only if project has a channel AND we have a Slack client
    const project = await ProjectModel.findByPk(projectId);
    if (!project?.channel_id || !slackClient) {
      // No channel = table-only membership; no client = can't check channel
      return false;
    }

    // CRITICAL: Fail-closed on Slack API error
    let isChannelMember: boolean;
    try {
      isChannelMember = await checkSlackChannelMembership(
        slackClient,
        userId,
        project.channel_id,
      );
    } catch (error) {
      // Slack API failure (rate limit, timeout, outage, token issue)
      // DENY access — never fail open
      console.error(
        `[AUTH] Slack channel membership check failed for user=${userId} project=${projectId}, DENYING:`,
        error instanceof Error ? error.message : error,
      );
      return false;
    }

    if (!isChannelMember) return false;

    // 3. Auto-insert for future fast checks
    // Insert failure is non-fatal — membership was still confirmed
    try {
      await ProjectMemberModel.create({
        project_id: projectId,
        user_id: userId,
        role: 'member',
        source: 'channel' as MembershipSource,
      });
      console.log(`[AUTH] Auto-added user=${userId} to project=${projectId} via channel membership`);
    } catch (insertError) {
      // Non-fatal — next call will re-check Slack (acceptable)
      // Could be duplicate key if concurrent requests
      console.warn(
        `[AUTH] Failed to cache channel membership for user=${userId} project=${projectId}:`,
        insertError instanceof Error ? insertError.message : insertError,
      );
    }

    return true;
  } catch (error) {
    // Database error or unexpected failure — fail closed
    console.error(
      `[AUTH] isProjectMember failed for user=${userId} project=${projectId}, DENYING:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Check if user is in a Slack channel.
 *
 * THROWS on API error — caller must catch and handle.
 */
async function checkSlackChannelMembership(
  client: WebClient,
  userId: string,
  channelId: string,
): Promise<boolean> {
  // Use conversations.members with pagination
  // For most project channels, member list fits in one page
  let cursor: string | undefined;
  do {
    const response = await client.conversations.members({
      channel: channelId,
      limit: 200,
      cursor,
    });

    if (response.members?.includes(userId)) {
      return true;
    }

    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  return false;
}

// ─── Assertion Helpers ───────────────────────────────────────────────

/**
 * Assert that user has access to a study.
 * Throws AuthorizationError if not.
 *
 * Access is granted if user is a member of the study's project.
 *
 * @param userId - Slack user ID
 * @param studyId - Study database ID
 * @param slackClient - Optional Slack client for channel membership fallback
 */
export async function assertStudyAccess(
  userId: string,
  studyId: number,
  slackClient?: WebClient,
): Promise<void> {
  try {
    const study = await ResearchStudyModel.findByPk(studyId, {
      attributes: ['id', 'project_id', 'created_by'],
    });

    if (!study) {
      throw new AuthorizationError('Study not found');
    }

    if (!study.project_id) {
      // Orphan study without project — only creator can access
      if (study.created_by === userId) return;
      throw new AuthorizationError('Access denied: study has no project');
    }

    const hasAccess = await isProjectMember(userId, study.project_id, slackClient);
    if (!hasAccess) {
      throw new AuthorizationError('Access denied: not a project member');
    }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    // Unexpected error — fail closed
    console.error(
      `[AUTH] assertStudyAccess failed for user=${userId} study=${studyId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

/**
 * Assert that user has access to a project.
 * Throws AuthorizationError if not.
 *
 * @param userId - Slack user ID
 * @param projectId - Project database ID
 * @param slackClient - Optional Slack client for channel membership fallback
 */
export async function assertProjectAccess(
  userId: string,
  projectId: number,
  slackClient?: WebClient,
): Promise<void> {
  try {
    const hasAccess = await isProjectMember(userId, projectId, slackClient);
    if (!hasAccess) {
      throw new AuthorizationError('Access denied: not a project member');
    }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    // Unexpected error — fail closed
    console.error(
      `[AUTH] assertProjectAccess failed for user=${userId} project=${projectId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

/**
 * Assert that user can delete a study.
 * Only the study creator can delete it.
 *
 * @param userId - Slack user ID
 * @param studyId - Study database ID
 */
export async function assertStudyDeleteAccess(
  userId: string,
  studyId: number,
): Promise<void> {
  try {
    const study = await ResearchStudyModel.findByPk(studyId, {
      attributes: ['id', 'created_by'],
    });

    if (!study) {
      throw new AuthorizationError('Study not found');
    }

    if (study.created_by !== userId) {
      throw new AuthorizationError('Access denied: only the study creator can delete it');
    }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    console.error(
      `[AUTH] assertStudyDeleteAccess failed for user=${userId} study=${studyId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

/**
 * Assert that user can delete a project.
 * Only the project creator (owner) can delete it.
 *
 * @param userId - Slack user ID
 * @param projectId - Project database ID
 * @deprecated Use assertProjectOwner instead (ADR 0025)
 */
export async function assertProjectDeleteAccess(
  userId: string,
  projectId: number,
): Promise<void> {
  try {
    const project = await ProjectModel.findByPk(projectId, {
      attributes: ['id', 'created_by'],
    });

    if (!project) {
      throw new AuthorizationError('Project not found');
    }

    if (project.created_by !== userId) {
      throw new AuthorizationError('Access denied: only the project creator can delete it');
    }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    console.error(
      `[AUTH] assertProjectDeleteAccess failed for user=${userId} project=${projectId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

// ─── Owner Checks (ADR 0025: Records Authority) ──────────────────────

/**
 * Check if user is a project owner (records authority).
 * Returns false on any error (fail-closed, non-throwing).
 *
 * Per ADR 0025: Project owners are the records authority for destructive
 * operations (DSAR delete, study delete, project delete).
 *
 * @param userId - Slack user ID
 * @param projectId - Project database ID
 */
export async function isProjectOwner(
  userId: string,
  projectId: number,
): Promise<boolean> {
  try {
    const membership = await ProjectMemberModel.findOne({
      where: { project_id: projectId, user_id: userId, role: 'owner' },
    });
    return !!membership;
  } catch (error) {
    // Database error — fail closed
    console.error(
      `[AUTH] isProjectOwner check failed for user=${userId} project=${projectId}, returning false:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Assert user is a project owner (records authority).
 * Throws AuthorizationError if not.
 *
 * Per ADR 0025: Only project owners can perform destructive operations
 * (DSAR delete, study delete, project delete).
 *
 * FAIL-CLOSED: Database errors → DENY, throw AuthorizationError
 *
 * @param userId - Slack user ID
 * @param projectId - Project database ID
 */
export async function assertProjectOwner(
  userId: string,
  projectId: number,
): Promise<void> {
  try {
    const membership = await ProjectMemberModel.findOne({
      where: { project_id: projectId, user_id: userId, role: 'owner' },
    });

    if (!membership) {
      throw new AuthorizationError(
        'Access denied: only project owners can perform this action'
      );
    }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    // Database error — fail closed
    console.error(
      `[AUTH] assertProjectOwner failed for user=${userId} project=${projectId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

/**
 * Assert user is an owner of the project containing this study.
 * Throws AuthorizationError if not.
 *
 * Per ADR 0025: Study deletion requires ownership of the study's project,
 * not just study creation.
 *
 * FAIL-CLOSED: Database errors → DENY, throw AuthorizationError
 *
 * @param userId - Slack user ID
 * @param studyId - Study database ID
 */
export async function assertStudyOwner(
  userId: string,
  studyId: number,
): Promise<void> {
  try {
    const study = await ResearchStudyModel.findByPk(studyId, {
      attributes: ['id', 'project_id'],
    });

    if (!study) {
      throw new AuthorizationError('Study not found');
    }

    if (!study.project_id) {
      throw new AuthorizationError('Study has no project — cannot verify ownership');
    }

    await assertProjectOwner(userId, study.project_id);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    console.error(
      `[AUTH] assertStudyOwner failed for user=${userId} study=${studyId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

// ─── Utility Functions ───────────────────────────────────────────────

/**
 * Add a user to a project.
 * Used when auto-adding via channel membership or explicit add.
 *
 * @param projectId - Project database ID
 * @param userId - Slack user ID
 * @param source - How the membership was granted
 * @param role - Member role (default: 'member')
 */
export async function addProjectMember(
  projectId: number,
  userId: string,
  source: MembershipSource,
  role: 'owner' | 'member' = 'member',
): Promise<ProjectMember> {
  const [member] = await ProjectMemberModel.findOrCreate({
    where: { project_id: projectId, user_id: userId },
    defaults: { project_id: projectId, user_id: userId, role, source },
  });
  return member;
}

/**
 * Remove a user from a project.
 *
 * @param projectId - Project database ID
 * @param userId - Slack user ID
 */
export async function removeProjectMember(
  projectId: number,
  userId: string,
): Promise<boolean> {
  const deleted = await ProjectMemberModel.destroy({
    where: { project_id: projectId, user_id: userId },
  });
  return deleted > 0;
}

/**
 * Get all members of a project.
 *
 * @param projectId - Project database ID
 */
export async function getProjectMembers(projectId: number): Promise<ProjectMember[]> {
  return ProjectMemberModel.findAll({
    where: { project_id: projectId },
    order: [['added_at', 'ASC']],
  });
}

/**
 * Get all projects a user is a member of.
 *
 * @param userId - Slack user ID
 */
export async function getProjectsForMember(userId: string): Promise<Project[]> {
  const memberships = await ProjectMemberModel.findAll({
    where: { user_id: userId },
    attributes: ['project_id'],
  });

  if (memberships.length === 0) return [];

  const projectIds = memberships.map(m => m.project_id);
  return ProjectModel.findAll({
    where: { id: projectIds },
    order: [['created_at', 'DESC']],
  });
}

import type { ResearchStudy } from '../database/models/research_study';
import type { ResearchStudyUserRole } from '../database/models/research_study_user_role';
import type { Project } from '../database/models/project';
import type { CreationAttributes } from 'sequelize';

import sequelize from '../database';

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const UserRoleModel = sequelize.models.ResearchStudyUserRole as typeof ResearchStudyUserRole;
const ProjectModel = sequelize.models.Project as typeof Project;

interface RoleAssignment {
  user: string;
  role: string;
}

interface StudyInput {
  name: string;
  project_id: number;
  slug?: string | null;
  assignments?: RoleAssignment[];
  [key: string]: unknown;
}

interface DeleteResult {
  success: boolean;
  studyName: string;
  studyPath: string | null;
}

/** Computed counts injected onto study instances but not stored in the model schema. */
interface StudyComputedCounts {
  total_sessions: number;
  total_transcripts: number;
  total_summaries: number;
}

const addResearchStudyWithRoles = async (data: StudyInput): Promise<ResearchStudy> => {
  const { assignments = [], project_id, ...studyData } = data;

  if (!project_id) {
    throw new Error('project_id is required to create or update a study');
  }

  // we want atomicity across study + roles:
  const t = await sequelize.transaction();
  try {
    // 1) upsert the study — uniqueness is now (project_id, name)
    // Intentional attribute selection — see ADR L001
    let study = await ResearchStudyModel.findOne({
      where: { project_id, name: studyData.name },
      attributes: ['id', 'project_id', 'name', 'slug', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at'],
      transaction: t,
    });

    if (study) {
      await study.update(studyData, { transaction: t });
      console.log('🔄 updated study', study.id);
    } else {
      study = await ResearchStudyModel.create(
        { ...studyData, project_id } as CreationAttributes<ResearchStudy>,
        { transaction: t }
      );
      console.log('✨ created study', study.id);
    }

    // 2) clear out old roles
    await UserRoleModel.destroy({
      where: { research_id: study.id },
      transaction: t,
    });

    // 3) bulk create assignments
    if (assignments.length) {
      const rows = assignments.map(({ user, role }) => ({
        research_id: study!.id,
        user_id: user,
        role,
        // created_at will default
      }));

      await UserRoleModel.bulkCreate(rows, { transaction: t });
      console.log(`📌 created ${rows.length} user-roles for study ${study.id}`);
    }

    // 4) commit
    await t.commit();
    return study;

  } catch (err) {
    await t.rollback();
    console.error('addResearchStudyWithRoles failed:', err);
    throw new Error('Failed to add or update research study + roles');
  }
};

/**
 * Get a study by ID with user roles.
 */
const getStudyById = async (studyId: number): Promise<ResearchStudy | null> => {
  const study = await ResearchStudyModel.findOne({
    where: { id: studyId },
    attributes: ['id', 'project_id', 'name', 'slug', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at', 'link', 'parsed_budget_amount', 'target_participants', 'session_timezone', 'brief_status', 'brief_change_feedback', 'brief_reviewer_id'],
    include: [
      { model: UserRoleModel, as: 'userRoles', attributes: ['user_id', 'role', 'created_at'] },
      { model: ProjectModel, as: 'project', attributes: ['id', 'name', 'slug'] },
    ],
  });

  if (study) {
    // R3: total_participants removed — compute via study.countParticipants() if needed
    const withCounts = study as ResearchStudy & StudyComputedCounts;
    withCounts.total_sessions = 0;
    withCounts.total_transcripts = 0;
    withCounts.total_summaries = 0;
  }

  return study;
};

/**
 * Get a study by project_id and study name.
 */
const getStudyByProjectAndName = async (projectId: number, name: string): Promise<ResearchStudy | null> => {
  const study = await ResearchStudyModel.findOne({
    where: { project_id: projectId, name },
    attributes: ['id', 'project_id', 'name', 'slug', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at', 'link', 'parsed_budget_amount', 'target_participants', 'session_timezone', 'brief_status', 'brief_change_feedback', 'brief_reviewer_id'],
    include: [
      { model: UserRoleModel, as: 'userRoles', attributes: ['user_id', 'role', 'created_at'] },
      { model: ProjectModel, as: 'project', attributes: ['id', 'name', 'slug'] },
    ],
  });

  if (study) {
    // R3: total_participants removed — compute via study.countParticipants() if needed
    const withCounts = study as ResearchStudy & StudyComputedCounts;
    withCounts.total_sessions = 0;
    withCounts.total_transcripts = 0;
    withCounts.total_summaries = 0;
  }

  return study;
};

/**
 * @deprecated REMOVED in Phase 2B. Use getStudyByProjectAndName or getStudyById instead.
 * @throws Always throws — name-only lookups are no longer supported.
 */
const getResearchStudyWithRoles = async (_name: string): Promise<ResearchStudy | null> => {
  throw new Error(
    'getResearchStudyWithRoles(name) removed in Phase 2B. ' +
    'Use getStudyByProjectAndName(projectId, name) or getStudyById(studyId) instead.'
  );
};

const getStudiesByUser = async (userId: string): Promise<ResearchStudy[]> => {
  // Find all studies created by the user
  // Intentional attribute selection — see ADR L001
  const studies = await ResearchStudyModel.findAll({
    where: { created_by: userId },
    attributes: ['id', 'name', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at'],
    order: [['created_at', 'DESC']], // Most recent first
  });

  return studies;
};

const deleteResearchStudy = async (studyId: number, userId: string): Promise<DeleteResult> => {
  // Find the study and verify ownership
  const study = await ResearchStudyModel.findOne({
    where: { id: studyId, created_by: userId },
  });

  if (!study) {
    throw new Error('Study not found or you do not have permission to delete it');
  }

  // Use transaction to ensure atomicity
  const t = await sequelize.transaction();
  try {
    // Cascade delete will handle:
    // - ResearchStudyUserRole (via foreign key)
    // - StudyParticipant (via foreign key)
    // - StudyNotes (via foreign key)
    // - ResearchPlan (via foreign key)
    // - SessionSummary (via foreign key)

    // Delete the study (cascade will handle related records)
    await study.destroy({ transaction: t });

    await t.commit();

    return {
      success: true,
      studyName: study.name,
      studyPath: study.path
    };
  } catch (err) {
    await t.rollback();
    console.error('deleteResearchStudy failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to delete research study: ${message}`);
  }
};

/**
 * Get all studies for a project.
 */
const getStudiesByProject = async (projectId: number): Promise<ResearchStudy[]> => {
  return ResearchStudyModel.findAll({
    where: { project_id: projectId },
    attributes: ['id', 'project_id', 'name', 'slug', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at'],
    order: [['created_at', 'DESC']],
  });
};

/**
 * SCAFFOLDING: 2D removal deadline.
 * Filed in: docs/scaffolding-to-remove.md
 *
 * Bridge function for handlers receiving studyName from legacy modal metadata.
 * Returns the study with its project_id FK so handlers can call FK-based APIs.
 *
 * WHY IT EXISTS:
 * Modal builders (2D scope) still pass studyName in private_metadata.
 * Handlers need projectId + studyId to call the new FK-based cascade APIs.
 * This function is the ONE place that translates name → FKs.
 *
 * DELETION TRIGGER:
 * When 2D updates modal builders to pass projectId + studyId directly in
 * private_metadata, delete this function and all handler usages.
 *
 * PATTERN ENFORCEMENT:
 * See pattern-enforcement.test.ts for commented assertion to activate at 2D close.
 */
const resolveStudyFromName = async (studyName: string): Promise<{
  study: ResearchStudy;
  projectId: number;
  studyId: number;
} | null> => {
  const study = await ResearchStudyModel.findOne({
    where: { name: studyName },
    attributes: [
      'id', 'project_id', 'name', 'slug', 'channel_name', 'description',
      'path', 'link', 'created_by', 'researcher_name', 'researcher_email',
      'parsed_budget_amount', 'target_participants', 'session_timezone',
      'created_at', 'updated_at',
    ],
    include: [
      { model: UserRoleModel, as: 'userRoles', attributes: ['user_id', 'role', 'created_at'] },
      { model: ProjectModel, as: 'project', attributes: ['id', 'name', 'slug'] },
    ],
  });

  if (!study) return null;

  return {
    study,
    projectId: study.project_id,
    studyId: study.id,
  };
};

export {
  addResearchStudyWithRoles,
  getResearchStudyWithRoles,
  getStudyById,
  getStudyByProjectAndName,
  getStudiesByUser,
  getStudiesByProject,
  deleteResearchStudy,
  resolveStudyFromName,
};

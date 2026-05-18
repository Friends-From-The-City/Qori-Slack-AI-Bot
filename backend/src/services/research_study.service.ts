import type { ResearchStudy } from '../database/models/research_study';
import type { ResearchStudyUserRole } from '../database/models/research_study_user_role';
import type { CreationAttributes } from 'sequelize';

import sequelize from '../database';

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const UserRoleModel = sequelize.models.ResearchStudyUserRole as typeof ResearchStudyUserRole;

interface RoleAssignment {
  user: string;
  role: string;
}

interface StudyInput {
  name: string;
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
  const { assignments = [], ...studyData } = data;

  // we want atomicity across study + roles:
  const t = await sequelize.transaction();
  try {
    // 1) upsert the study
    // Intentional attribute selection — see ADR L001
    let study = await ResearchStudyModel.findOne({
      where: { name: studyData.name },
      attributes: ['id', 'name', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at'],
      transaction: t,
    });

    if (study) {
      await study.update(studyData, { transaction: t });
      console.log('🔄 updated study', study.id);
    } else {
      study = await ResearchStudyModel.create(studyData as CreationAttributes<ResearchStudy>, { transaction: t });
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

const getResearchStudyWithRoles = async (name: string): Promise<ResearchStudy | null> => {
  // findOne by name, include user roles
  // Intentional attribute selection — see ADR L001
  const study = await ResearchStudyModel.findOne({
    where: { name },
    attributes: ['id', 'name', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at', 'link', 'total_participants', 'parsed_budget_amount', 'target_participants'],
    include: [{
      model: UserRoleModel,
      as: 'userRoles',
      attributes: ['user_id', 'role', 'created_at'],
    }],
  });

  // Add computed counts (using the fields that are already in the study table)
  if (study) {
    study.total_participants = study.total_participants || 0; // Use the field from the table
    // Placeholder computed counts — injected onto the instance but not part of
    // the model schema. Cast through intersection to avoid `as any`.
    const withCounts = study as ResearchStudy & StudyComputedCounts;
    withCounts.total_sessions = 0;
    withCounts.total_transcripts = 0;
    withCounts.total_summaries = 0;
  }

  return study;
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

export {
  addResearchStudyWithRoles,
  getResearchStudyWithRoles,
  getStudiesByUser,
  deleteResearchStudy,
};

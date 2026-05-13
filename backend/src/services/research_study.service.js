const sequelize = require("../database");

const addResearchStudyWithRoles = async (data) => {
  const { assignments = [], ...studyData } = data;
  const ResearchStudy = sequelize.models.ResearchStudy;
  const UserRole = sequelize.models.ResearchStudyUserRole;

  // we want atomicity across study + roles:
  const t = await sequelize.transaction();
  try {
    // 1) upsert the study
    let study = await ResearchStudy.findOne({
      where: { name: studyData.name },
      attributes: ['id', 'name', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at'],
      transaction: t,
    });

    if (study) {
      await study.update(studyData, { transaction: t });
      console.log('🔄 updated study', study.id);
    } else {
      study = await ResearchStudy.create(studyData, { transaction: t });
      console.log('✨ created study', study.id);
    }

    // 2) clear out old roles
    await UserRole.destroy({
      where: { research_id: study.id },
      transaction: t,
    });

    // 3) bulk create assignments
    if (assignments.length) {
      const rows = assignments.map(({ user, role }) => ({
        research_id: study.id,
        user_id: user,
        role,
        // created_at will default
      }));

      await UserRole.bulkCreate(rows, { transaction: t });
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

const getResearchStudyWithRoles = async (name) => {
  const { ResearchStudy, ResearchStudyUserRole: UserRole } = sequelize.models;

  // findOne by name, include user roles
  const study = await ResearchStudy.findOne({
    where: { name },
    attributes: ['id', 'name', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at', 'link', 'total_participants', 'parsed_budget_amount', 'target_participants'],
    include: [{
      model: UserRole,
      as: 'userRoles',
      attributes: ['user_id', 'role', 'created_at'],
    }],
  });

  // Add computed counts (using the fields that are already in the study table)
  if (study) {
    study.total_participants = study.total_participants || 0; // Use the field from the table
    study.total_sessions = 0; // Placeholder for now
    study.total_transcripts = 0; // Placeholder for now
    study.total_summaries = 0; // Placeholder for now
  }

  return study;
};

const getStudiesByUser = async (userId) => {
  const { ResearchStudy } = sequelize.models;

  // Find all studies created by the user
  const studies = await ResearchStudy.findAll({
    where: { created_by: userId },
    attributes: ['id', 'name', 'description', 'path', 'created_by', 'researcher_name', 'researcher_email', 'created_at', 'updated_at'],
    order: [['created_at', 'DESC']], // Most recent first
  });

  return studies;
};

const deleteResearchStudy = async (studyId, userId) => {
  const { ResearchStudy } = sequelize.models;

  // Find the study and verify ownership
  const study = await ResearchStudy.findOne({
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
    throw new Error(`Failed to delete research study: ${err.message}`);
  }
};

module.exports = {
  addResearchStudyWithRoles,
  getResearchStudyWithRoles,
  getStudiesByUser,
  deleteResearchStudy
};

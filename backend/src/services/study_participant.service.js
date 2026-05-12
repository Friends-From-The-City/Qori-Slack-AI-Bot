// services/study_participant.service.js

const sequelize = require("../database");
const { processParticipantYamlTemplate } = require("../helpers/participantYamlProcessor");
const { fetchFileFromRepo } = require("../helpers/github");
const { PARTICIPANT_STATUS, ACTIVE_STATUSES } = require("../constants/participantStatus");

class StudyParticipantService {
  /**
   * Create a new participant for a study or update if already exists
   */

  async createParticipant(participantData, fileData) {
    try {
      // Check if participant already exists (based on study_id and participant_name)
      const existingParticipant = await sequelize.models.StudyParticipant.findOne({
        where: {
          participant_name: participantData.participant_name
        }
      });

      let participant;
      // if (existingParticipant) {
      //   // Update existing participant
      //   console.log('Participant already exists, updating:', existingParticipant.id);
      //   participant = await existingParticipant.update(participantData);
      // } else {
      // Create new participant
      console.log('Creating new participant');
      participant = await sequelize.models.StudyParticipant.create(participantData);

      // Update total_participants count in research_study
      await this.updateStudyParticipantCount(participantData.study_id);
      // }

      // Process YAML after participant is saved to database
      if (fileData && fileData.file && fileData.study_path) {
        try {
          // Get all participants for the study to include in YAML processing
          const allParticipants = await this.getParticipantsByStudy(participantData.study_id);

          // Get study information to ensure consistent study name
          const study = await sequelize.models.ResearchStudy.findByPk(participantData.study_id);

          // Create input data for YAML processing
          const inputData = {
            study_id: participantData.study_id,
            study_name: study ? study.name : (participantData.study_name || 'Study'),
            participant_name: participantData.participant_name,
            contact_details: participantData.contact_details,
            recruitment_source: participantData.recruitment_source,
            scheduled_date: participantData.scheduled_date,
            scheduled_time: participantData.scheduled_time,
            status_select: participantData.status_select,
            notes_field: participantData.notes_field,
            demographics_info: participantData.demographics_info,
            current_date: new Date().toISOString().split('T')[0],
            added_by: participantData.added_by
          };

          // Process the YAML template with database participants
          const renderedYaml = await processParticipantYamlTemplate(
            fileData.file,
            inputData,
            fileData.study_path,
            'primary-research',
            allParticipants
          );

          console.log('✅ Participant tracker updated successfully:', renderedYaml);
        } catch (yamlError) {
          console.error('⚠️ Error updating participant tracker YAML:', yamlError);
          // Don't throw error here to avoid breaking the main participant creation
        }
      }

      return participant;
    } catch (error) {
      console.error('Error creating/updating participant:', error);
      throw error;
    }
  }

  /**
   * Update the total_participants count for a study
   */
  async updateStudyParticipantCount(studyId) {
    try {
      const participantCount = await sequelize.models.StudyParticipant.count({
        where: { study_id: studyId }
      });

      await sequelize.models.ResearchStudy.update(
        { total_participants: participantCount },
        { where: { id: studyId } }
      );

      console.log(`Updated total_participants count for study ${studyId}: ${participantCount}`);
    } catch (error) {
      console.error('Error updating study participant count:', error);
      throw error;
    }
  }

  /**
   * Get all participants for a specific study
   */
  async getParticipantsByStudy(studyId) {
    try {
      const participants = await sequelize.models.StudyParticipant.findAll({
        where: { study_id: studyId },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name', 'description']
          }
        ],
        order: [['created_at', 'DESC']]
      });


      return participants;
    } catch (error) {
      console.error('Error fetching participants by study:', error);
      throw error;
    }
  }

  async getParticipantsByUserId(userId) {
    try {
      const participants = await sequelize.models.StudyParticipant.findAll({
        where: { added_by: userId },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name', 'description']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      return participants;
    } catch (error) {
      console.error('Error fetching participants by study:', error);
      throw error;
    }
  }

  /**
   * Get a specific participant by ID
   */
  async getParticipantById(participantId) {
    try {
      const participant = await sequelize.models.StudyParticipant.findByPk(participantId, {
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name', 'description']
          }
        ]
      });
      return participant;
    } catch (error) {
      console.error('Error fetching participant by ID:', error);
      throw error;
    }
  }

  /**
   * Update a participant
   */
  async updateParticipant(participantId, updateData) {
    try {
      const participant = await sequelize.models.StudyParticipant.findByPk(participantId);
      if (!participant) {
        throw new Error('Participant not found');
      }

      await participant.update(updateData);
      return participant;
    } catch (error) {
      console.error('Error updating participant:', error);
      throw error;
    }
  }

  /**
   * Delete a participant
   */
  async deleteParticipant(participantId) {
    try {
      const participant = await sequelize.models.StudyParticipant.findByPk(participantId);
      if (!participant) {
        throw new Error('Participant not found');
      }

      const studyId = participant.study_id;
      await participant.destroy();

      // Update total_participants count in research_study
      await this.updateStudyParticipantCount(studyId);

      return { success: true, message: 'Participant deleted successfully' };
    } catch (error) {
      console.error('Error deleting participant:', error);
      throw error;
    }
  }

  /**
   * Get participants by status
   */
  async getParticipantsByStatus(studyId, status) {
    try {
      const participants = await sequelize.models.StudyParticipant.findAll({
        where: {
          study_id: studyId,
          status_select: status
        },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name']
          }
        ],
        order: [['scheduled_date', 'ASC']]
      });
      return participants;
    } catch (error) {
      console.error('Error fetching participants by status:', error);
      throw error;
    }
  }

  /**
   * Get participants scheduled for a specific date
   */
  async getParticipantsByDate(studyId, date) {
    try {
      const participants = await sequelize.models.StudyParticipant.findAll({
        where: {
          study_id: studyId,
          scheduled_date: date
        },
        include: [
          {
            model: sequelize.models.ResearchStudy,
            as: 'study',
            attributes: ['id', 'name']
          }
        ],
        order: [['scheduled_time', 'ASC']]
      });
      return participants;
    } catch (error) {
      console.error('Error fetching participants by date:', error);
      throw error;
    }
  }

  /**
   * Get participant statistics for a study
   */
  async getParticipantStats(studyId) {
    try {
      const totalParticipants = await sequelize.models.StudyParticipant.count({
        where: { study_id: studyId }
      });

      const confirmedSessions = await sequelize.models.StudyParticipant.count({
        where: {
          study_id: studyId,
          status_select: PARTICIPANT_STATUS.CONFIRMED,
        }
      });

      const contactedCount = await sequelize.models.StudyParticipant.count({
        where: {
          study_id: studyId,
          status_select: PARTICIPANT_STATUS.CONTACTED,
        }
      });

      const completedSessions = await sequelize.models.StudyParticipant.count({
        where: {
          study_id: studyId,
          status_select: PARTICIPANT_STATUS.COMPLETED,
        }
      });

      const activeCount = await sequelize.models.StudyParticipant.count({
        where: {
          study_id: studyId,
          status_select: ACTIVE_STATUSES,
        }
      });

      return {
        total_participants_count: totalParticipants,
        confirmed_sessions_count: confirmedSessions,
        contacted_count: contactedCount,
        completed_sessions_count: completedSessions,
        active_count: activeCount,
      };
    } catch (error) {
      console.error('Error fetching participant stats:', error);
      throw error;
    }
  }

  /**
   * Get recruitment source breakdown
   */
  async getRecruitmentBreakdown(studyId) {
    try {
      const breakdown = await sequelize.models.StudyParticipant.findAll({
        where: { study_id: studyId },
        attributes: [
          'recruitment_source',
          [sequelize.models.StudyParticipant.sequelize.fn('COUNT', sequelize.models.StudyParticipant.sequelize.col('id')), 'count']
        ],
        group: ['recruitment_source'],
        order: [[sequelize.models.StudyParticipant.sequelize.fn('COUNT', sequelize.models.StudyParticipant.sequelize.col('id')), 'DESC']]
      });

      const total = breakdown.reduce((sum, item) => sum + parseInt(item.dataValues.count), 0);

      return breakdown.map(item => ({
        method: item.recruitment_source || 'Unknown',
        count: parseInt(item.dataValues.count),
        percentage: total > 0 ? Math.round((parseInt(item.dataValues.count) / total) * 100) : 0
      }));
    } catch (error) {
      console.error('Error fetching recruitment breakdown:', error);
      throw error;
    }
  }

  /**
   * Check if study has reached a participant milestone
   */
  async checkStudyMilestone(studyId, milestoneCount = 2) {
    try {
      const study = await sequelize.models.ResearchStudy.findByPk(studyId);
      if (!study) {
        throw new Error('Study not found');
      }

      const hasReachedMilestone = study.total_participants === milestoneCount;

      return {
        hasReachedMilestone,
        currentCount: study.total_participants,
        milestoneCount,
        studyName: study.name
      };
    } catch (error) {
      console.error('Error checking study milestone:', error);
      throw error;
    }
  }

  /**
   * Get milestone message for Slack
   */
  // Removed: getMilestoneMessage should be in participantOutreachHandler, not here.
}

module.exports = new StudyParticipantService(); 

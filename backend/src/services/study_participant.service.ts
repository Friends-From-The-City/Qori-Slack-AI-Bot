// services/study_participant.service.ts

import type { StudyParticipant } from '../database/models/study_participant';
import type { ResearchStudy } from '../database/models/research_study';
import type { StudyParticipantCreationAttributes } from '../types/models';
import type { ParticipantStatus } from '../constants/participantStatus';
import type { Transaction } from 'sequelize';

import sequelize from '../database';
import { QueryTypes } from 'sequelize';
import { processParticipantYamlTemplate } from '../helpers/participantYamlProcessor';
import { PARTICIPANT_STATUS, ACTIVE_STATUSES } from '../constants/participantStatus';
import { createSubjectForParticipant } from './subject-linking.service';

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const StudyParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

interface FileData {
  file: string;
  study_path: string;
}

interface ParticipantStats {
  total_participants_count: number;
  confirmed_sessions_count: number;
  contacted_count: number;
  completed_sessions_count: number;
  active_count: number;
}

interface RecruitmentBreakdownItem {
  method: string;
  count: number;
  percentage: number;
}

interface MilestoneResult {
  hasReachedMilestone: boolean;
  currentCount: number;
  milestoneCount: number;
  studyName: string;
}

/** Sequelize aggregate query result with a computed count in dataValues. */
interface AggregateWithCount extends StudyParticipant {
  dataValues: StudyParticipant['dataValues'] & { count: string };
}

class StudyParticipantService {
  /**
   * Preview the next participant code for a study (no lock, read-only).
   * Use this for modal display; actual assignment uses getNextParticipantCode with transaction.
   */
  async previewNextParticipantCode(studyId: number): Promise<string> {
    const [result] = (await StudyParticipantModel.sequelize!.query(
      `SELECT COALESCE(
         MAX(CAST(SUBSTRING(participant_code FROM 4) AS INTEGER)),
         0
       ) + 1 AS next_code
       FROM study_participants
       WHERE study_id = $1`,
      { bind: [studyId], type: QueryTypes.SELECT },
    )) as [{ next_code: number }];

    return `PT-${String(result.next_code).padStart(3, '0')}`;
  }

  /**
   * Generate the next participant code for a study.
   * Uses MAX+1 logic (delete-safe) with advisory lock for race condition prevention.
   * Returns PT-001, PT-002, etc. — each study starts at 001.
   * See ADR 0020 for rationale.
   */
  async getNextParticipantCode(studyId: number, transaction?: Transaction): Promise<string> {
    const seq = StudyParticipantModel.sequelize!;

    // Advisory lock keyed on study_id prevents race conditions during concurrent creates
    await seq.query('SELECT pg_advisory_xact_lock($1)', {
      bind: [studyId],
      transaction,
    });

    const [result] = (await seq.query(
      `SELECT COALESCE(
         MAX(CAST(SUBSTRING(participant_code FROM 4) AS INTEGER)),
         0
       ) + 1 AS next_code
       FROM study_participants
       WHERE study_id = $1`,
      { bind: [studyId], transaction, type: QueryTypes.SELECT },
    )) as [{ next_code: number }];

    return `PT-${String(result.next_code).padStart(3, '0')}`;
  }

  /**
   * Create a new participant for a study and update the tracker YAML.
   * Participant code is system-assigned (PT-001, PT-002 per study).
   */
  async createParticipant(
    participantData: StudyParticipantCreationAttributes & { study_name?: string },
    fileData?: FileData | null,
  ): Promise<StudyParticipant> {
    const transaction = await StudyParticipantModel.sequelize!.transaction();

    try {
      console.log('Creating new participant');

      // Generate system-assigned participant code within transaction
      const participantCode = await this.getNextParticipantCode(
        participantData.study_id,
        transaction,
      );

      // R2: Normalize scheduled_date to Date (accepts string or Date from handlers)
      const normalizedDate: Date | null =
        typeof participantData.scheduled_date === 'string'
          ? new Date(participantData.scheduled_date)
          : (participantData.scheduled_date ?? null);

      const participant = await StudyParticipantModel.create(
        { ...participantData, participant_code: participantCode, scheduled_date: normalizedDate },
        { transaction },
      );

      // GOV-2A2: Create canonical data_subject + participant link atomically.
      // If this fails, participant creation rolls back — no participant without subject linkage.
      await createSubjectForParticipant(participant.id, participantData.added_by, transaction);

      // R3: No longer updating denormalized count — computed on read
      await transaction.commit();

      // YAML processing outside transaction (non-critical, should not roll back participant creation)
      if (fileData && fileData.file && fileData.study_path) {
        try {
          const allParticipants = await this.getParticipantsByStudy(participantData.study_id);
          const study = await ResearchStudyModel.findByPk(participantData.study_id);

          const inputData = {
            study_id: participantData.study_id,
            study_name: study ? study.name : (participantData.study_name || 'Study'),
            participant_code: participantCode,
            participant_name: participantData.participant_name,
            contact_details: participantData.contact_details,
            recruitment_source: participantData.recruitment_source,
            scheduled_date: participantData.scheduled_date,
            scheduled_time: participantData.scheduled_time,
            status_select: participantData.status_select,
            notes_field: participantData.notes_field,
            demographics_info: participantData.demographics_info,
            current_date: new Date().toISOString().split('T')[0],
            added_by: participantData.added_by,
          };

          const renderedYaml = await processParticipantYamlTemplate(
            fileData.file,
            // @ts-expect-error — pre-existing type mismatch from require() → import migration
            inputData,
            fileData.study_path,
            '',
            allParticipants,
          );

          console.log('✅ Participant tracker updated successfully:', renderedYaml);
        } catch (yamlError) {
          console.error('⚠️ Error updating participant tracker YAML:', yamlError);
        }
      }

      return participant;
    } catch (error) {
      await transaction.rollback();
      console.error('Error creating/updating participant:', error);
      throw error;
    }
  }

  // R3: updateStudyParticipantCount() removed — count is now computed on read
  // via StudyParticipantModel.count() or study.countParticipants()

  /**
   * Get all participants for a specific study.
   */
  async getParticipantsByStudy(studyId: number): Promise<StudyParticipant[]> {
    try {
      const participants = await StudyParticipantModel.findAll({
        where: { study_id: studyId },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'description'],
          },
        ],
        order: [['created_at', 'DESC']],
      });

      return participants;
    } catch (error) {
      console.error('Error fetching participants by study:', error);
      throw error;
    }
  }

  /**
   * Get all participants added by a specific user.
   */
  async getParticipantsByUserId(userId: string): Promise<StudyParticipant[]> {
    try {
      const participants = await StudyParticipantModel.findAll({
        where: { added_by: userId },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'description'],
          },
        ],
        order: [['created_at', 'DESC']],
      });
      return participants;
    } catch (error) {
      console.error('Error fetching participants by user:', error);
      throw error;
    }
  }

  /**
   * Get a specific participant by ID.
   */
  async getParticipantById(participantId: number): Promise<StudyParticipant | null> {
    try {
      const participant = await StudyParticipantModel.findByPk(participantId, {
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'description'],
          },
        ],
      });
      return participant;
    } catch (error) {
      console.error('Error fetching participant by ID:', error);
      throw error;
    }
  }

  /**
   * Update a participant.
   */
  async updateParticipant(
    participantId: number,
    updateData: Partial<StudyParticipantCreationAttributes>,
  ): Promise<StudyParticipant> {
    try {
      const participant = await StudyParticipantModel.findByPk(participantId);
      if (!participant) {
        throw new Error('Participant not found');
      }

      // R2: Normalize scheduled_date to Date if present (accepts string or Date)
      const normalizedUpdate = { ...updateData };
      if (typeof normalizedUpdate.scheduled_date === 'string') {
        normalizedUpdate.scheduled_date = new Date(normalizedUpdate.scheduled_date);
      }

      await participant.update(normalizedUpdate as Parameters<typeof participant.update>[0]);
      return participant;
    } catch (error) {
      console.error('Error updating participant:', error);
      throw error;
    }
  }

  /**
   * Delete a participant and update the study count.
   *
   * @deprecated Use DSAR path (dsar.service.ts → deleteParticipantDSAR) for participant
   * deletion. This method bypasses audit logging, authorization, and cascade cleanup of
   * study_variables/study_notes. Zero handler call sites. Retained for migration tooling only.
   * Scheduled for removal or access restriction in GOV-2.
   */
  async deleteParticipant(participantId: number): Promise<{ success: boolean; message: string }> {
    try {
      const participant = await StudyParticipantModel.findByPk(participantId);
      if (!participant) {
        throw new Error('Participant not found');
      }

      await participant.destroy();

      // R3: No longer updating denormalized count — computed on read
      return { success: true, message: 'Participant deleted successfully' };
    } catch (error) {
      console.error('Error deleting participant:', error);
      throw error;
    }
  }

  /**
   * Get participants by status.
   */
  async getParticipantsByStatus(studyId: number, status: ParticipantStatus): Promise<StudyParticipant[]> {
    try {
      const participants = await StudyParticipantModel.findAll({
        where: {
          study_id: studyId,
          status_select: status,
        },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name'],
          },
        ],
        order: [['scheduled_date', 'ASC']],
      });
      return participants;
    } catch (error) {
      console.error('Error fetching participants by status:', error);
      throw error;
    }
  }

  /**
   * Get participants scheduled for a specific date.
   */
  async getParticipantsByDate(studyId: number, date: string): Promise<StudyParticipant[]> {
    try {
      const participants = await StudyParticipantModel.findAll({
        where: {
          study_id: studyId,
          scheduled_date: date,
        },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name'],
          },
        ],
        order: [['scheduled_time', 'ASC']],
      });
      return participants;
    } catch (error) {
      console.error('Error fetching participants by date:', error);
      throw error;
    }
  }

  /**
   * Get participant statistics for a study.
   */
  async getParticipantStats(studyId: number): Promise<ParticipantStats> {
    try {
      const totalParticipants = await StudyParticipantModel.count({
        where: { study_id: studyId },
      });

      const confirmedSessions = await StudyParticipantModel.count({
        where: {
          study_id: studyId,
          status_select: PARTICIPANT_STATUS.CONFIRMED,
        },
      });

      const contactedCount = await StudyParticipantModel.count({
        where: {
          study_id: studyId,
          status_select: PARTICIPANT_STATUS.CONTACTED,
        },
      });

      const completedSessions = await StudyParticipantModel.count({
        where: {
          study_id: studyId,
          status_select: PARTICIPANT_STATUS.COMPLETED,
        },
      });

      const activeCount = await StudyParticipantModel.count({
        where: {
          study_id: studyId,
          status_select: ACTIVE_STATUSES,
        },
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
   * Get recruitment source breakdown.
   */
  async getRecruitmentBreakdown(studyId: number): Promise<RecruitmentBreakdownItem[]> {
    try {
      const breakdown = await StudyParticipantModel.findAll({
        where: { study_id: studyId },
        attributes: [
          'recruitment_source',
          [StudyParticipantModel.sequelize!.fn('COUNT', StudyParticipantModel.sequelize!.col('id')), 'count'],
        ],
        group: ['recruitment_source'],
        order: [[StudyParticipantModel.sequelize!.fn('COUNT', StudyParticipantModel.sequelize!.col('id')), 'DESC']],
      });

      const total = breakdown.reduce(
        (sum: number, item) => sum + parseInt((item as AggregateWithCount).dataValues.count, 10),
        0,
      );

      return breakdown.map((item) => {
        const count = parseInt((item as AggregateWithCount).dataValues.count, 10);
        return {
          method: item.recruitment_source || 'Unknown',
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        };
      });
    } catch (error) {
      console.error('Error fetching recruitment breakdown:', error);
      throw error;
    }
  }

  /**
   * Check if study has reached a participant milestone.
   * R3: Now computes count instead of reading denormalized total_participants.
   */
  async checkStudyMilestone(studyId: number, milestoneCount: number = 2): Promise<MilestoneResult> {
    try {
      const study = await ResearchStudyModel.findByPk(studyId);
      if (!study) {
        throw new Error('Study not found');
      }

      // R3: Compute count instead of reading stored value
      const currentCount = await StudyParticipantModel.count({
        where: { study_id: studyId },
      });

      const hasReachedMilestone = currentCount === milestoneCount;

      return {
        hasReachedMilestone,
        currentCount,
        milestoneCount,
        studyName: study.name,
      };
    } catch (error) {
      console.error('Error checking study milestone:', error);
      throw error;
    }
  }
}

const studyParticipantService = new StudyParticipantService();
export default studyParticipantService;

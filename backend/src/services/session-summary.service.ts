import type { SessionSummary } from '../database/models/session_summary';
import type { ResearchStudy } from '../database/models/research_study';

const sequelize = require('../database');

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const SessionSummaryModel = sequelize.models.SessionSummary as typeof SessionSummary;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface SummaryInput {
  study_id?: number;
  study_name?: string;
  filename?: string;
  created_at?: Date;
  updated_at?: Date;
  [key: string]: unknown;
}

class SessionSummaryService {
  /**
   * Create or update a session summary
   * If a summary with the same study_id and filename exists, it will be updated
   */
  async createOrUpdateSessionSummary(summaryData: SummaryInput): Promise<SessionSummary> {
    try {
      // Handle case where study_id might be null
      if (!summaryData.study_id) {
        // Try to find the study by name if study_id is not provided
        const study = await ResearchStudyModel.findOne({
          where: { name: summaryData.study_name }
        });
        if (study) {
          summaryData.study_id = study.id;
        } else {
          throw new Error(`Study not found: ${summaryData.study_name}`);
        }
      }

      // Check if a summary with the same study_id and filename already exists
      const existingSummary = await SessionSummaryModel.findOne({
        where: {
          study_id: summaryData.study_id,
          filename: summaryData.filename
        }
      });

      // Set manual timestamps
      const now = new Date();
      summaryData.updated_at = now;

      if (existingSummary) {
        // Update existing summary
        await existingSummary.update({
          ...summaryData,
          updated_at: now
        });
        return existingSummary;
      } else {
        // Create new summary
        summaryData.created_at = now;
        const summary = await SessionSummaryModel.create(summaryData as any);
        return summary;
      }
    } catch (error: any) {
      console.error('Error creating/updating session summary:', error);
      throw new Error(`Failed to create/update session summary: ${error.message}`);
    }
  }

  /**
   * Get a session summary by ID
   */
  async getSessionSummaryById(id: number): Promise<SessionSummary> {
    try {
      const summary = await SessionSummaryModel.findByPk(id, {
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'description']
          }
        ]
      });

      if (!summary) {
        throw new Error('Session summary not found');
      }

      return summary;
    } catch (error: any) {
      console.error('Error getting session summary by ID:', error);
      throw new Error(`Failed to get session summary: ${error.message}`);
    }
  }

  /**
   * Get session summaries by study ID
   */
  async getSessionSummariesByStudyId(studyId: number, options: QueryOptions = {}): Promise<SessionSummary[]> {
    try {
      const where = { study_id: studyId };

      const summaries = await SessionSummaryModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [
          ['created_at', 'DESC']
        ],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return summaries;
    } catch (error: any) {
      console.error('Error getting session summaries by study ID:', error);
      throw new Error(`Failed to get session summaries: ${error.message}`);
    }
  }

  /**
   * Get session summaries by study name
   */
  async getSessionSummariesByStudyName(studyName: string): Promise<SessionSummary[]> {
    try {
      const summaries = await SessionSummaryModel.findAll({
        where: { study_name: studyName },
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [
          ['created_at', 'DESC']
        ]
      });

      return summaries;
    } catch (error: any) {
      console.error('Error getting session summaries by study name:', error);
      throw new Error(`Failed to get session summaries: ${error.message}`);
    }
  }

  /**
   * Get all session summaries
   */
  async getAllSessionSummaries(options: QueryOptions = {}): Promise<SessionSummary[]> {
    try {
      const summaries = await SessionSummaryModel.findAll({
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [
          ['created_at', 'DESC']
        ],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return summaries;
    } catch (error: any) {
      console.error('Error getting all session summaries:', error);
      throw new Error(`Failed to get session summaries: ${error.message}`);
    }
  }

  /**
   * Delete a session summary by ID
   */
  async deleteSessionSummary(id: number): Promise<boolean> {
    try {
      const summary = await SessionSummaryModel.findByPk(id);

      if (!summary) {
        throw new Error('Session summary not found');
      }

      await summary.destroy();
      return true;
    } catch (error: any) {
      console.error('Error deleting session summary:', error);
      throw new Error(`Failed to delete session summary: ${error.message}`);
    }
  }
}

module.exports = new SessionSummaryService();

import type { ResearchPlan } from '../database/models/research_plan';
import type { ResearchStudy } from '../database/models/research_study';
import { Op } from 'sequelize';

import sequelize from '../database';

// Typed model references — cast once, use everywhere. See Phase 3 notes.
const ResearchPlanModel = sequelize.models.ResearchPlan as typeof ResearchPlan;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface SearchCriteria {
  study_name?: string;
  filename?: string;
}

interface PlanInput {
  study_id?: number;
  study_name?: string;
  created_at?: Date;
  updated_at?: Date;
  [key: string]: unknown;
}

class ResearchPlanService {
  /**
   * Create a new research plan
   */
  async createResearchPlan(planData: PlanInput): Promise<ResearchPlan> {
    try {
      // Handle case where study_id might be null
      if (!planData.study_id) {
        // Try to find the study by name if study_id is not provided
        const study = await ResearchStudyModel.findOne({
          where: { name: planData.study_name }
        });
        if (study) {
          planData.study_id = study.id;
        }
      }

      // Set manual timestamps
      const now = new Date();
      planData.created_at = now;
      planData.updated_at = now;

      const plan = await ResearchPlanModel.create(planData as any);
      return plan;
    } catch (error) {
      console.error('Error creating research plan:', error);
      throw new Error(`Failed to create research plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a research plan by ID
   */
  async getResearchPlanById(id: number): Promise<ResearchPlan> {
    try {
      const plan = await ResearchPlanModel.findByPk(id, {
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'description']
          }
        ]
      });

      if (!plan) {
        throw new Error('Research plan not found');
      }

      return plan;
    } catch (error) {
      console.error('Error getting research plan by ID:', error);
      throw new Error(`Failed to get research plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get research plans by study ID
   */
  async getResearchPlansByStudyId(studyId: number, options: QueryOptions = {}): Promise<ResearchPlan[]> {
    try {
      const where = { study_id: studyId };

      const plans = await ResearchPlanModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return plans;
    } catch (error) {
      console.error('Error getting research plans by study ID:', error);
      throw new Error(`Failed to get research plans: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get research plans by user ID
   */
  async getResearchPlansByUserId(userId: string, options: QueryOptions = {}): Promise<ResearchPlan[]> {
    try {
      const where = { created_by: userId };

      const plans = await ResearchPlanModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return plans;
    } catch (error) {
      console.error('Error getting research plans by user ID:', error);
      throw new Error(`Failed to get research plans: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get research plans by exact study name match
   */
  async getResearchPlansByStudyName(studyName: string, options: QueryOptions = {}): Promise<ResearchPlan[]> {
    try {
      if (!studyName) {
        throw new Error('Study name is required');
      }

      const where = {
        study_name: studyName
      };

      const plans = await ResearchPlanModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'description']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return plans;
    } catch (error) {
      console.error('Error getting research plans by exact study name:', error);
      throw new Error(`Failed to get research plans by exact study name: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search research plans
   */
  async searchResearchPlans(searchCriteria: SearchCriteria, options: QueryOptions = {}): Promise<ResearchPlan[]> {
    try {
      const where: Record<string, unknown> = {};

      // Add search criteria
      if (searchCriteria.study_name) {
        where.study_name = { [Op.iLike]: `%${searchCriteria.study_name}%` };
      }

      if (searchCriteria.filename) {
        where.filename = { [Op.iLike]: `%${searchCriteria.filename}%` };
      }

      const plans = await ResearchPlanModel.findAll({
        where,
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return plans;
    } catch (error) {
      console.error('Error searching research plans:', error);
      throw new Error(`Failed to search research plans: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update a research plan
   */
  async updateResearchPlan(id: number, updateData: Partial<PlanInput>): Promise<ResearchPlan> {
    try {
      const plan = await ResearchPlanModel.findByPk(id);

      if (!plan) {
        throw new Error('Research plan not found');
      }

      // Set updated_at timestamp
      updateData.updated_at = new Date();

      // Update the plan
      await plan.update(updateData);

      return plan;
    } catch (error) {
      console.error('Error updating research plan:', error);
      throw new Error(`Failed to update research plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a research plan
   */
  async deleteResearchPlan(id: number): Promise<boolean> {
    try {
      const plan = await ResearchPlanModel.findByPk(id);

      if (!plan) {
        throw new Error('Research plan not found');
      }

      await plan.destroy();
      return true;
    } catch (error) {
      console.error('Error deleting research plan:', error);
      throw new Error(`Failed to delete research plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all research plans
   */
  async getAllResearchPlans(options: QueryOptions = {}): Promise<ResearchPlan[]> {
    try {
      const plans = await ResearchPlanModel.findAll({
        include: [
          {
            model: ResearchStudyModel,
            as: 'study',
            attributes: ['id', 'name', 'path', 'description']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      return plans;
    } catch (error) {
      console.error('Error getting all research plans:', error);
      throw new Error(`Failed to get research plans: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const researchPlanService = new ResearchPlanService();
export default researchPlanService;

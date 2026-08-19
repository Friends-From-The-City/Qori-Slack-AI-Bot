/**
 * SurveyCodebook Model
 *
 * Per Survey Slice 2A: Versioned codebook for structured qualitative
 * content analysis. Accepted versions are immutable; editing creates
 * a new version. Supersession occurs only after replacement is accepted.
 */

import {
  DataTypes, Model,
  type InferAttributes, type InferCreationAttributes, type CreationOptional, type Sequelize,
} from 'sequelize';
import { randomUUID } from 'crypto';

export type CodebookStatus = 'draft' | 'under_review' | 'accepted' | 'superseded';

class SurveyCodebook extends Model<
  InferAttributes<SurveyCodebook>, InferCreationAttributes<SurveyCodebook>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare evidence_source_id: number;
  declare project_id: number;
  declare study_id: number | null;
  declare version: CreationOptional<number>;
  declare status: CreationOptional<CodebookStatus>;
  declare method: CreationOptional<string>;
  declare based_on_codebook_id: number | null;
  declare generation_metadata: Record<string, unknown>;
  declare created_by: string;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.EvidenceSource, { foreignKey: 'evidence_source_id', as: 'evidenceSource', onDelete: 'CASCADE' });
    this.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project', onDelete: 'CASCADE' });
    this.belongsTo(models.ResearchStudy, { foreignKey: 'study_id', as: 'study', onDelete: 'CASCADE' });
    this.belongsTo(models.SurveyCodebook, { foreignKey: 'based_on_codebook_id', as: 'basedOn', onDelete: 'SET NULL' });
  }
}

export default (sequelize: Sequelize) => {
  SurveyCodebook.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: DataTypes.UUID, allowNull: false, unique: true, defaultValue: () => randomUUID() },
      evidence_source_id: { type: DataTypes.INTEGER, allowNull: false },
      project_id: { type: DataTypes.INTEGER, allowNull: false },
      study_id: { type: DataTypes.INTEGER, allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
      method: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'structured_qualitative_content_analysis' },
      based_on_codebook_id: { type: DataTypes.INTEGER, allowNull: true },
      generation_metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_by: { type: DataTypes.STRING(50), allowNull: false },
      reviewed_by: { type: DataTypes.STRING(50), allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'survey_codebooks', underscored: true, timestamps: false, sequelize },
  );
  return SurveyCodebook;
};

export type { SurveyCodebook };

/**
 * SurveyQualitativeEntry Model
 *
 * Per Survey Slice 2A: One normalized qualitative evidence unit per
 * respondent × open-text field. Governed by privacy disposition —
 * model-eligible only after approved pii_status (clear or redacted).
 *
 * Raw entry_text is accessible only via authorized privacy-review paths.
 * All model/analysis paths use the controlled eligible-content accessor.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';
import { randomUUID } from 'crypto';

export type PiiStatus = 'pending' | 'clear' | 'redacted' | 'restricted';

class SurveyQualitativeEntry extends Model<
  InferAttributes<SurveyQualitativeEntry>,
  InferCreationAttributes<SurveyQualitativeEntry>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare evidence_source_id: number;
  declare project_id: number;
  declare study_id: number | null;
  declare respondent_key: string;
  declare display_respondent_id: string;
  declare field_name: string;
  declare field_display_name: string;
  declare entry_text: string | null;
  declare entry_hash: string;
  declare pii_status: CreationOptional<PiiStatus>;
  declare redacted_text: string | null;
  declare pii_reviewed_by: string | null;
  declare pii_reviewed_at: Date | null;
  declare source_row_index: number | null;
  declare metadata: Record<string, unknown>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.EvidenceSource, {
      foreignKey: 'evidence_source_id',
      as: 'evidenceSource',
      onDelete: 'CASCADE',
    });
    this.belongsTo(models.Project, {
      foreignKey: 'project_id',
      as: 'project',
      onDelete: 'CASCADE',
    });
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'study_id',
      as: 'study',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  SurveyQualitativeEntry.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: DataTypes.UUID, allowNull: false, unique: true, defaultValue: () => randomUUID() },
      evidence_source_id: { type: DataTypes.INTEGER, allowNull: false },
      project_id: { type: DataTypes.INTEGER, allowNull: false },
      study_id: { type: DataTypes.INTEGER, allowNull: true },
      respondent_key: { type: DataTypes.TEXT, allowNull: false },
      display_respondent_id: { type: DataTypes.TEXT, allowNull: false },
      field_name: { type: DataTypes.TEXT, allowNull: false },
      field_display_name: { type: DataTypes.TEXT, allowNull: false },
      entry_text: { type: DataTypes.TEXT, allowNull: true },
      entry_hash: { type: DataTypes.TEXT, allowNull: false },
      pii_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      redacted_text: { type: DataTypes.TEXT, allowNull: true },
      pii_reviewed_by: { type: DataTypes.STRING(50), allowNull: true },
      pii_reviewed_at: { type: DataTypes.DATE, allowNull: true },
      source_row_index: { type: DataTypes.INTEGER, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'survey_qualitative_entries', underscored: true, timestamps: false, sequelize },
  );
  return SurveyQualitativeEntry;
};

export type { SurveyQualitativeEntry };

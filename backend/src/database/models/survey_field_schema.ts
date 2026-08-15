/**
 * SurveyFieldSchema Model
 *
 * Per Survey Slice 1: stores researcher-reviewed field role assignments
 * for CSV survey data. One row per field per evidence source.
 *
 * pending_csv_content follows the study_notes.pending_content quarantine
 * pattern for staging CSV data between upload and schema confirmation.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';
import type { SurveyFieldRole } from '../../types/survey';

export type SchemaReviewStatus = 'pending' | 'confirmed' | 'expired';

class SurveyFieldSchema extends Model<
  InferAttributes<SurveyFieldSchema>,
  InferCreationAttributes<SurveyFieldSchema>
> {
  declare id: CreationOptional<number>;
  declare evidence_source_id: number;
  declare field_name: string;
  declare inferred_role: SurveyFieldRole;
  declare confirmed_role: SurveyFieldRole | null;
  declare order_metadata: string[] | null;
  declare is_demographic: CreationOptional<boolean>;
  declare inference_source: CreationOptional<string>;
  declare review_status: CreationOptional<SchemaReviewStatus>;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare pending_csv_content: string | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.EvidenceSource, {
      foreignKey: 'evidence_source_id',
      as: 'evidenceSource',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  SurveyFieldSchema.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      evidence_source_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      field_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      inferred_role: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      confirmed_role: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      order_metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      is_demographic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      inference_source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'heuristic',
      },
      review_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewed_by: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      pending_csv_content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'survey_field_schemas',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return SurveyFieldSchema;
};

export type { SurveyFieldSchema };

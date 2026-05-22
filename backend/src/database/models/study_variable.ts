// models/study_variable.ts

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type NonAttribute,
  type BelongsToGetAssociationMixin,
  type Sequelize,
} from 'sequelize';
import type { Project } from './project';
import type { ResearchStudy } from './research_study';

/**
 * Cascade variable scope values.
 * - study: Variables scoped to a specific study (brief, plan, synthesis, readout)
 * - discovery: Variables scoped to the project (desk research, stakeholder synthesis)
 */
export type VariableScope = 'study' | 'discovery';

class StudyVariable extends Model<
  InferAttributes<StudyVariable>,
  InferCreationAttributes<StudyVariable>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare project_id: ForeignKey<number>;
  declare study_id: ForeignKey<number> | null;
  declare variable_key: string;
  declare variable_type: string | null;
  declare item_key: string | null;
  declare value: unknown;
  declare participant_id: string | null;
  declare source_template: string;
  declare source_version: string | null;
  declare source_date: Date | null;
  declare value_hash: string | null;
  declare entry_count: number | null;
  declare is_pool: CreationOptional<boolean>;
  declare confidence: string | null;
  declare scope: CreationOptional<VariableScope | null>;
  declare discovery_artifact_id: string | null;
  declare stale: CreationOptional<boolean>;
  declare extracted_at: CreationOptional<Date>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // — Association mixins —
  declare getProject: BelongsToGetAssociationMixin<Project>;
  declare project?: NonAttribute<Project>;
  declare getStudy: BelongsToGetAssociationMixin<ResearchStudy>;
  declare study?: NonAttribute<ResearchStudy>;

  // — Associations —
  static associate(models: Record<string, any>) {
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
  StudyVariable.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      project_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id',
        },
      },
      study_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'research_studies',
          key: 'id',
        },
      },
      variable_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      variable_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      item_key: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      value: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      participant_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      source_template: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      source_version: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      source_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      value_hash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      entry_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      is_pool: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      confidence: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      scope: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'study',
      },
      discovery_artifact_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      stale: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      extracted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
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
      tableName: 'study_variables',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return StudyVariable;
};

export type { StudyVariable };

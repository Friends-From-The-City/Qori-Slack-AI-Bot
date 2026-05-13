// models/research_plan.ts

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
import type { ResearchStudy } from './research_study';

class ResearchPlan extends Model<
  InferAttributes<ResearchPlan>,
  InferCreationAttributes<ResearchPlan>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_id: ForeignKey<number>;
  declare study_name: string;
  declare filename: string;
  declare file_path: string | null;
  declare file_url: string | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
  declare created_by: string;

  // — Association mixins —
  declare getStudy: BelongsToGetAssociationMixin<ResearchStudy>;
  declare study?: NonAttribute<ResearchStudy>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'study_id',
      as: 'study',
      onDelete: 'CASCADE',
    });
  }
}

module.exports = (sequelize: Sequelize) => {
  ResearchPlan.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      study_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'research_studies',
          key: 'id',
        },
      },
      study_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      filename: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      file_path: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      file_url: {
        type: DataTypes.STRING(1000),
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
      created_by: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: 'research_plans',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return ResearchPlan;
};

export type { ResearchPlan };

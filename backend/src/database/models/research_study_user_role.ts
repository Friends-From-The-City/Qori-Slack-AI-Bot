// models/research_study_user_role.ts

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

class ResearchStudyUserRole extends Model<
  InferAttributes<ResearchStudyUserRole>,
  InferCreationAttributes<ResearchStudyUserRole>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare research_id: ForeignKey<number>;
  declare user_id: string;
  declare role: string;
  declare created_at: CreationOptional<Date>;

  // — Association mixins —
  declare getStudy: BelongsToGetAssociationMixin<ResearchStudy>;
  declare study?: NonAttribute<ResearchStudy>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'research_id',
      as: 'study',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  ResearchStudyUserRole.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      research_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'research_studies',
          key: 'id',
        },
      },
      user_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'research_study_user_roles',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return ResearchStudyUserRole;
};

export type { ResearchStudyUserRole };

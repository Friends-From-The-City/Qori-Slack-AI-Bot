// models/slack_user_state.ts

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
import type { Project } from './project';

class SlackUserState extends Model<
  InferAttributes<SlackUserState>,
  InferCreationAttributes<SlackUserState>
> {
  // — Attributes —
  declare slack_user_id: string;
  declare active_study_id: ForeignKey<number | null>;
  declare active_project_id: ForeignKey<number | null>;
  declare onboarded_at: Date | null;
  declare updated_at: CreationOptional<Date>;

  // — Association mixins —
  declare getActiveStudy: BelongsToGetAssociationMixin<ResearchStudy>;
  declare activeStudy?: NonAttribute<ResearchStudy>;
  declare getActiveProject: BelongsToGetAssociationMixin<Project>;
  declare activeProject?: NonAttribute<Project>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'active_study_id',
      as: 'activeStudy',
      onDelete: 'SET NULL',
    });
    this.belongsTo(models.Project, {
      foreignKey: 'active_project_id',
      as: 'activeProject',
      onDelete: 'SET NULL',
    });
  }
}

export default (sequelize: Sequelize) => {
  SlackUserState.init(
    {
      slack_user_id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      active_study_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'research_studies',
          key: 'id',
        },
      },
      active_project_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'projects',
          key: 'id',
        },
      },
      onboarded_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'slack_user_state',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return SlackUserState;
};

export type { SlackUserState };

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

class SlackUserState extends Model<
  InferAttributes<SlackUserState>,
  InferCreationAttributes<SlackUserState>
> {
  // — Attributes —
  declare slack_user_id: string;
  declare active_study_id: ForeignKey<number | null>;
  declare onboarded_at: Date | null;
  declare updated_at: CreationOptional<Date>;

  // — Association mixins —
  declare getActiveStudy: BelongsToGetAssociationMixin<ResearchStudy>;
  declare activeStudy?: NonAttribute<ResearchStudy>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'active_study_id',
      as: 'activeStudy',
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

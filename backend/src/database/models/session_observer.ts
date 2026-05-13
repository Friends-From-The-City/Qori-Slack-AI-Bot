// models/session_observer.ts

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
import type { StudyParticipant } from './study_participant';
import type { ObserverRole, ObserverStatus, ObserverJoinedVia } from '../../types/common';

class SessionObserver extends Model<
  InferAttributes<SessionObserver>,
  InferCreationAttributes<SessionObserver>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_id: ForeignKey<number>;
  declare participant_id: ForeignKey<number | null>;
  declare session_id: string;
  /** JSONB array of Slack user IDs. Custom getter ensures always array. */
  declare requester_id: string[];
  /** JSONB array of display names. Custom getter ensures always array. */
  declare requester_name: string[];
  declare role: ObserverRole;
  declare reason: string | null;
  declare status: CreationOptional<ObserverStatus>;
  declare joined_via: ObserverJoinedVia | null;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare guidelines_sent: CreationOptional<boolean>;
  declare guidelines_sent_at: Date | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // — Association mixins —
  declare getStudy: BelongsToGetAssociationMixin<ResearchStudy>;
  declare study?: NonAttribute<ResearchStudy>;
  declare getParticipant: BelongsToGetAssociationMixin<StudyParticipant>;
  declare participant?: NonAttribute<StudyParticipant>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'study_id',
      as: 'study',
      onDelete: 'CASCADE',
    });

    this.belongsTo(models.StudyParticipant, {
      foreignKey: 'participant_id',
      as: 'participant',
      onDelete: 'CASCADE',
    });
  }
}

module.exports = (sequelize: Sequelize) => {
  SessionObserver.init(
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
      participant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'study_participants',
          key: 'id',
        },
      },
      session_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      requester_id: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        get(): string[] {
          const value = this.getDataValue('requester_id');
          return Array.isArray(value) ? value : [];
        },
      },
      requester_name: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        get(): string[] {
          const value = this.getDataValue('requester_name');
          return Array.isArray(value) ? value : [];
        },
      },
      role: {
        type: DataTypes.ENUM('note_taker', 'silent_observer', 'pm_observer', 'stakeholder', 'observer'),
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'denied', 'removed', 'confirmed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      joined_via: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      approved_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      guidelines_sent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      guidelines_sent_at: {
        type: DataTypes.DATE,
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
      tableName: 'session_observers',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return SessionObserver;
};

export type { SessionObserver };

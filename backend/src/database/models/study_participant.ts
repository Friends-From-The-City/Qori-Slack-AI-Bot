// models/study_participant.ts

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
import {
  PARTICIPANT_STATUS,
  PARTICIPANT_STATUS_VALUES,
  type ParticipantStatus,
} from '../../constants/participantStatus';
import type { OutreachMethod } from '../../types/common';
import type { ResearchStudy } from './research_study';

class StudyParticipant extends Model<
  InferAttributes<StudyParticipant>,
  InferCreationAttributes<StudyParticipant>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_id: ForeignKey<number>;
  declare participant_name: string;
  declare contact_details: string | null;
  declare recruitment_source: string | null;
  declare scheduled_date: string | null;
  declare scheduled_time: string | null;
  declare status_select: ParticipantStatus | null;
  declare notes_field: string | null;
  declare demographics_info: Record<string, unknown> | null;
  /** DECIMAL(10,2) — model getter coerces to number. See ADR 0014. */
  declare compensation_amount: number | null;
  declare outreach_sent_at: Date | null;
  declare outreach_method: OutreachMethod | null;
  declare outreach_count: CreationOptional<number>;
  declare added_by: string;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

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

  /**
   * Record an outreach event. Auto-advances not_contacted → contacted.
   */
  async recordOutreachSent(method: OutreachMethod = 'email') {
    this.outreach_sent_at = new Date();
    this.outreach_method = method;
    this.outreach_count = (this.outreach_count || 0) + 1;
    this.updated_at = new Date();
    if (this.status_select === PARTICIPANT_STATUS.NOT_CONTACTED) {
      this.status_select = PARTICIPANT_STATUS.CONTACTED;
    }
    await this.save();
  }
}

export default (sequelize: Sequelize) => {
  StudyParticipant.init(
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
      participant_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contact_details: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      recruitment_source: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      scheduled_date: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      scheduled_time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status_select: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: PARTICIPANT_STATUS.CONTACTED,
        validate: {
          isIn: [PARTICIPANT_STATUS_VALUES as unknown as string[]],
        },
      },
      notes_field: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      demographics_info: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      compensation_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        get() {
          const raw = this.getDataValue('compensation_amount');
          return raw === null || raw === undefined ? null : parseFloat(raw as unknown as string);
        },
      },
      outreach_sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      outreach_method: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: [['email', 'slack', 'phone', 'other']],
        },
      },
      outreach_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      added_by: {
        type: DataTypes.STRING,
        allowNull: false,
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
      tableName: 'study_participants',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return StudyParticipant;
};

export type { StudyParticipant };

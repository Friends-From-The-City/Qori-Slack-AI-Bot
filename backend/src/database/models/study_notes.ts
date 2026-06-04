// models/study_notes.ts

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

class StudyNotes extends Model<
  InferAttributes<StudyNotes>,
  InferCreationAttributes<StudyNotes>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_id: ForeignKey<number>;
  declare participant_id: ForeignKey<number | null>;
  declare study_name: string;
  declare filename: string;
  declare file_path: string | null;
  declare file_url: string | null;
  declare transcript: CreationOptional<boolean>;
  declare session_date: Date | null;
  declare session_time: string | null;  // TIME type stored as string in JS
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
  declare created_by: string;

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
      onDelete: 'SET NULL',
    });
  }
}

export default (sequelize: Sequelize) => {
  StudyNotes.init(
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
      study_name: {
        type: DataTypes.STRING(500),
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
      transcript: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      session_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      session_time: {
        type: DataTypes.TIME,
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
      tableName: 'study_notes',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return StudyNotes;
};

export type { StudyNotes };

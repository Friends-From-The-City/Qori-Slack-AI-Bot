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

class StudyNotes extends Model<
  InferAttributes<StudyNotes>,
  InferCreationAttributes<StudyNotes>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_id: ForeignKey<number>;
  declare study_name: string;
  declare filename: string;
  declare file_path: string | null;
  declare file_url: string | null;
  declare transcript: CreationOptional<boolean>;
  declare session_date: Date | null;
  declare session_time: string | null;  // TIME type stored as string in JS
  declare participant_name: string | null;
  declare researcher: string | null;
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
      participant_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      researcher: {
        type: DataTypes.STRING,
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

// models/study_status.ts

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';
import type { StudyApprovalStatus } from '../../types/common';

class StudyStatus extends Model<
  InferAttributes<StudyStatus>,
  InferCreationAttributes<StudyStatus>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_name: string | null;
  declare approved_by: string | null;
  declare requested_by: string | null;
  declare reason: string | null;
  declare status: CreationOptional<StudyApprovalStatus>;
  declare path: string | null;
  declare file_name: string | null;
  declare approved_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
  declare created_by: string | null;

  // — Associations —
  static associate() {
    // No associations
  }
}

module.exports = (sequelize: Sequelize) => {
  StudyStatus.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      study_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      approved_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      requested_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('approve', 'rejected', 'need_changes', 'created'),
        allowNull: false,
        defaultValue: 'approve',
      },
      path: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      file_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      approved_at: {
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
        allowNull: true,
      },
    },
    {
      tableName: 'research_status',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return StudyStatus;
};

export type { StudyStatus };

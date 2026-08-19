/**
 * RecordsManagementAssignment Model — GOV-6
 *
 * Assigns records-management lifecycle metadata to canonical records
 * (projects, studies, evidence sources, constructs, artifacts) without
 * forcing every domain table to carry lifecycle fields.
 *
 * Uses polymorphic (record_type, record_public_id) reference.
 * UNIQUE(record_type, record_public_id) — one assignment per canonical record.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
  type BelongsToGetAssociationMixin,
  type Sequelize,
} from 'sequelize';
import type { RecordsSchedule } from './records_schedule';

export type AssignableRecordType =
  | 'project'
  | 'study'
  | 'evidence_source'
  | 'evidence_construct'
  | 'research_artifact';

export type LifecycleStatus =
  | 'active'
  | 'inactive'
  | 'archived'
  | 'disposition_eligible'
  | 'on_hold'
  | 'transferred'
  | 'disposed';

class RecordsManagementAssignment extends Model<
  InferAttributes<RecordsManagementAssignment>,
  InferCreationAttributes<RecordsManagementAssignment>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare project_id: number;
  declare record_type: AssignableRecordType;
  declare record_public_id: string;
  declare records_schedule_id: number | null;
  declare schedule_item: string | null;
  declare record_series: string | null;
  declare cutoff_at: Date | null;
  declare retention_start_at: Date | null;
  declare eligible_disposition_at: Date | null;
  declare lifecycle_status: CreationOptional<LifecycleStatus>;
  declare assigned_by: string | null;
  declare assigned_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // Association mixins
  declare getRecordsSchedule: BelongsToGetAssociationMixin<RecordsSchedule>;
  declare schedule?: NonAttribute<RecordsSchedule>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.RecordsSchedule, {
      foreignKey: 'records_schedule_id',
      as: 'schedule',
    });
    this.belongsTo(models.Project, {
      foreignKey: 'project_id',
      as: 'project',
    });
  }
}

export default (sequelize: Sequelize) => {
  RecordsManagementAssignment.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      project_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      record_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [['project', 'study', 'evidence_source', 'evidence_construct', 'research_artifact']],
        },
      },
      record_public_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      records_schedule_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      schedule_item: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      record_series: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      cutoff_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      retention_start_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      eligible_disposition_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lifecycle_status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'active',
        validate: {
          isIn: [['active', 'inactive', 'archived', 'disposition_eligible', 'on_hold', 'transferred', 'disposed']],
        },
      },
      assigned_by: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      assigned_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'records_management_assignments',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return RecordsManagementAssignment;
};

export type { RecordsManagementAssignment };

/**
 * RecordsSchedule Model — GOV-6
 *
 * Provider-neutral records schedule model. Stores NARA GRS citations,
 * agency-specific schedule citations, or other authority references.
 *
 * Qori enforces assigned records authority but does not invent schedules.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

export type AuthorityType = 'grs' | 'agency_schedule' | 'other_authority';
export type RecordValue = 'temporary' | 'permanent';
export type ScheduleDispositionAction = 'destroy' | 'transfer' | 'review';

class RecordsSchedule extends Model<
  InferAttributes<RecordsSchedule>,
  InferCreationAttributes<RecordsSchedule>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare authority_type: AuthorityType;
  declare authority_code: string;
  declare title: string;
  declare description: string | null;
  declare record_value: RecordValue;
  declare retention_trigger: string;
  declare retention_period_days: number | null;
  declare disposition_action: ScheduleDispositionAction;
  declare transfer_instructions: string | null;
  declare effective_date: string | null;
  declare superseded_date: string | null;
  declare source_url: string | null;
  declare created_at: CreationOptional<Date>;
}

export default (sequelize: Sequelize) => {
  RecordsSchedule.init(
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
      authority_type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          isIn: [['grs', 'agency_schedule', 'other_authority']],
        },
      },
      authority_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      record_value: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: [['temporary', 'permanent']],
        },
      },
      retention_trigger: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      retention_period_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      disposition_action: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: [['destroy', 'transfer', 'review']],
        },
      },
      transfer_instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      effective_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      superseded_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      source_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'records_schedules',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return RecordsSchedule;
};

export type { RecordsSchedule };

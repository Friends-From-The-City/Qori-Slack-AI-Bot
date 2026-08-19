/**
 * RecordsDispositionEvent Model — GOV-6
 *
 * Append-only audit trail for disposition actions on records.
 * RESTRICT on assignment FK — cannot delete assignment that has disposition history.
 * No PII or record content in details JSONB.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

export type DispositionEventAction = 'destroy' | 'transfer' | 'preserve' | 'cancel';
export type DispositionEventOutcome = 'completed' | 'blocked' | 'manual_review_required' | 'failed';

class RecordsDispositionEvent extends Model<
  InferAttributes<RecordsDispositionEvent>,
  InferCreationAttributes<RecordsDispositionEvent>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare assignment_id: number;
  declare action: DispositionEventAction;
  declare authority_code: string;
  declare schedule_item: string | null;
  declare outcome: DispositionEventOutcome;
  declare actor: string;
  declare executed_at: CreationOptional<Date>;
  declare details: Record<string, unknown>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.RecordsManagementAssignment, {
      foreignKey: 'assignment_id',
      as: 'assignment',
    });
  }
}

export default (sequelize: Sequelize) => {
  RecordsDispositionEvent.init(
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
      assignment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      action: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: [['destroy', 'transfer', 'preserve', 'cancel']],
        },
      },
      authority_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      schedule_item: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      outcome: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          isIn: [['completed', 'blocked', 'manual_review_required', 'failed']],
        },
      },
      actor: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      executed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      details: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: 'records_disposition_events',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return RecordsDispositionEvent;
};

export type { RecordsDispositionEvent };

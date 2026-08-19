/**
 * RecordsHold Model — GOV-6
 *
 * Preservation holds that block disposition of records within a project.
 * A project-level hold blocks ALL records in that project.
 * Specific record holds are tracked via records_hold_targets.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type HasManyGetAssociationsMixin,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { RecordsHoldTarget } from './records_hold_target';

export type HoldType = 'legal' | 'litigation' | 'audit' | 'investigation' | 'records_freeze';
export type HoldStatus = 'active' | 'released';

class RecordsHold extends Model<
  InferAttributes<RecordsHold>,
  InferCreationAttributes<RecordsHold>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare project_id: number;
  declare hold_type: HoldType;
  declare title: string;
  declare reason: string | null;
  declare status: CreationOptional<HoldStatus>;
  declare issued_by: string;
  declare issued_at: CreationOptional<Date>;
  declare released_by: string | null;
  declare released_at: Date | null;
  declare external_reference: string | null;
  declare created_at: CreationOptional<Date>;

  // Association mixins
  declare getTargets: HasManyGetAssociationsMixin<RecordsHoldTarget>;
  declare targets?: NonAttribute<RecordsHoldTarget[]>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Project, {
      foreignKey: 'project_id',
      as: 'project',
    });
    this.hasMany(models.RecordsHoldTarget, {
      foreignKey: 'hold_id',
      as: 'targets',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  RecordsHold.init(
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
      hold_type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          isIn: [['legal', 'litigation', 'audit', 'investigation', 'records_freeze']],
        },
      },
      title: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        validate: {
          isIn: [['active', 'released']],
        },
      },
      issued_by: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      issued_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      released_by: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      released_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      external_reference: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'records_holds',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return RecordsHold;
};

export type { RecordsHold };

/**
 * RecordsHoldTarget Model — GOV-6
 *
 * Links a records hold to specific canonical records.
 * UNIQUE(hold_id, target_type, target_public_id) prevents duplicates.
 * ON DELETE CASCADE from parent hold.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

class RecordsHoldTarget extends Model<
  InferAttributes<RecordsHoldTarget>,
  InferCreationAttributes<RecordsHoldTarget>
> {
  declare id: CreationOptional<number>;
  declare hold_id: number;
  declare target_type: string;
  declare target_public_id: string;
  declare created_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.RecordsHold, {
      foreignKey: 'hold_id',
      as: 'hold',
    });
  }
}

export default (sequelize: Sequelize) => {
  RecordsHoldTarget.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      hold_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      target_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      target_public_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'records_hold_targets',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return RecordsHoldTarget;
};

export type { RecordsHoldTarget };

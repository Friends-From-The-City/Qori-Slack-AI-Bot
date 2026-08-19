// models/actor.ts
//
// PLAT-2: Canonical actor identity — interface-independent user.
// See ADR 0042.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';
import { randomUUID } from 'crypto';

export type ActorStatus = 'active' | 'inactive';

class Actor extends Model<
  InferAttributes<Actor>,
  InferCreationAttributes<Actor>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare organization_id: ForeignKey<number>;
  declare display_name: string | null;
  declare status: CreationOptional<ActorStatus>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization', onDelete: 'CASCADE' });
    this.hasMany(models.ActorIdentity, { foreignKey: 'actor_id', as: 'identities', onDelete: 'CASCADE' });
    this.hasMany(models.ProjectMembership, { foreignKey: 'actor_id', as: 'memberships', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  Actor.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        defaultValue: () => randomUUID(),
      },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      display_name: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'inactive']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'actors', underscored: true, timestamps: false, sequelize },
  );

  return Actor;
};

export type { Actor };

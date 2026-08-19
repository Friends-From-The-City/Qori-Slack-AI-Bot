// models/team.ts
//
// PLAT-2: Team within organization.
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

export type TeamStatus = 'active' | 'inactive';

class Team extends Model<
  InferAttributes<Team>,
  InferCreationAttributes<Team>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare organization_id: ForeignKey<number>;
  declare slug: string;
  declare name: string;
  declare status: CreationOptional<TeamStatus>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization', onDelete: 'CASCADE' });
    this.hasMany(models.Project, { foreignKey: 'team_id', as: 'projects', onDelete: 'SET NULL' });
  }
}

export default (sequelize: Sequelize) => {
  Team.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        defaultValue: () => randomUUID(),
      },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      slug: { type: DataTypes.TEXT, allowNull: false },
      name: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'inactive']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'teams', underscored: true, timestamps: false, sequelize },
  );

  return Team;
};

export type { Team };

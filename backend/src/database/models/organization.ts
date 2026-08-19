// models/organization.ts
//
// PLAT-2: Canonical organization entity — top-level tenant boundary.
// See ADR 0042.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';
import { randomUUID } from 'crypto';

export type OrganizationStatus = 'active' | 'inactive';

class Organization extends Model<
  InferAttributes<Organization>,
  InferCreationAttributes<Organization>
> {
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare slug: string;
  declare name: string;
  declare status: CreationOptional<OrganizationStatus>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.hasMany(models.Team, { foreignKey: 'organization_id', as: 'teams', onDelete: 'CASCADE' });
    this.hasMany(models.Actor, { foreignKey: 'organization_id', as: 'actors', onDelete: 'CASCADE' });
    this.hasMany(models.Project, { foreignKey: 'organization_id', as: 'projects', onDelete: 'SET NULL' });
    this.hasMany(models.AdapterWorkspaceBinding, { foreignKey: 'organization_id', as: 'workspaceBindings', onDelete: 'CASCADE' });
    this.hasMany(models.RepositoryBinding, { foreignKey: 'organization_id', as: 'repositoryBindings', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  Organization.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        defaultValue: () => randomUUID(),
      },
      slug: { type: DataTypes.TEXT, allowNull: false, unique: true },
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
    { tableName: 'organizations', underscored: true, timestamps: false, sequelize },
  );

  return Organization;
};

export type { Organization };

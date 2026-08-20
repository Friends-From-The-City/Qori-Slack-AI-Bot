// models/organization_membership.ts
//
// WS-0: Organization-level membership and roles.
// Separate from project_memberships — a project owner does NOT
// automatically get organization admin authority.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';

export type OrganizationMembershipRole = 'owner' | 'admin' | 'member';

class OrganizationMembership extends Model<
  InferAttributes<OrganizationMembership>,
  InferCreationAttributes<OrganizationMembership>
> {
  declare id: CreationOptional<number>;
  declare organization_id: ForeignKey<number>;
  declare actor_id: ForeignKey<number>;
  declare role: CreationOptional<OrganizationMembershipRole>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization', onDelete: 'CASCADE' });
    this.belongsTo(models.Actor, { foreignKey: 'actor_id', as: 'actor', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  OrganizationMembership.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: { type: DataTypes.INTEGER, allowNull: false },
      actor_id: { type: DataTypes.INTEGER, allowNull: false },
      role: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'member',
        validate: { isIn: [['owner', 'admin', 'member']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'organization_memberships', underscored: true, timestamps: false, sequelize },
  );

  return OrganizationMembership;
};

export type { OrganizationMembership };

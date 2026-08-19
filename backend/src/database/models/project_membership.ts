// models/project_membership.ts
//
// PLAT-2: Actor-based project membership (replaces Slack-specific project_members
// for authorization in multi-tenant context). See ADR 0042.
//
// The existing project_members table is preserved for backward compatibility
// during the transition period. project_memberships is the canonical
// actor-based membership table.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type Sequelize,
} from 'sequelize';

export type ProjectMembershipRole = 'owner' | 'admin' | 'researcher';

class ProjectMembership extends Model<
  InferAttributes<ProjectMembership>,
  InferCreationAttributes<ProjectMembership>
> {
  declare id: CreationOptional<number>;
  declare project_id: ForeignKey<number>;
  declare actor_id: ForeignKey<number>;
  declare role: CreationOptional<ProjectMembershipRole>;
  declare created_at: CreationOptional<Date>;

  static associate(models: Record<string, any>) {
    this.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project', onDelete: 'CASCADE' });
    this.belongsTo(models.Actor, { foreignKey: 'actor_id', as: 'actor', onDelete: 'CASCADE' });
  }
}

export default (sequelize: Sequelize) => {
  ProjectMembership.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: { type: DataTypes.INTEGER, allowNull: false },
      actor_id: { type: DataTypes.INTEGER, allowNull: false },
      role: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'researcher',
        validate: { isIn: [['owner', 'admin', 'researcher']] },
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
    },
    { tableName: 'project_memberships', underscored: true, timestamps: false, sequelize },
  );

  return ProjectMembership;
};

export type { ProjectMembership };

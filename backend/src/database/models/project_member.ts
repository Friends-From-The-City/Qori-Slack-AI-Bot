// models/project_member.ts
//
// Per ADR 0024: Project-Level Authorization Model
// Tracks project membership for authorization enforcement.

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type NonAttribute,
  type BelongsToGetAssociationMixin,
  type Sequelize,
} from 'sequelize';
import type { Project } from './project';

/**
 * Membership role values.
 * - owner: Project creator, can delete project
 * - member: Can access all studies in project
 */
export type MembershipRole = 'owner' | 'member';

/**
 * Source tracking for membership grants.
 * - creator: Project/study creator (bootstrap seed)
 * - channel: Auto-added via Slack channel membership
 * - explicit: Manual add via "Add Team Member" action
 * - migrated: Existing collaborator from research_study_user_roles (bootstrap)
 */
export type MembershipSource = 'creator' | 'channel' | 'explicit' | 'migrated';

class ProjectMember extends Model<
  InferAttributes<ProjectMember>,
  InferCreationAttributes<ProjectMember>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare project_id: ForeignKey<number>;
  declare user_id: string;
  declare role: CreationOptional<MembershipRole>;
  declare source: CreationOptional<MembershipSource>;
  declare added_at: CreationOptional<Date>;

  // — Association mixins —
  declare getProject: BelongsToGetAssociationMixin<Project>;
  declare project?: NonAttribute<Project>;

  // — Associations —
  static associate(models: Record<string, unknown>) {
    this.belongsTo(models.Project as typeof Project, {
      foreignKey: 'project_id',
      as: 'project',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  ProjectMember.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      project_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id',
        },
      },
      user_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'member',
        validate: {
          isIn: [['owner', 'member']],
        },
      },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'explicit',
        validate: {
          isIn: [['creator', 'channel', 'explicit', 'migrated']],
        },
      },
      added_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'project_members',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return ProjectMember;
};

export type { ProjectMember };

// models/project.ts

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
  type NonAttribute,
  type HasManyGetAssociationsMixin,
  type HasManyAddAssociationMixin,
  type HasManyCountAssociationsMixin,
  type Sequelize,
} from 'sequelize';
import type { ResearchStudy } from './research_study';

/**
 * Project status values.
 * - active: Currently being worked on
 * - completed: Research finished, artifacts finalized
 * - archived: No longer active, preserved for reference
 */
export type ProjectStatus = 'active' | 'completed' | 'archived';

class Project extends Model<
  InferAttributes<Project>,
  InferCreationAttributes<Project>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare name: string;
  declare slug: string;
  declare description: string | null;
  declare problem_statement: string | null;
  declare status: CreationOptional<ProjectStatus>;
  declare created_by: string;
  declare channel_id: string | null;
  declare team_slug: string | null;
  /** PLAT-2: Organization scope. Required — every project belongs to an org. */
  declare organization_id: ForeignKey<number>;
  /** PLAT-2: Team scope within organization. */
  declare team_id: ForeignKey<number> | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // — Association mixins —
  declare getStudies: HasManyGetAssociationsMixin<ResearchStudy>;
  declare addStudy: HasManyAddAssociationMixin<ResearchStudy, number>;
  declare countStudies: HasManyCountAssociationsMixin;
  declare studies?: NonAttribute<ResearchStudy[]>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.hasMany(models.ResearchStudy, {
      foreignKey: 'project_id',
      as: 'studies',
      onDelete: 'CASCADE',
    });

    this.hasMany(models.ProjectMember, {
      foreignKey: 'project_id',
      as: 'members',
      onDelete: 'CASCADE',
    });

    // PLAT-2: Organization/team scope
    this.belongsTo(models.Organization, {
      foreignKey: 'organization_id',
      as: 'organization',
      onDelete: 'CASCADE',
    });

    this.belongsTo(models.Team, {
      foreignKey: 'team_id',
      as: 'team',
      onDelete: 'SET NULL',
    });

    this.hasMany(models.ProjectMembership, {
      foreignKey: 'project_id',
      as: 'actorMemberships',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  Project.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      problem_statement: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        validate: {
          isIn: [['active', 'completed', 'archived']],
        },
      },
      created_by: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      channel_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      team_slug: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      organization_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      team_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'projects',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return Project;
};

export type { Project };

// models/research_study.ts

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
  type BelongsToGetAssociationMixin,
  type Sequelize,
} from 'sequelize';
import type { Project } from './project';
import type { StudyParticipant } from './study_participant';
import type { ResearchStudyUserRole } from './research_study_user_role';
import type { StudyNotes } from './study_notes';
import type { ResearchPlan } from './research_plan';
import type { SessionSummary } from './session_summary';

class ResearchStudy extends Model<
  InferAttributes<ResearchStudy>,
  InferCreationAttributes<ResearchStudy>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare project_id: ForeignKey<number>;
  declare name: string;
  declare slug: string | null;
  declare channel_name: string;
  declare description: string | null;
  declare link: string | null;
  declare path: string | null;
  declare sha4: string | null;
  declare created_by: string;
  declare researcher_name: string;
  declare researcher_email: string;
  /** DECIMAL(10,2) — model getter coerces to number. See ADR 0014. */
  declare parsed_budget_amount: number | null;
  /** IANA timezone identifier for session times. Default: America/New_York (VA HQ). */
  declare session_timezone: CreationOptional<string>;
  declare target_participants: number | null;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // — Association mixins (participants) —
  declare getParticipants: HasManyGetAssociationsMixin<StudyParticipant>;
  declare addParticipant: HasManyAddAssociationMixin<StudyParticipant, number>;
  declare countParticipants: HasManyCountAssociationsMixin;
  declare participants?: NonAttribute<StudyParticipant[]>;

  // — Association mixins (project) —
  declare getProject: BelongsToGetAssociationMixin<Project>;
  declare project?: NonAttribute<Project>;

  // — Association mixins (other associations) —
  declare getUserRoles: HasManyGetAssociationsMixin<ResearchStudyUserRole>;
  declare userRoles?: NonAttribute<ResearchStudyUserRole[]>;
  declare getStudyNotes: HasManyGetAssociationsMixin<StudyNotes>;
  declare getPlans: HasManyGetAssociationsMixin<ResearchPlan>;
  declare getSessionSummaries: HasManyGetAssociationsMixin<SessionSummary>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.belongsTo(models.Project, {
      foreignKey: 'project_id',
      as: 'project',
      onDelete: 'CASCADE',
    });

    this.hasMany(models.ResearchStudyUserRole, {
      foreignKey: 'research_id',
      as: 'userRoles',
      onDelete: 'CASCADE',
    });

    this.hasMany(models.StudyParticipant, {
      foreignKey: 'study_id',
      as: 'participants',
      onDelete: 'CASCADE',
    });

    this.hasMany(models.StudyNotes, {
      foreignKey: 'study_id',
      as: 'studyNotes',
      onDelete: 'CASCADE',
    });

    this.hasMany(models.ResearchPlan, {
      foreignKey: 'study_id',
      as: 'plans',
      onDelete: 'CASCADE',
    });

    this.hasMany(models.SessionSummary, {
      foreignKey: 'study_id',
      as: 'sessionSummaries',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  ResearchStudy.init(
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
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      channel_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      link: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      path: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sha4: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      researcher_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      researcher_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      parsed_budget_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        get() {
          const raw = this.getDataValue('parsed_budget_amount');
          return raw === null || raw === undefined ? null : parseFloat(raw as unknown as string);
        },
      },
      target_participants: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      session_timezone: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'America/New_York',
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
      tableName: 'research_studies',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return ResearchStudy;
};

export type { ResearchStudy };

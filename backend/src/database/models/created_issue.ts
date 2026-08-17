// models/created_issue.ts

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
import type { ResearchStudy } from './research_study';

class CreatedIssue extends Model<
  InferAttributes<CreatedIssue>,
  InferCreationAttributes<CreatedIssue>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare public_id: CreationOptional<string>;
  declare study_id: ForeignKey<number>;
  declare audience: string;
  /** Stable upstream identity: ticket candidate ID (e.g., "design-ticket-001").
   * Transitional — will be augmented/replaced by canonical recommendation ID
   * when the structured implementation handoff model is built. */
  declare ticket_id: string;
  declare github_issue_number: CreationOptional<number | null>;
  declare github_url: CreationOptional<string | null>;
  declare github_repo: string;
  declare created_by: string;
  /** pending = reserved before GitHub call; created = issue exists; failed = GitHub call failed */
  declare status: CreationOptional<string>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;

  // — Association mixins —
  declare getStudy: BelongsToGetAssociationMixin<ResearchStudy>;
  declare study?: NonAttribute<ResearchStudy>;

  // — Associations —
  static associate(models: Record<string, any>) {
    this.belongsTo(models.ResearchStudy, {
      foreignKey: 'study_id',
      as: 'study',
      onDelete: 'CASCADE',
    });
  }
}

export default (sequelize: Sequelize) => {
  CreatedIssue.init(
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
      study_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'research_studies',
          key: 'id',
        },
      },
      audience: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      ticket_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      github_issue_number: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      github_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      github_repo: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'created',
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
      tableName: 'created_issues',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return CreatedIssue;
};

export type { CreatedIssue };

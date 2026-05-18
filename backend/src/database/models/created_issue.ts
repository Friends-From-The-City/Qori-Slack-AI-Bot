// models/created_issue.ts

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

class CreatedIssue extends Model<
  InferAttributes<CreatedIssue>,
  InferCreationAttributes<CreatedIssue>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_name: string;
  declare audience: string;
  declare ticket_id: string;
  declare github_issue_number: number;
  declare github_url: string;
  declare github_repo: string;
  declare created_by: string;
  declare created_at: CreationOptional<Date>;
}

export default (sequelize: Sequelize) => {
  CreatedIssue.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      study_name: {
        type: DataTypes.STRING,
        allowNull: false,
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
        allowNull: false,
      },
      github_url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      github_repo: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: {
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

// models/study_variable.ts

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

class StudyVariable extends Model<
  InferAttributes<StudyVariable>,
  InferCreationAttributes<StudyVariable>
> {
  // — Attributes —
  declare id: CreationOptional<number>;
  declare study_name: string;
  declare variable_key: string;
  declare variable_type: string | null;
  declare item_key: string | null;
  declare value: unknown;
  declare participant_id: string | null;
  declare source_template: string;
  declare source_version: string | null;
  declare source_date: Date | null;
  declare value_hash: string | null;
  declare entry_count: number | null;
  declare is_pool: CreationOptional<boolean>;
  declare confidence: string | null;
  declare scope: CreationOptional<string | null>;
  declare discovery_artifact_id: string | null;
  declare stale: CreationOptional<boolean>;
  declare extracted_at: CreationOptional<Date>;
  declare created_at: CreationOptional<Date>;
  declare updated_at: CreationOptional<Date>;
}

module.exports = (sequelize: Sequelize) => {
  StudyVariable.init(
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
      variable_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      variable_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      item_key: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      value: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      participant_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      source_template: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      source_version: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      source_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      value_hash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      entry_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      is_pool: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      confidence: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      scope: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'study',
      },
      discovery_artifact_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      stale: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      extracted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
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
      tableName: 'study_variables',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return StudyVariable;
};

export type { StudyVariable };

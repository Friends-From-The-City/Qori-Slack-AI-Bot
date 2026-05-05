const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class StudyVariable extends Model {}

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
        comment: 'Variable type name (e.g., atomic_nugget_core, target_barriers)',
      },
      variable_type: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Semantic type from schema (pool, object, array)',
      },
      item_key: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'For pool items: unique item ID. NULL for singletons.',
      },
      value: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'The actual variable data',
      },
      participant_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'For per-participant pools: PT-XXX',
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
    }
  );

  return StudyVariable;
};

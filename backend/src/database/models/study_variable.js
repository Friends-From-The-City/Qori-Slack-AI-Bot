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
      },
      variable_type: {
        type: DataTypes.STRING,
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

const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class CreatedIssue extends Model {}

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
    }
  );

  return CreatedIssue;
};

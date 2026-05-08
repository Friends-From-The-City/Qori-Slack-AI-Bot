const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class SlackUserState extends Model {
    static associate(models) {
      this.belongsTo(models.ResearchStudy, {
        foreignKey: 'active_study_id',
        as: 'activeStudy',
        onDelete: 'SET NULL',
      });
    }
  }

  SlackUserState.init(
    {
      slack_user_id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      active_study_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      onboarded_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'slack_user_state',
      underscored: true,
      timestamps: false,
      sequelize,
    }
  );

  return SlackUserState;
};

'use strict';

/**
 * Tracks per-Slack-user state: active study selection and onboarding status.
 * Keyed by Slack user ID (not the boilerplate users table) because Slack
 * user identity is the primary key across all Qori commands.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('slack_user_state', {
      slack_user_id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
        comment: 'Slack user ID (e.g., U01ABC123)',
      },
      active_study_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'research_studies',
          key: 'id',
        },
        onDelete: 'SET NULL',
        comment: 'Currently selected study; pre-fills dropdowns across commands',
      },
      onboarded_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'NULL = first run; set on /qori-learn completion',
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('slack_user_state', ['active_study_id'], {
      name: 'idx_slack_user_state_active_study',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('slack_user_state');
  },
};

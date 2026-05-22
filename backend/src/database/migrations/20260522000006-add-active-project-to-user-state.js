'use strict';

/**
 * Migration 7: Add active_project_id FK to slack_user_state
 *
 * Tracks which project a user is currently working in.
 * Used when commands are run outside project-bound channels.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('slack_user_state', 'active_project_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('slack_user_state', ['active_project_id'], {
      name: 'idx_user_state_project',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('slack_user_state', 'idx_user_state_project');
    await queryInterface.removeColumn('slack_user_state', 'active_project_id');
  },
};

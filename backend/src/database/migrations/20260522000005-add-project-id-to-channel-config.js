'use strict';

/**
 * Migration 6: Add project_id FK to channel_config
 *
 * Establishes channel-project binding. The relationship is one channel → one project;
 * some channels may not be project-bound (project_id NULL).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('channel_config', 'project_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('channel_config', ['project_id'], {
      name: 'idx_channel_config_project',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('channel_config', 'idx_channel_config_project');
    await queryInterface.removeColumn('channel_config', 'project_id');
  },
};

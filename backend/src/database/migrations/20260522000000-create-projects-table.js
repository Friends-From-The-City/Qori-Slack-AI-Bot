'use strict';

/**
 * Migration 1: Create projects table
 *
 * Projects are the new primary container for research initiatives.
 * Each project contains one or more studies and groups all artifacts.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('projects', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
      },
      created_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      channel_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      team_slug: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Partial unique index: only one project per channel when bound
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_projects_channel
      ON projects(channel_id)
      WHERE channel_id IS NOT NULL
    `);

    await queryInterface.addIndex('projects', ['team_slug'], {
      name: 'idx_projects_team',
    });

    await queryInterface.addIndex('projects', ['status'], {
      name: 'idx_projects_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('projects');
  },
};

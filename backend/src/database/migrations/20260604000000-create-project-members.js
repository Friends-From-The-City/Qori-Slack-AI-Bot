'use strict';

/**
 * Migration: Create project_members table + bootstrap from existing data
 *
 * Per ADR 0024: Project-Level Authorization Model
 *
 * Bootstrap seeds membership from three sources to avoid locking out
 * existing collaborators when enforcement turns on:
 * 1. Project creators (source='creator', role='owner')
 * 2. Study creators (source='creator', role='member')
 * 3. Existing collaborators from research_study_user_roles (source='migrated', role='member')
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create the project_members table
    await queryInterface.createTable('project_members', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      role: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'member',
      },
      source: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'explicit',
      },
      added_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Unique constraint: one membership per user per project
    await queryInterface.addConstraint('project_members', {
      fields: ['project_id', 'user_id'],
      type: 'unique',
      name: 'uq_project_members_project_user',
    });

    // Index for lookups by user (e.g., "what projects is this user in?")
    await queryInterface.addIndex('project_members', ['user_id'], {
      name: 'idx_project_members_user',
    });

    // Index for lookups by project (e.g., "who's in this project?")
    await queryInterface.addIndex('project_members', ['project_id'], {
      name: 'idx_project_members_project',
    });

    // Index for reconciliation queries (e.g., "all channel-sourced memberships")
    await queryInterface.addIndex('project_members', ['source'], {
      name: 'idx_project_members_source',
    });

    // 2. Bootstrap: Seed project owners
    await queryInterface.sequelize.query(`
      INSERT INTO project_members (project_id, user_id, role, source, added_at)
      SELECT id, created_by, 'owner', 'creator', CURRENT_TIMESTAMP
      FROM projects
      ON CONFLICT (project_id, user_id) DO NOTHING
    `);

    // 3. Bootstrap: Seed study creators as members (may differ from project owner)
    await queryInterface.sequelize.query(`
      INSERT INTO project_members (project_id, user_id, role, source, added_at)
      SELECT DISTINCT project_id, created_by, 'member', 'creator', CURRENT_TIMESTAMP
      FROM research_studies
      WHERE project_id IS NOT NULL
      ON CONFLICT (project_id, user_id) DO NOTHING
    `);

    // 4. Bootstrap: Seed existing collaborators from research_study_user_roles
    await queryInterface.sequelize.query(`
      INSERT INTO project_members (project_id, user_id, role, source, added_at)
      SELECT DISTINCT rs.project_id, rsur.user_id, 'member', 'migrated', CURRENT_TIMESTAMP
      FROM research_study_user_roles rsur
      JOIN research_studies rs ON rsur.research_id = rs.id
      WHERE rs.project_id IS NOT NULL
      ON CONFLICT (project_id, user_id) DO NOTHING
    `);

    // Log bootstrap results
    const [results] = await queryInterface.sequelize.query(`
      SELECT source, COUNT(*) as count FROM project_members GROUP BY source ORDER BY source
    `);
    console.log('project_members bootstrap complete:', results);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('project_members');
  },
};

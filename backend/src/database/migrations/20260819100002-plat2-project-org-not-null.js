'use strict';

/**
 * PLAT-2 Closeout: Enforce projects.organization_id NOT NULL.
 *
 * Prerequisites (enforced by migration order):
 *   - 20260819100000: Creates organizations table and adds nullable column
 *   - 20260819100001: Backfills all existing projects with default org
 *
 * After backfill, zero projects should have NULL organization_id.
 * This migration verifies that invariant before adding NOT NULL.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Verify zero NULLs before adding constraint
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM projects WHERE organization_id IS NULL`
    );
    const nullCount = parseInt(rows[0].count, 10);
    if (nullCount > 0) {
      throw new Error(
        `Cannot add NOT NULL: ${nullCount} projects have NULL organization_id. ` +
        `Run backfill migration 20260819100001 first.`
      );
    }

    // Change column to NOT NULL
    await queryInterface.changeColumn('projects', 'organization_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert to nullable
    await queryInterface.changeColumn('projects', 'organization_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'SET NULL',
    });
  },
};

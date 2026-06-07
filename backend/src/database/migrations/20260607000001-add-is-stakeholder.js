'use strict';

/**
 * Migration: Add is_stakeholder flag to project_members
 *
 * Stakeholder is a FLAG, not a role. A user can be both owner AND stakeholder.
 * This prevents the lockout bug where assigning stakeholder replaced owner role.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists (may have been added manually during dev)
    const tableInfo = await queryInterface.describeTable('project_members');
    if (!tableInfo.is_stakeholder) {
      await queryInterface.addColumn('project_members', 'is_stakeholder', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('project_members', 'is_stakeholder');
  },
};

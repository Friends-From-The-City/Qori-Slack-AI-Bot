'use strict';

/**
 * Migration: Add problem_statement to projects
 *
 * Project-level field for the researcher's stated problem.
 * Discovery templates derive knowledge_gaps against this,
 * making gap derivation grounded rather than unanchored.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('projects', 'problem_statement', {
      type: Sequelize.TEXT,
      allowNull: true, // Nullable for existing projects; required in modal for new ones
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('projects', 'problem_statement');
  },
};

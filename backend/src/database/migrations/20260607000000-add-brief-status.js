'use strict';

/**
 * Migration: Add brief approval status tracking
 *
 * Supports the brief approval review loop:
 * - brief_status: State machine (pending_approval → changes_requested → approved)
 * - brief_change_feedback: Last feedback from approver (preserved after approval)
 * - brief_reviewer_id: Who reviews (for re-notify on resubmit)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add brief_status column
    await queryInterface.addColumn('research_studies', 'brief_status', {
      type: Sequelize.STRING(20),
      allowNull: true, // NULL = no brief submitted yet
      defaultValue: null,
    });

    // Add brief_change_feedback column
    await queryInterface.addColumn('research_studies', 'brief_change_feedback', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add brief_reviewer_id column
    await queryInterface.addColumn('research_studies', 'brief_reviewer_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    // Index for dashboard queries (e.g., "show all briefs pending approval")
    await queryInterface.addIndex('research_studies', ['brief_status'], {
      name: 'idx_research_studies_brief_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('research_studies', 'idx_research_studies_brief_status');
    await queryInterface.removeColumn('research_studies', 'brief_reviewer_id');
    await queryInterface.removeColumn('research_studies', 'brief_change_feedback');
    await queryInterface.removeColumn('research_studies', 'brief_status');
  },
};

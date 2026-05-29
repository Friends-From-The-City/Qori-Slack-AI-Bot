'use strict';

/**
 * Migration 8: Drop contact_details from study_participants
 *
 * This column was never used (dead PII column). Dropping during restructure.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('study_participants', 'contact_details');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('study_participants', 'contact_details', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },
};

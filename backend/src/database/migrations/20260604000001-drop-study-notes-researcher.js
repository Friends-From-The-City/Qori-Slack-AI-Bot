'use strict';

/**
 * H6 PII remediation: Drop redundant researcher column from study_notes.
 *
 * This column was always populated from research_studies.researcher_name and
 * served no purpose beyond denormalized storage. To get researcher info for
 * a note, join to research_studies via study_id.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('study_notes', 'researcher');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('study_notes', 'researcher', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};

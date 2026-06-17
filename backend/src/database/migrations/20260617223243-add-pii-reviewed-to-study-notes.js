'use strict';

/**
 * Migration: Add pii_reviewed field to study_notes table.
 *
 * Transcripts must pass PII scrubbing + human review before they can be
 * analyzed. This field gates /qori-analyze on reviewed transcripts.
 *
 * - pii_reviewed: boolean, default false
 * - pii_reviewed_at: timestamp when review was approved
 * - pii_reviewed_by: Slack user ID who approved
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('study_notes', 'pii_reviewed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('study_notes', 'pii_reviewed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('study_notes', 'pii_reviewed_by', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('study_notes', 'pii_reviewed');
    await queryInterface.removeColumn('study_notes', 'pii_reviewed_at');
    await queryInterface.removeColumn('study_notes', 'pii_reviewed_by');
  },
};

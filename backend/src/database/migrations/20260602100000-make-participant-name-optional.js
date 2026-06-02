'use strict';

/**
 * Migration: Make participant_name (alias) optional
 *
 * The participant_code is now the identity. The participant_name field
 * becomes an optional alias / memory aid for researchers.
 *
 * See ADR 0020: System-Assigned Per-Study Participant Codes
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('study_participants', 'participant_name', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Backfill any NULLs with the participant_code before making NOT NULL
    await queryInterface.sequelize.query(`
      UPDATE study_participants
      SET participant_name = participant_code
      WHERE participant_name IS NULL
    `);

    await queryInterface.changeColumn('study_participants', 'participant_name', {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};

'use strict';

/**
 * Migration: Add participant_code column to study_participants
 *
 * System-assigned per-study participant codes (PT-001, PT-002, etc.)
 * replace the three-way mismatch between:
 * - Typed name (freeform participant_name)
 * - Derived ID (global auto-increment PT-${database_id})
 * - LLM-guessed values (unstable across re-analysis)
 *
 * See ADR 0020: System-Assigned Per-Study Participant Codes
 *
 * PRE-REQUISITE: Tables must be empty before running this migration.
 * Run TRUNCATE on study_variables, session_observers, study_participants
 * BEFORE applying this migration.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add participant_code column with temporary default
    // (Tables should be empty, but Sequelize requires a default for NOT NULL on add)
    await queryInterface.addColumn('study_participants', 'participant_code', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'PT-000', // Temporary default for column add
    });

    // Remove the default — service layer assigns real values
    await queryInterface.changeColumn('study_participants', 'participant_code', {
      type: Sequelize.STRING(10),
      allowNull: false,
    });

    // Per-study uniqueness constraint
    await queryInterface.addConstraint('study_participants', {
      fields: ['study_id', 'participant_code'],
      type: 'unique',
      name: 'study_participants_study_id_participant_code_key',
    });
  },

  async down(queryInterface) {
    // Remove constraint first
    await queryInterface.removeConstraint(
      'study_participants',
      'study_participants_study_id_participant_code_key'
    );

    // Remove column
    await queryInterface.removeColumn('study_participants', 'participant_code');
  },
};

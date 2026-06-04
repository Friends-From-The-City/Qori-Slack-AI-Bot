'use strict';

/**
 * H6 PII remediation: Refactor study_notes.participant_name to participant_id FK.
 *
 * This eliminates duplicate PII storage and enables proper relational queries.
 * To get participant_name for a note, JOIN to study_participants via participant_id.
 *
 * Note: participant_id is nullable because:
 * 1. Existing notes have no FK (data loss acceptable - H6 is disposable data context)
 * 2. Notes may be created before participant is formally registered
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add participant_id FK (nullable)
    await queryInterface.addColumn('study_notes', 'participant_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'study_participants',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });

    // Drop the denormalized participant_name column
    await queryInterface.removeColumn('study_notes', 'participant_name');
  },

  async down(queryInterface, Sequelize) {
    // Re-add participant_name column
    await queryInterface.addColumn('study_notes', 'participant_name', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Drop participant_id FK
    await queryInterface.removeColumn('study_notes', 'participant_id');
  },
};

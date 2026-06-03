'use strict';

/**
 * R3: Remove denormalized total_participants column.
 *
 * Rationale: Storing a count that can drift is an anti-pattern.
 * The participant rows ARE the count — compute COUNT(*) on read.
 *
 * Benefits:
 * - Single source of truth (no drift possible)
 * - Simpler code (no updateParticipantCount() to maintain)
 * - Already have Sequelize mixin: study.countParticipants()
 *
 * Performance: COUNT on indexed FK is fast; studies have tens of
 * participants, not millions.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('research_studies', 'total_participants');
    console.log('✅ Dropped total_participants column (now computed on read)');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('research_studies', 'total_participants', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },
};

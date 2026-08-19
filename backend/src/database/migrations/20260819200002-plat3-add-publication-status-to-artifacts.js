'use strict';

/**
 * PLAT-3: Add publication_status to research_artifacts.
 *
 * Separates canonical workflow status from external projection state.
 * A GitHub failure transitions publication_status to 'projection_failed'
 * but NEVER changes the canonical workflow status.
 *
 * Additive migration — preserves existing status column semantics.
 * Backfills publication_status from existing status values.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add publication_status column
    await queryInterface.addColumn('research_artifacts', 'publication_status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'not_published',
    });

    // 2. Add CHECK constraint for publication_status
    await queryInterface.sequelize.query(`
      ALTER TABLE research_artifacts ADD CONSTRAINT chk_artifacts_publication_status
        CHECK (publication_status IN ('not_published', 'publishing', 'published', 'projection_failed'));
    `);

    // 3. Backfill publication_status from existing status
    // written → published (was successfully written to GitHub)
    await queryInterface.sequelize.query(`
      UPDATE research_artifacts SET publication_status = 'published'
        WHERE status = 'written';
    `);
    // failed → projection_failed (GitHub write failed)
    await queryInterface.sequelize.query(`
      UPDATE research_artifacts SET publication_status = 'projection_failed'
        WHERE status = 'failed';
    `);
    // pending → not_published (not yet attempted)
    // (already the default, no update needed)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE research_artifacts DROP CONSTRAINT IF EXISTS chk_artifacts_publication_status;
    `);
    await queryInterface.removeColumn('research_artifacts', 'publication_status');
  },
};

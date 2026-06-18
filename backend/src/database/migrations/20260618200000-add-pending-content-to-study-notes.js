'use strict';

/**
 * Add pending_content column to study_notes table.
 *
 * This supports the DB-held quarantine flow for manual notes:
 * - Content is stored in DB (not git) until human approval
 * - On approval, content is written to git for the first time
 * - Git history only contains approved/reviewed content
 *
 * Residual: Transcripts still use git-quarantine until Option 2 (signed URL)
 * is implemented in a future session.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('study_notes', 'pending_content', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Holds unreviewed content until approval. Cleared after git write.',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('study_notes', 'pending_content');
  },
};

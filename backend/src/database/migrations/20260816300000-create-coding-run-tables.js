'use strict';

/**
 * Migration: Create coding run + assignment tables for Slice 2B.
 *
 * survey_coding_runs — versioned coding sessions
 * survey_coding_assignments — response-to-grouping matches
 * survey_coding_entry_reviews — per-entry review completion state
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── survey_coding_runs ────────────────────────────────────
    await queryInterface.createTable('survey_coding_runs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: Sequelize.UUID, allowNull: false, unique: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      evidence_source_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'evidence_sources', key: 'id' }, onDelete: 'CASCADE' },
      codebook_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'survey_codebooks', key: 'id' }, onDelete: 'CASCADE' },
      project_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
      study_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'research_studies', key: 'id' }, onDelete: 'CASCADE' },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'draft' },
      based_on_run_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'survey_coding_runs', key: 'id' }, onDelete: 'SET NULL' },
      generation_metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_by: { type: Sequelize.STRING(50), allowNull: false },
      reviewed_by: { type: Sequelize.STRING(50), allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('survey_coding_runs', {
      fields: ['evidence_source_id', 'codebook_id', 'version'],
      type: 'unique', name: 'uq_coding_run_source_codebook_version',
    });
    await queryInterface.addIndex('survey_coding_runs', ['evidence_source_id'], { name: 'idx_coding_runs_source' });
    await queryInterface.addIndex('survey_coding_runs', ['codebook_id'], { name: 'idx_coding_runs_codebook' });
    await queryInterface.addIndex('survey_coding_runs', ['status'], { name: 'idx_coding_runs_status' });

    // ── survey_coding_assignments ─────────────────────────────
    await queryInterface.createTable('survey_coding_assignments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: Sequelize.UUID, allowNull: false, unique: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      coding_run_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'survey_coding_runs', key: 'id' }, onDelete: 'CASCADE' },
      qualitative_entry_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'survey_qualitative_entries', key: 'id' }, onDelete: 'CASCADE' },
      code_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'survey_codes', key: 'id' }, onDelete: 'CASCADE' },
      origin: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'qori_proposed' },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'proposed' },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      reviewed_by: { type: Sequelize.STRING(50), allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('survey_coding_assignments', {
      fields: ['coding_run_id', 'qualitative_entry_id', 'code_id'],
      type: 'unique', name: 'uq_assignment_run_entry_code',
    });
    await queryInterface.addIndex('survey_coding_assignments', ['coding_run_id'], { name: 'idx_assignments_run' });
    await queryInterface.addIndex('survey_coding_assignments', ['qualitative_entry_id'], { name: 'idx_assignments_entry' });
    await queryInterface.addIndex('survey_coding_assignments', ['code_id'], { name: 'idx_assignments_code' });

    // ── survey_coding_entry_reviews ───────────────────────────
    await queryInterface.createTable('survey_coding_entry_reviews', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      coding_run_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'survey_coding_runs', key: 'id' }, onDelete: 'CASCADE' },
      qualitative_entry_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'survey_qualitative_entries', key: 'id' }, onDelete: 'CASCADE' },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      reviewed_by: { type: Sequelize.STRING(50), allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('survey_coding_entry_reviews', {
      fields: ['coding_run_id', 'qualitative_entry_id'],
      type: 'unique', name: 'uq_entry_review_run_entry',
    });
    await queryInterface.addIndex('survey_coding_entry_reviews', ['coding_run_id'], { name: 'idx_entry_reviews_run' });
    await queryInterface.addIndex('survey_coding_entry_reviews', ['status'], { name: 'idx_entry_reviews_status' });

    console.log('Created survey_coding_runs, survey_coding_assignments, survey_coding_entry_reviews tables');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('survey_coding_entry_reviews');
    await queryInterface.dropTable('survey_coding_assignments');
    await queryInterface.dropTable('survey_coding_runs');
    console.log('Dropped coding run tables');
  },
};

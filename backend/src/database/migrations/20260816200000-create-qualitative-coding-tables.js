'use strict';

/**
 * Migration: Create qualitative coding foundation tables
 *
 * Per Survey Slice 2A: Four tables for governed qualitative evidence,
 * versioned codebooks, codes, and code examples.
 *
 * Privacy: survey_qualitative_entries stores governed text with
 * explicit pii_status. Raw content is model-eligible only after
 * approved privacy disposition (clear or redacted).
 *
 * FK behavior:
 *   - project_id, evidence_source_id: CASCADE
 *   - study_id: CASCADE (nullable for discovery)
 *   - codebook→codes→examples: CASCADE chain
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── survey_qualitative_entries ─────────────────────────────
    await queryInterface.createTable('survey_qualitative_entries', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      evidence_source_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'evidence_sources', key: 'id' },
        onDelete: 'CASCADE',
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      study_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'research_studies', key: 'id' },
        onDelete: 'CASCADE',
      },
      respondent_key: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Canonical respondent identity (declared ID or generated hash)',
      },
      display_respondent_id: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Researcher-facing label (T001, R-101)',
      },
      field_name: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Source open-text field name',
      },
      field_display_name: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Title Case display label',
      },
      entry_text: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Original response text — governed, accessible only via authorized privacy-review path',
      },
      entry_hash: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'SHA-256 of entry_text for deduplication/integrity',
      },
      pii_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'pending | clear | redacted | restricted',
      },
      redacted_text: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Auto-scrubbed or researcher-edited safe derivative',
      },
      pii_reviewed_by: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      pii_reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      source_row_index: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addConstraint('survey_qualitative_entries', {
      fields: ['evidence_source_id', 'respondent_key', 'field_name'],
      type: 'unique',
      name: 'uq_qual_entry_source_respondent_field',
    });
    await queryInterface.addIndex('survey_qualitative_entries', ['evidence_source_id'], { name: 'idx_qual_entries_source' });
    await queryInterface.addIndex('survey_qualitative_entries', ['project_id'], { name: 'idx_qual_entries_project' });
    await queryInterface.addIndex('survey_qualitative_entries', ['pii_status'], { name: 'idx_qual_entries_pii_status' });

    // ── survey_codebooks ──────────────────────────────────────
    await queryInterface.createTable('survey_codebooks', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      evidence_source_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'evidence_sources', key: 'id' },
        onDelete: 'CASCADE',
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      study_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'research_studies', key: 'id' },
        onDelete: 'CASCADE',
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'draft',
        comment: 'draft | under_review | accepted | superseded',
      },
      method: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'structured_qualitative_content_analysis',
      },
      based_on_codebook_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'survey_codebooks', key: 'id' },
        onDelete: 'SET NULL',
      },
      generation_metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      created_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      reviewed_by: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addConstraint('survey_codebooks', {
      fields: ['evidence_source_id', 'version'],
      type: 'unique',
      name: 'uq_codebook_source_version',
    });
    await queryInterface.addIndex('survey_codebooks', ['evidence_source_id'], { name: 'idx_codebooks_source' });
    await queryInterface.addIndex('survey_codebooks', ['status'], { name: 'idx_codebooks_status' });

    // ── survey_codes ──────────────────────────────────────────
    await queryInterface.createTable('survey_codes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      public_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      codebook_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'survey_codebooks', key: 'id' },
        onDelete: 'CASCADE',
      },
      code_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      label: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      definition: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      include_when: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      exclude_when: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      origin: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'qori_proposed',
        comment: 'qori_proposed | researcher_added | inherited',
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'proposed',
        comment: 'proposed | accepted | removed',
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addConstraint('survey_codes', {
      fields: ['codebook_id', 'code_key'],
      type: 'unique',
      name: 'uq_code_codebook_key',
    });
    await queryInterface.addIndex('survey_codes', ['codebook_id'], { name: 'idx_codes_codebook' });

    // ── survey_code_examples ──────────────────────────────────
    await queryInterface.createTable('survey_code_examples', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      code_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'survey_codes', key: 'id' },
        onDelete: 'CASCADE',
      },
      qualitative_entry_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'survey_qualitative_entries', key: 'id' },
        onDelete: 'CASCADE',
      },
      example_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'include',
        comment: 'include | boundary | exclude',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addConstraint('survey_code_examples', {
      fields: ['code_id', 'qualitative_entry_id'],
      type: 'unique',
      name: 'uq_code_example_code_entry',
    });
    await queryInterface.addIndex('survey_code_examples', ['code_id'], { name: 'idx_code_examples_code' });
    await queryInterface.addIndex('survey_code_examples', ['qualitative_entry_id'], { name: 'idx_code_examples_entry' });

    console.log('Created survey_qualitative_entries, survey_codebooks, survey_codes, survey_code_examples tables');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('survey_code_examples');
    await queryInterface.dropTable('survey_codes');
    await queryInterface.dropTable('survey_codebooks');
    await queryInterface.dropTable('survey_qualitative_entries');
    console.log('Dropped qualitative coding tables');
  },
};

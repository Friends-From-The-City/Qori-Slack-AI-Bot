'use strict';

/**
 * GOV-2A1: Create data_subjects and data_subject_links tables.
 *
 * Canonical subject registry for DSAR (Data Subject Access Request) operations.
 * data_subjects is a stable anchor with no PII — only a UUID public_id and
 * project scope. data_subject_links connects subjects to participants and
 * survey respondents with structurally exclusive link shapes.
 *
 * After DSAR deletion, the data_subject row survives as a tombstone
 * (status='deleted') so the audit trail can reference the public_id.
 * The tombstone cascades if the parent project is deleted — acceptable
 * because disposition_audit_log is the durable proof of the completed DSAR.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ─── data_subjects ─────────────────────────────────────────
      await queryInterface.createTable('data_subjects', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        public_id: {
          type: Sequelize.UUID,
          allowNull: false,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          unique: true,
        },
        project_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'projects', key: 'id' },
          onDelete: 'CASCADE',
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'active',
        },
        created_by: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
      }, { transaction });

      // CHECK constraint: status enum
      await queryInterface.sequelize.query(
        `ALTER TABLE data_subjects ADD CONSTRAINT chk_data_subject_status
         CHECK (status IN ('active', 'deleted'))`,
        { transaction },
      );

      // Indexes
      await queryInterface.addIndex('data_subjects', ['project_id'], {
        name: 'idx_data_subjects_project',
        transaction,
      });
      await queryInterface.addIndex('data_subjects', ['project_id', 'status'], {
        name: 'idx_data_subjects_project_status',
        transaction,
      });

      // ─── data_subject_links ────────────────────────────────────
      await queryInterface.createTable('data_subject_links', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        data_subject_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'data_subjects', key: 'id' },
          onDelete: 'CASCADE',
        },
        link_type: {
          type: Sequelize.STRING(30),
          allowNull: false,
        },
        // Scoping FKs — populated based on link_type
        study_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'research_studies', key: 'id' },
          onDelete: 'CASCADE',
        },
        participant_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'study_participants', key: 'id' },
          onDelete: 'CASCADE',
        },
        evidence_source_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'evidence_sources', key: 'id' },
          onDelete: 'CASCADE',
        },
        // Survey respondent identity (survey_respondent links only)
        respondent_key: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        // Metadata
        confidence: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'confirmed',
        },
        linked_by: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        linked_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      // CHECK: link_type enum (participant and survey_respondent only for MVP)
      await queryInterface.sequelize.query(
        `ALTER TABLE data_subject_links ADD CONSTRAINT chk_dsl_link_type
         CHECK (link_type IN ('participant', 'survey_respondent'))`,
        { transaction },
      );

      // CHECK: confidence enum
      await queryInterface.sequelize.query(
        `ALTER TABLE data_subject_links ADD CONSTRAINT chk_dsl_confidence
         CHECK (confidence IN ('confirmed', 'inferred'))`,
        { transaction },
      );

      // CHECK: participant link shape — participant_id and study_id required,
      // evidence_source_id and respondent_key must be NULL
      await queryInterface.sequelize.query(
        `ALTER TABLE data_subject_links ADD CONSTRAINT chk_participant_link_shape
         CHECK (
           link_type != 'participant' OR (
             participant_id IS NOT NULL AND
             study_id IS NOT NULL AND
             evidence_source_id IS NULL AND
             respondent_key IS NULL
           )
         )`,
        { transaction },
      );

      // CHECK: survey_respondent link shape — evidence_source_id and respondent_key required,
      // participant_id must be NULL
      await queryInterface.sequelize.query(
        `ALTER TABLE data_subject_links ADD CONSTRAINT chk_survey_respondent_link_shape
         CHECK (
           link_type != 'survey_respondent' OR (
             evidence_source_id IS NOT NULL AND
             respondent_key IS NOT NULL AND
             participant_id IS NULL
           )
         )`,
        { transaction },
      );

      // UNIQUE: one participant linked to at most one subject
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX uq_dsl_participant
         ON data_subject_links(participant_id)
         WHERE participant_id IS NOT NULL`,
        { transaction },
      );

      // UNIQUE: one (source, respondent_key) linked to at most one subject
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX uq_dsl_respondent
         ON data_subject_links(evidence_source_id, respondent_key)
         WHERE respondent_key IS NOT NULL`,
        { transaction },
      );

      // Index for subject lookup
      await queryInterface.addIndex('data_subject_links', ['data_subject_id'], {
        name: 'idx_dsl_subject',
        transaction,
      });

      // Index for participant lookup
      await queryInterface.addIndex('data_subject_links', ['participant_id'], {
        name: 'idx_dsl_participant',
        where: { participant_id: { [Sequelize.Op.ne]: null } },
        transaction,
      });

      // Index for source+respondent lookup
      await queryInterface.addIndex(
        'data_subject_links',
        ['evidence_source_id', 'respondent_key'],
        {
          name: 'idx_dsl_source_respondent',
          where: { evidence_source_id: { [Sequelize.Op.ne]: null } },
          transaction,
        },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('data_subject_links', { transaction });
      await queryInterface.dropTable('data_subjects', { transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};

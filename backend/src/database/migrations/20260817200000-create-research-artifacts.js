'use strict';

/**
 * PH-6A: Create research_artifacts and artifact_evidence_refs tables.
 *
 * Canonical artifact identity with stable semantic key based on
 * derivation fingerprint, not date/filename/path.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable('research_artifacts', {
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
        study_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'research_studies', key: 'id' },
          onDelete: 'CASCADE',
        },
        template_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        template_version: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        artifact_type: {
          type: Sequelize.STRING(50),
          allowNull: false,
        },
        title: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        repo: {
          type: Sequelize.STRING(200),
          allowNull: false,
        },
        ref: {
          type: Sequelize.STRING(100),
          allowNull: false,
          defaultValue: 'main',
        },
        path: {
          type: Sequelize.STRING,
          allowNull: true,
          comment: 'Last successful GitHub file path. Never cleared on retry.',
        },
        commit_sha: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: 'Last successful commit SHA. Never cleared on retry.',
        },
        url: {
          type: Sequelize.STRING,
          allowNull: true,
          comment: 'Last successful GitHub URL. Never cleared on retry.',
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'pending',
          comment: 'pending | written | failed',
        },
        last_write_error: {
          type: Sequelize.STRING,
          allowNull: true,
          comment: 'Error message from last failed write attempt.',
        },
        last_write_attempted_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Timestamp of last write attempt.',
        },
        semantic_key: {
          type: Sequelize.STRING(300),
          allowNull: false,
          unique: true,
        },
        created_by: {
          type: Sequelize.STRING(100),
          allowNull: false,
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
      }, { transaction });

      // Indexes
      await queryInterface.addIndex('research_artifacts', ['project_id'], {
        name: 'idx_research_artifacts_project', transaction,
      });
      await queryInterface.addIndex('research_artifacts', ['study_id'], {
        name: 'idx_research_artifacts_study', transaction,
      });
      await queryInterface.addIndex('research_artifacts', ['template_id'], {
        name: 'idx_research_artifacts_template', transaction,
      });
      await queryInterface.addIndex('research_artifacts', ['repo', 'ref', 'path'], {
        name: 'idx_research_artifacts_location', transaction,
      });

      // Join table for artifact → evidence construct refs
      await queryInterface.createTable('artifact_evidence_refs', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        artifact_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'research_artifacts', key: 'id' },
          onDelete: 'CASCADE',
        },
        construct_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'evidence_constructs', key: 'id' },
          onDelete: 'CASCADE',
        },
        ref_type: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: 'reflects',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('artifact_evidence_refs', ['artifact_id'], {
        name: 'idx_artifact_evidence_refs_artifact', transaction,
      });
      await queryInterface.addIndex('artifact_evidence_refs', ['construct_id'], {
        name: 'idx_artifact_evidence_refs_construct', transaction,
      });
      await queryInterface.addIndex('artifact_evidence_refs',
        ['artifact_id', 'construct_id', 'ref_type'],
        { name: 'uq_artifact_evidence_ref', unique: true, transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('artifact_evidence_refs');
    await queryInterface.dropTable('research_artifacts');
  },
};

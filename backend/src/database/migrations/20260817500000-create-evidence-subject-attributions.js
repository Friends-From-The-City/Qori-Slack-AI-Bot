'use strict';

/**
 * GOV-2B: Create evidence_subject_attributions table and add
 * stale_due_to_disposition boolean to evidence_constructs.
 *
 * evidence_subject_attributions provides the canonical FK-based path from
 * a data subject to the exact evidence constructs that contain or derive
 * directly from that subject's data. This eliminates participant-code/prose
 * matching from future DSAR runtime behavior.
 *
 * stale_due_to_disposition is orthogonal to human review status
 * (candidate/accepted/rejected/overridden). It indicates that underlying
 * evidence was affected by a governed disposition event (DSAR redaction).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ─── evidence_subject_attributions ──────────────────────────
      await queryInterface.createTable('evidence_subject_attributions', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        construct_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'evidence_constructs', key: 'id' },
          onDelete: 'CASCADE',
        },
        data_subject_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'data_subjects', key: 'id' },
          onDelete: 'CASCADE',
        },
        attribution_type: {
          type: Sequelize.STRING(30),
          allowNull: false,
        },
        evidence_source_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'evidence_sources', key: 'id' },
          onDelete: 'SET NULL',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      // CHECK: attribution_type enum
      await queryInterface.sequelize.query(
        `ALTER TABLE evidence_subject_attributions
         ADD CONSTRAINT chk_esa_attribution_type
         CHECK (attribution_type IN (
           'direct_quote', 'paraphrase', 'observation',
           'survey_response', 'behavioral_data'
         ))`,
        { transaction },
      );

      // UNIQUE: one attribution per (construct, subject, type)
      await queryInterface.addIndex(
        'evidence_subject_attributions',
        ['construct_id', 'data_subject_id', 'attribution_type'],
        { unique: true, name: 'uq_esa_construct_subject_type', transaction },
      );

      // Lookup indexes
      await queryInterface.addIndex(
        'evidence_subject_attributions',
        ['data_subject_id'],
        { name: 'idx_esa_subject', transaction },
      );
      await queryInterface.addIndex(
        'evidence_subject_attributions',
        ['construct_id'],
        { name: 'idx_esa_construct', transaction },
      );
      await queryInterface.addIndex(
        'evidence_subject_attributions',
        ['evidence_source_id'],
        {
          name: 'idx_esa_source',
          where: { evidence_source_id: { [Sequelize.Op.ne]: null } },
          transaction,
        },
      );

      // ─── stale_due_to_disposition on evidence_constructs ────────
      await queryInterface.addColumn(
        'evidence_constructs',
        'stale_due_to_disposition',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
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
      await queryInterface.removeColumn('evidence_constructs', 'stale_due_to_disposition', { transaction });
      await queryInterface.dropTable('evidence_subject_attributions', { transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};

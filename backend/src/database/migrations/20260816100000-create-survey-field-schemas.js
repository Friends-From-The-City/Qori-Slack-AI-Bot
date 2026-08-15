'use strict';

/**
 * Migration: Create survey_field_schemas table
 *
 * Per Survey Vertical Slice 1: stores researcher-reviewed field role
 * assignments for CSV survey data. One row per field per evidence source.
 *
 * pending_csv_content follows the study_notes.pending_content quarantine
 * pattern: holds staged CSV text between upload and schema confirmation,
 * then cleared to NULL. Only stored on the first field row for a given
 * evidence_source_id.
 *
 * FK: evidence_source_id → evidence_sources (CASCADE)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('survey_field_schemas', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      evidence_source_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'evidence_sources', key: 'id' },
        onDelete: 'CASCADE',
      },

      field_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      inferred_role: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'id | nominal | ordinal | continuous | multi_select | open_text | timestamp',
      },

      confirmed_role: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Set after researcher review; NULL while pending',
      },

      order_metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'For ordinal: confirmed category order array. For multi_select: option list.',
      },

      is_demographic: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether this field represents demographic information',
      },

      inference_source: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'heuristic',
        comment: 'heuristic | declared',
      },

      review_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'pending | confirmed | expired',
      },

      reviewed_by: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Slack user ID of reviewer',
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

    await queryInterface.addConstraint('survey_field_schemas', {
      fields: ['evidence_source_id', 'field_name'],
      type: 'unique',
      name: 'uq_survey_field_schemas_source_field',
    });

    await queryInterface.addIndex('survey_field_schemas', ['evidence_source_id'], {
      name: 'idx_survey_field_schemas_source',
    });

    await queryInterface.addIndex('survey_field_schemas', ['review_status'], {
      name: 'idx_survey_field_schemas_status',
    });

    console.log('Created survey_field_schemas table with indexes');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('survey_field_schemas');
    console.log('Dropped survey_field_schemas table');
  },
};

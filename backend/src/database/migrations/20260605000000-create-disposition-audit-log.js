'use strict';

/**
 * Migration: Create disposition_audit_log table
 *
 * Per ADR 0025: Every disposition action is logged for NARA compliance.
 * This table uses SET NULL for FKs because the audit record must survive
 * the deletion of the rows it describes. Denormalized fields (study_name,
 * project_name, participant_code, records_affected) are the durable record.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('disposition_audit_log', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      // What was affected
      action: {
        type: Sequelize.STRING(30),
        allowNull: false,
        comment: 'delete_participant | delete_study | export_participant | deletion_denied | deletion_error',
      },
      record_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'participant_record | session_transcript | study_metadata | etc.',
      },
      target_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Original DB ID of deleted record (may be NULL after deletion)',
      },
      target_identifier: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Human-readable ID (PT-007, study name) — DURABLE after delete',
      },

      // Context (SET NULL on delete — denormalized fields are durable)
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'SET NULL',
      },
      project_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Denormalized — survives project deletion',
      },
      study_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'research_studies', key: 'id' },
        onDelete: 'SET NULL',
      },
      study_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Denormalized — survives study deletion',
      },
      participant_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Not FK — participant may be deleted',
      },
      participant_code: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Denormalized (PT-007) — survives participant deletion',
      },

      // Who
      actor_user_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Slack user ID of person who performed action',
      },
      actor_role: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'owner | member | admin',
      },

      // Authorization
      authorization_basis: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Why action was permitted (e.g., "Project owner per ADR 0025")',
      },

      // Outcome
      outcome: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'success | denied | error',
      },
      outcome_detail: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Error messages, denial reasons',
      },

      // Counts (what was actually affected)
      records_affected: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'e.g., {"notes": 3, "variables": 47, "observers": 2}',
      },

      // Timestamp
      occurred_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Indexes for querying
    await queryInterface.addIndex('disposition_audit_log', ['action'], {
      name: 'idx_disposition_audit_log_action',
    });
    await queryInterface.addIndex('disposition_audit_log', ['project_id'], {
      name: 'idx_disposition_audit_log_project',
    });
    await queryInterface.addIndex('disposition_audit_log', ['study_id'], {
      name: 'idx_disposition_audit_log_study',
    });
    await queryInterface.addIndex('disposition_audit_log', ['actor_user_id'], {
      name: 'idx_disposition_audit_log_actor',
    });
    await queryInterface.addIndex('disposition_audit_log', ['occurred_at'], {
      name: 'idx_disposition_audit_log_occurred_at',
    });
    await queryInterface.addIndex('disposition_audit_log', ['outcome'], {
      name: 'idx_disposition_audit_log_outcome',
    });

    console.log('Created disposition_audit_log table with indexes');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('disposition_audit_log');
    console.log('Dropped disposition_audit_log table');
  },
};

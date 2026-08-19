'use strict';

/**
 * GOV-6 — Records Lifecycle / Archival / Retention / Legal Hold / Disposition
 *
 * Creates the records-management layer:
 *   - records_schedules: provider-neutral records schedule model
 *   - records_management_assignments: lifecycle assignment per canonical record
 *   - records_holds: preservation/legal holds
 *   - records_hold_targets: specific records under a hold
 *   - records_disposition_events: append-only disposition audit trail
 *
 * All CHECK constraints use NOT VALID + VALIDATE for safe hot deployment.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ═══════════════════════════════════════════════════════════
    // 1. records_schedules
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('records_schedules', {
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
      authority_type: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      authority_code: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      record_value: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      retention_trigger: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      retention_period_days: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      disposition_action: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      transfer_instructions: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      effective_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      superseded_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      source_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // ═══════════════════════════════════════════════════════════
    // 2. records_management_assignments
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('records_management_assignments', {
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
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      record_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      record_public_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      records_schedule_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'records_schedules', key: 'id' },
        onDelete: 'SET NULL',
      },
      schedule_item: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      record_series: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      cutoff_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      retention_start_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      eligible_disposition_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lifecycle_status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'active',
      },
      assigned_by: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      assigned_at: {
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

    await queryInterface.addIndex('records_management_assignments', {
      fields: ['record_type', 'record_public_id'],
      unique: true,
      name: 'uq_rma_record_type_public_id',
    });

    await queryInterface.addIndex('records_management_assignments', {
      fields: ['project_id'],
      name: 'idx_rma_project_id',
    });

    await queryInterface.addIndex('records_management_assignments', {
      fields: ['lifecycle_status'],
      name: 'idx_rma_lifecycle_status',
    });

    // ═══════════════════════════════════════════════════════════
    // 3. records_holds
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('records_holds', {
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
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      hold_type: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
      },
      issued_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      issued_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      released_by: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      released_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      external_reference: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('records_holds', {
      fields: ['project_id'],
      name: 'idx_holds_project_id',
    });

    await queryInterface.addIndex('records_holds', {
      fields: ['status'],
      name: 'idx_holds_status',
    });

    // ═══════════════════════════════════════════════════════════
    // 4. records_hold_targets
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('records_hold_targets', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      hold_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'records_holds', key: 'id' },
        onDelete: 'CASCADE',
      },
      target_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      target_public_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('records_hold_targets', {
      fields: ['hold_id', 'target_type', 'target_public_id'],
      unique: true,
      name: 'uq_hold_target',
    });

    // ═══════════════════════════════════════════════════════════
    // 5. records_disposition_events
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('records_disposition_events', {
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
      assignment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'records_management_assignments', key: 'id' },
        onDelete: 'RESTRICT',
      },
      action: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      authority_code: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      schedule_item: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      outcome: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      actor: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    });

    await queryInterface.addIndex('records_disposition_events', {
      fields: ['assignment_id'],
      name: 'idx_disposition_events_assignment',
    });

    // ═══════════════════════════════════════════════════════════
    // 6. CHECK constraints (NOT VALID + VALIDATE pattern)
    // ═══════════════════════════════════════════════════════════
    const checks = [
      // records_schedules
      {
        table: 'records_schedules',
        name: 'chk_rs_authority_type',
        check: `authority_type IN ('grs','agency_schedule','other_authority')`,
      },
      {
        table: 'records_schedules',
        name: 'chk_rs_record_value',
        check: `record_value IN ('temporary','permanent')`,
      },
      {
        table: 'records_schedules',
        name: 'chk_rs_disposition_action',
        check: `disposition_action IN ('destroy','transfer','review')`,
      },

      // records_management_assignments
      {
        table: 'records_management_assignments',
        name: 'chk_rma_record_type',
        check: `record_type IN ('project','study','evidence_source','evidence_construct','research_artifact')`,
      },
      {
        table: 'records_management_assignments',
        name: 'chk_rma_lifecycle_status',
        check: `lifecycle_status IN ('active','inactive','archived','disposition_eligible','on_hold','transferred','disposed')`,
      },

      // records_holds
      {
        table: 'records_holds',
        name: 'chk_rh_hold_type',
        check: `hold_type IN ('legal','litigation','audit','investigation','records_freeze')`,
      },
      {
        table: 'records_holds',
        name: 'chk_rh_status',
        check: `status IN ('active','released')`,
      },

      // records_disposition_events
      {
        table: 'records_disposition_events',
        name: 'chk_rde_action',
        check: `action IN ('destroy','transfer','preserve','cancel')`,
      },
      {
        table: 'records_disposition_events',
        name: 'chk_rde_outcome',
        check: `outcome IN ('completed','blocked','manual_review_required','failed')`,
      },
    ];

    for (const c of checks) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" CHECK (${c.check}) NOT VALID`
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "${c.table}" VALIDATE CONSTRAINT "${c.name}"`
      );
    }
  },

  async down(queryInterface) {
    // Reverse order: events → hold_targets → holds → assignments → schedules
    await queryInterface.dropTable('records_disposition_events');
    await queryInterface.dropTable('records_hold_targets');
    await queryInterface.dropTable('records_holds');
    await queryInterface.dropTable('records_management_assignments');
    await queryInterface.dropTable('records_schedules');
  },
};

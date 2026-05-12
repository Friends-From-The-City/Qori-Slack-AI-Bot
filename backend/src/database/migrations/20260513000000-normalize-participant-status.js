'use strict';

/**
 * Normalize all StudyParticipant status_select values to the canonical 9-status enum.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const STATUS_MAP = {
        'pending': 'contacted',
        'pending_response': 'contacted',
        'recruited': 'not_contacted',
        'confirmed': 'confirmed',
        'backup': 'confirmed',
        'backup_participant': 'confirmed',
        'scheduled': 'scheduled',
        'rescheduling': 'needs_reschedule',
        'rescheduling_needed': 'needs_reschedule',
        'completed': 'completed',
        'canceled': 'canceled',
        'disqualified': 'declined',
        'contacted': 'contacted',
        'not_contacted': 'not_contacted',
        'needs_reschedule': 'needs_reschedule',
        'declined': 'declined',
        'no_response': 'no_response',
      };

      const BACKUP_VALUES = new Set(['backup', 'backup_participant']);

      const [rows] = await queryInterface.sequelize.query(
        'SELECT id, status_select, notes_field FROM study_participants',
        { transaction },
      );

      const counts = {};
      let defaultCount = 0;

      for (const row of rows) {
        const oldStatus = row.status_select;
        const key = (oldStatus || '').toLowerCase().trim();
        let newStatus = STATUS_MAP[key];

        if (!newStatus) {
          newStatus = 'contacted';
          defaultCount++;
          console.log(`  [migrate] row ${row.id}: unknown status "${oldStatus}" → contacted (safe default)`);
        }

        const mapKey = `${oldStatus || 'NULL'} → ${newStatus}`;
        counts[mapKey] = (counts[mapKey] || 0) + 1;

        const updates = { status_select: newStatus };

        if (BACKUP_VALUES.has(key)) {
          const existing = row.notes_field || '';
          updates.notes_field = existing
            ? `${existing}\n[Backup participant]`
            : '[Backup participant]';
        }

        await queryInterface.sequelize.query(
          `UPDATE study_participants SET status_select = :status${updates.notes_field !== undefined ? ', notes_field = :notes' : ''} WHERE id = :id`,
          {
            replacements: {
              status: updates.status_select,
              notes: updates.notes_field,
              id: row.id,
            },
            transaction,
          },
        );
      }

      console.log('\n  [migrate] Status normalization summary:');
      for (const [mapping, count] of Object.entries(counts)) {
        console.log(`    ${mapping}: ${count} row(s)`);
      }
      if (defaultCount > 0) {
        console.log(`    ⚠️  ${defaultCount} row(s) hit safe default`);
      }
      console.log(`    Total: ${rows.length} row(s) processed\n`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('  [migrate] down: no-op — restore from snapshot to reverse status normalization');
  },
};

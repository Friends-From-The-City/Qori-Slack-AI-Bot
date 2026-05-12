'use strict';

/**
 * Add outreach tracking columns to study_participants.
 * Backfill: rows in active/terminal statuses get outreach_sent_at = updated_at, outreach_count = 1.
 * Rows in not_contacted or canceled stay null/0.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.addColumn('study_participants', 'outreach_sent_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('study_participants', 'outreach_method', {
      type: DataTypes.STRING(20),
      allowNull: true,
    });

    await queryInterface.addColumn('study_participants', 'outreach_count', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // Backfill: participants who've been contacted get outreach_sent_at = updated_at
    const CONTACTED_STATUSES = [
      'contacted', 'scheduled', 'confirmed', 'needs_reschedule',
      'completed', 'declined', 'no_response',
    ];

    const [result] = await queryInterface.sequelize.query(
      `UPDATE study_participants
       SET outreach_sent_at = updated_at, outreach_count = 1
       WHERE status_select IN (:statuses)
       AND outreach_sent_at IS NULL`,
      { replacements: { statuses: CONTACTED_STATUSES } },
    );

    const backfilledCount = result?.rowCount || result?.length || 0;

    const [nullRows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as cnt FROM study_participants WHERE outreach_sent_at IS NULL`,
    );
    const nullCount = parseInt(nullRows[0]?.cnt || '0', 10);

    console.log(`\n  [migrate] Outreach backfill: ${backfilledCount} row(s) backfilled, ${nullCount} row(s) left null\n`);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('study_participants', 'outreach_sent_at');
    await queryInterface.removeColumn('study_participants', 'outreach_method');
    await queryInterface.removeColumn('study_participants', 'outreach_count');
  },
};

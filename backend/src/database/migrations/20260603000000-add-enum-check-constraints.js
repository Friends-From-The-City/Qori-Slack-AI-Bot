'use strict';

/**
 * R1: Add DB-level CHECK constraints for application enums.
 *
 * Defense in depth: app-level validation can be bypassed; DB constraints cannot.
 * These lock the B2 status enum alignment permanently.
 *
 * Note: session_observer.role and session_observer.status already use Postgres
 * ENUM types (created by Sequelize DataTypes.ENUM), so they're already constrained.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // CHECK constraint for participant status (10-value enum as of B2 fix)
    await queryInterface.sequelize.query(`
      ALTER TABLE study_participants
      ADD CONSTRAINT chk_participant_status
      CHECK (status_select IN (
        'not_contacted',
        'contacted',
        'scheduled',
        'confirmed',
        'needs_reschedule',
        'completed',
        'declined',
        'disqualified',
        'no_response',
        'canceled'
      ) OR status_select IS NULL)
    `);

    // CHECK constraint for outreach method
    await queryInterface.sequelize.query(`
      ALTER TABLE study_participants
      ADD CONSTRAINT chk_outreach_method
      CHECK (outreach_method IN (
        'email',
        'slack',
        'phone',
        'other'
      ) OR outreach_method IS NULL)
    `);

    console.log('✅ Added CHECK constraints: chk_participant_status, chk_outreach_method');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE study_participants DROP CONSTRAINT IF EXISTS chk_participant_status
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE study_participants DROP CONSTRAINT IF EXISTS chk_outreach_method
    `);
  },
};

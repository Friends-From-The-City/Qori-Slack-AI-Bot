'use strict';

/**
 * GOV-3A — Fix participant status_select column default
 *
 * The DB column default is 'Pending' (from the original migration) but the
 * CHECK constraint (chk_participant_status) requires lowercase canonical
 * values. The Sequelize model uses 'contacted' as the default, so raw SQL
 * inserts using the DB default would be rejected by the constraint.
 *
 * Fix: change the DB default to 'contacted' to match the model and pass
 * the CHECK constraint.
 *
 * No existing data remediation needed — the normalization migration
 * (20260513000000) already converted all legacy 'Pending' values to
 * canonical lowercase.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE study_participants ALTER COLUMN status_select SET DEFAULT 'contacted'`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE study_participants ALTER COLUMN status_select SET DEFAULT 'Pending'`
    );
  },
};

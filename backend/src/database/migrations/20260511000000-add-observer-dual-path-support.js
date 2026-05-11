'use strict';

/**
 * Adds dual-path observer support:
 * - 'confirmed' status (direct add, no approval step)
 * - 'observer' role (generic role for new flow)
 * - joined_via column (tracks how observer was added)
 *
 * Postgres ALTER TYPE ... ADD VALUE cannot run inside a transaction,
 * so this migration must run with { transaction: false } on the enum changes.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add 'confirmed' to status enum
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_session_observers_status" ADD VALUE IF NOT EXISTS 'confirmed';`
    );

    // Add 'observer' to role enum
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_session_observers_role" ADD VALUE IF NOT EXISTS 'observer';`
    );

    // Add joined_via column
    await queryInterface.addColumn('session_observers', 'joined_via', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'How observer was added: researcher_add, channel_cta, request',
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove joined_via column
    await queryInterface.removeColumn('session_observers', 'joined_via');

    // Note: Postgres does not support removing values from enums.
    // The 'confirmed' status and 'observer' role values will remain
    // but will be unused after rollback.
  },
};

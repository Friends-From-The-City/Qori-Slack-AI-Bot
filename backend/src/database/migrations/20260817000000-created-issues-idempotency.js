'use strict';

/**
 * PH-4: Add idempotency guarantees to created_issues.
 *
 * 1. Add unique constraint on (study_id, audience, ticket_id) — the semantic
 *    action identity. DB rejects race-condition duplicates.
 * 2. Add public_id for machine-readable Qori action markers in GitHub issues.
 * 3. Add status + updated_at for lifecycle tracking and recovery.
 *
 * Pre-check: audit existing rows for duplicates before applying unique constraint.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Audit for existing duplicates before adding unique constraint
      const [duplicates] = await queryInterface.sequelize.query(
        `SELECT study_id, audience, ticket_id, COUNT(*) as cnt
         FROM created_issues
         GROUP BY study_id, audience, ticket_id
         HAVING COUNT(*) > 1`,
        { transaction },
      );

      if (duplicates.length > 0) {
        // Remove duplicates keeping the earliest entry
        for (const dup of duplicates) {
          await queryInterface.sequelize.query(
            `DELETE FROM created_issues
             WHERE study_id = :study_id AND audience = :audience AND ticket_id = :ticket_id
             AND id NOT IN (
               SELECT MIN(id) FROM created_issues
               WHERE study_id = :study_id AND audience = :audience AND ticket_id = :ticket_id
             )`,
            {
              replacements: { study_id: dup.study_id, audience: dup.audience, ticket_id: dup.ticket_id },
              transaction,
            },
          );
        }
        console.log(`PH-4: Removed ${duplicates.length} duplicate created_issues groups before applying unique constraint`);
      }

      // Add public_id column (UUID for machine-readable action markers)
      await queryInterface.addColumn(
        'created_issues',
        'public_id',
        {
          type: Sequelize.UUID,
          allowNull: false,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
        },
        { transaction },
      );

      // Add status column for lifecycle tracking
      await queryInterface.addColumn(
        'created_issues',
        'status',
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'created',
          comment: 'pending | created | failed',
        },
        { transaction },
      );

      // Add updated_at column
      await queryInterface.addColumn(
        'created_issues',
        'updated_at',
        {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        { transaction },
      );

      // Add hard unique constraint on semantic action identity
      await queryInterface.addIndex(
        'created_issues',
        ['study_id', 'audience', 'ticket_id'],
        {
          unique: true,
          name: 'idx_created_issues_semantic_key',
          transaction,
        },
      );

      // Add unique index on public_id
      await queryInterface.addIndex(
        'created_issues',
        ['public_id'],
        {
          unique: true,
          name: 'idx_created_issues_public_id',
          transaction,
        },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeIndex('created_issues', 'idx_created_issues_semantic_key', { transaction });
      await queryInterface.removeIndex('created_issues', 'idx_created_issues_public_id', { transaction });
      await queryInterface.removeColumn('created_issues', 'public_id', { transaction });
      await queryInterface.removeColumn('created_issues', 'status', { transaction });
      await queryInterface.removeColumn('created_issues', 'updated_at', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

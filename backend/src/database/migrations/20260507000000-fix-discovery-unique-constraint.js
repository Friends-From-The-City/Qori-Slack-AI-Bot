'use strict';

/**
 * Fix unique constraint on study_variables to include discovery_artifact_id.
 *
 * Bug: idx_study_var_pool_item was unique on (study_name, variable_key, item_key)
 * but did not include discovery_artifact_id. When multiple discovery artifacts
 * under the same study_name emit variables with the same item_key (e.g., both
 * have "constraint-001"), the second insert violates the constraint. This caused
 * ALL discovery-scoped variable writes to fail with "Validation error", leaving
 * rows with NULL values in Postgres while GitHub JSON had the real data.
 *
 * Fix: Replace the index with one that includes discovery_artifact_id.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Drop the old unique index
    await queryInterface.removeIndex('study_variables', 'idx_study_var_pool_item');

    // Recreate with discovery_artifact_id included
    await queryInterface.addIndex(
      'study_variables',
      ['study_name', 'variable_key', 'item_key', 'discovery_artifact_id'],
      {
        unique: true,
        name: 'idx_study_var_pool_item',
        where: { item_key: { [Sequelize.Op.ne]: null } },
      }
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('study_variables', 'idx_study_var_pool_item');

    await queryInterface.addIndex(
      'study_variables',
      ['study_name', 'variable_key', 'item_key'],
      {
        unique: true,
        name: 'idx_study_var_pool_item',
        where: { item_key: { [Sequelize.Op.ne]: null } },
      }
    );
  },
};

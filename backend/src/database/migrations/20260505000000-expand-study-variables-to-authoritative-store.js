'use strict';

/**
 * Expand study_variables from an index-only table to the authoritative variable store.
 * Adds: value (JSONB), participant_id, item_key, source_date, confidence columns.
 * Changes: variable_key → variable_type (semantic rename), adds item_key for pool items.
 * Adds proper indexes for lookup, participant filtering, and uniqueness.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add new columns
    await queryInterface.addColumn('study_variables', 'value', {
      type: Sequelize.JSONB,
      allowNull: true, // Nullable during migration; existing index rows have no value
      comment: 'The actual variable data (JSONB)',
    });

    await queryInterface.addColumn('study_variables', 'item_key', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'For pool items: unique item ID (e.g., nugget-PT001-001). NULL for singletons.',
    });

    await queryInterface.addColumn('study_variables', 'participant_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'For per-participant pools: PT-XXX identifier',
    });

    await queryInterface.addColumn('study_variables', 'source_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When this variable was extracted/written',
    });

    await queryInterface.addColumn('study_variables', 'confidence', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Extraction confidence: Strong, Moderate, Limited',
    });

    await queryInterface.addColumn('study_variables', 'scope', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'study',
      comment: 'study or discovery',
    });

    await queryInterface.addColumn('study_variables', 'discovery_artifact_id', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'For discovery scope: the topic slug',
    });

    // 2. Rename variable_key to variable_type for clarity
    // (variable_key currently stores the variable type name like "atomic_nuggets")
    // We keep variable_key column name for backward compat but add variable_type as alias
    // Actually, let's just add indexes on existing column name to avoid breaking existing code

    // 3. Add indexes for the new query patterns
    await queryInterface.addIndex('study_variables', ['study_name', 'variable_key', 'participant_id'], {
      name: 'idx_study_var_participant',
    });

    await queryInterface.addIndex('study_variables', ['study_name', 'variable_key', 'item_key'], {
      unique: true,
      name: 'idx_study_var_pool_item',
      where: { item_key: { [Sequelize.Op.ne]: null } },
    });

    await queryInterface.addIndex('study_variables', ['scope', 'study_name'], {
      name: 'idx_study_var_scope',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('study_variables', 'idx_study_var_scope');
    await queryInterface.removeIndex('study_variables', 'idx_study_var_pool_item');
    await queryInterface.removeIndex('study_variables', 'idx_study_var_participant');

    await queryInterface.removeColumn('study_variables', 'discovery_artifact_id');
    await queryInterface.removeColumn('study_variables', 'scope');
    await queryInterface.removeColumn('study_variables', 'confidence');
    await queryInterface.removeColumn('study_variables', 'source_date');
    await queryInterface.removeColumn('study_variables', 'participant_id');
    await queryInterface.removeColumn('study_variables', 'item_key');
    await queryInterface.removeColumn('study_variables', 'value');
  },
};

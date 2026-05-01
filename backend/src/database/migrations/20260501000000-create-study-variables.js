'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('study_variables', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      study_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      variable_key: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Variable name (e.g., atomic_nuggets, validated_themes)',
      },
      variable_type: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Semantic type from schema (e.g., pool, object, array)',
      },
      source_template: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Template that emitted this variable (e.g., session_summary)',
      },
      source_version: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Template version at extraction time',
      },
      value_hash: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Hash of variable value for staleness comparison',
      },
      entry_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Number of items for pool variables',
      },
      is_pool: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      stale: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Marked stale when upstream document is regenerated',
      },
      extracted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      created_at: {
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

    // Index for common queries: "what variables exist for this study?"
    await queryInterface.addIndex('study_variables', ['study_name']);

    // Index for staleness queries: "which studies have stale variables?"
    await queryInterface.addIndex('study_variables', ['stale']);

    // Unique constraint: one entry per study + variable key
    await queryInterface.addIndex('study_variables', ['study_name', 'variable_key'], {
      unique: true,
      name: 'study_variables_study_key_unique',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('study_variables');
  },
};

'use strict';

/**
 * Migration 3: Migrate study_variables from study_name string to FK columns
 *
 * This is the core cascade store schema change:
 * - Adds project_id FK (NOT NULL) and study_id FK (NULL for discovery)
 * - Drops study_name denormalized column
 * - Recreates indexes with new FK columns
 * - Preserves pool uniqueness via partial index on item_key IS NOT NULL
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add project_id FK (NOT NULL - clean break, tables are empty)
      await queryInterface.addColumn(
        'study_variables',
        'project_id',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'projects',
            key: 'id',
          },
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      // Add study_id FK (NULL for project-scoped variables like discovery)
      await queryInterface.addColumn(
        'study_variables',
        'study_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'research_studies',
            key: 'id',
          },
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      // Drop old indexes that reference study_name
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS idx_study_var_participant',
        { transaction },
      );
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS idx_study_var_pool_item',
        { transaction },
      );
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS idx_study_var_scope',
        { transaction },
      );
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS study_variables_study_name',
        { transaction },
      );

      // Drop the denormalized study_name column
      await queryInterface.removeColumn('study_variables', 'study_name', { transaction });

      // Recreate indexes with new FK columns
      await queryInterface.addIndex('study_variables', ['project_id'], {
        name: 'idx_study_var_project',
        transaction,
      });

      await queryInterface.addIndex('study_variables', ['study_id'], {
        name: 'idx_study_var_study',
        transaction,
      });

      await queryInterface.addIndex('study_variables', ['project_id', 'variable_key', 'participant_id'], {
        name: 'idx_study_var_participant',
        transaction,
      });

      await queryInterface.addIndex('study_variables', ['scope', 'project_id'], {
        name: 'idx_study_var_scope',
        transaction,
      });

      // Pool uniqueness: partial index matching current behavior
      // Only constrains rows where item_key IS NOT NULL (pool entries)
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX idx_study_var_pool_item
         ON study_variables(project_id, study_id, variable_key, item_key, discovery_artifact_id)
         WHERE item_key IS NOT NULL`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Drop new indexes
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS idx_study_var_pool_item',
        { transaction },
      );
      await queryInterface.removeIndex('study_variables', 'idx_study_var_scope', { transaction });
      await queryInterface.removeIndex('study_variables', 'idx_study_var_participant', { transaction });
      await queryInterface.removeIndex('study_variables', 'idx_study_var_study', { transaction });
      await queryInterface.removeIndex('study_variables', 'idx_study_var_project', { transaction });

      // Restore study_name column
      await queryInterface.addColumn(
        'study_variables',
        'study_name',
        {
          type: Sequelize.STRING(255),
          allowNull: false,
          defaultValue: '',
        },
        { transaction },
      );

      // Drop FK columns
      await queryInterface.removeColumn('study_variables', 'study_id', { transaction });
      await queryInterface.removeColumn('study_variables', 'project_id', { transaction });

      // Restore old indexes
      await queryInterface.addIndex('study_variables', ['study_name'], {
        name: 'study_variables_study_name',
        transaction,
      });

      await queryInterface.addIndex('study_variables', ['scope', 'study_name'], {
        name: 'idx_study_var_scope',
        transaction,
      });

      await queryInterface.addIndex('study_variables', ['study_name', 'variable_key', 'participant_id'], {
        name: 'idx_study_var_participant',
        transaction,
      });

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX idx_study_var_pool_item
         ON study_variables(study_name, variable_key, item_key, discovery_artifact_id)
         WHERE item_key IS NOT NULL`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

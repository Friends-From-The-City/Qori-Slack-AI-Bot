'use strict';

/**
 * Migration 4: Migrate created_issues from study_name string to study_id FK
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add study_id FK (NOT NULL - clean break, tables are empty)
      await queryInterface.addColumn(
        'created_issues',
        'study_id',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'research_studies',
            key: 'id',
          },
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      // Drop denormalized study_name column
      await queryInterface.removeColumn('created_issues', 'study_name', { transaction });

      // Add index on study_id
      await queryInterface.addIndex('created_issues', ['study_id'], {
        name: 'idx_created_issues_study',
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeIndex('created_issues', 'idx_created_issues_study', { transaction });

      await queryInterface.addColumn(
        'created_issues',
        'study_name',
        {
          type: Sequelize.STRING(255),
          allowNull: false,
          defaultValue: '',
        },
        { transaction },
      );

      await queryInterface.removeColumn('created_issues', 'study_id', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

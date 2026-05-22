'use strict';

/**
 * Migration 5: Migrate research_status from study_name string to study_id FK
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add study_id FK (NOT NULL - clean break, tables are empty)
      await queryInterface.addColumn(
        'research_status',
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
      await queryInterface.removeColumn('research_status', 'study_name', { transaction });

      // Add index on study_id
      await queryInterface.addIndex('research_status', ['study_id'], {
        name: 'idx_research_status_study',
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
      await queryInterface.removeIndex('research_status', 'idx_research_status_study', { transaction });

      await queryInterface.addColumn(
        'research_status',
        'study_name',
        {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        { transaction },
      );

      await queryInterface.removeColumn('research_status', 'study_id', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

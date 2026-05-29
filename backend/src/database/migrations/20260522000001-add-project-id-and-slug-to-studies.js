'use strict';

/**
 * Migration 2: Add project_id FK and slug to research_studies
 *
 * Studies become children of projects. The slug provides a URL-safe
 * identifier within the project for folder paths.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Add project_id FK (NOT NULL - clean break, tables are empty)
      await queryInterface.addColumn(
        'research_studies',
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

      // Add slug column
      await queryInterface.addColumn(
        'research_studies',
        'slug',
        {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        { transaction },
      );

      // Index on project_id for efficient lookups
      await queryInterface.addIndex('research_studies', ['project_id'], {
        name: 'idx_studies_project',
        transaction,
      });

      // Partial unique index: slug must be unique within project when set
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX idx_studies_project_slug
         ON research_studies(project_id, slug)
         WHERE slug IS NOT NULL`,
        { transaction },
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
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS idx_studies_project_slug',
        { transaction },
      );
      await queryInterface.removeIndex('research_studies', 'idx_studies_project', { transaction });
      await queryInterface.removeColumn('research_studies', 'slug', { transaction });
      await queryInterface.removeColumn('research_studies', 'project_id', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

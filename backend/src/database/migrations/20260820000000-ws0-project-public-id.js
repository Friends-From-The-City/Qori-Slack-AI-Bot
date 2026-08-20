'use strict';

/**
 * WS-0: Add stable public_id (UUID) to projects table.
 *
 * Projects currently use mutable `slug` as their external identifier.
 * This migration adds an immutable UUID `public_id` column, backfills
 * all existing rows, and makes the column NOT NULL + UNIQUE.
 *
 * The slug remains as a human-readable, editable identifier.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Step 1: Add nullable column
    await queryInterface.addColumn('projects', 'public_id', {
      type: Sequelize.UUID,
      allowNull: true,
      unique: false,
    });

    // Step 2: Backfill existing rows
    await queryInterface.sequelize.query(`
      UPDATE projects SET public_id = gen_random_uuid() WHERE public_id IS NULL;
    `);

    // Step 3: Make NOT NULL
    await queryInterface.changeColumn('projects', 'public_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });

    // Step 4: Add unique index
    await queryInterface.addIndex('projects', ['public_id'], {
      unique: true,
      name: 'projects_public_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('projects', 'projects_public_id_unique');
    await queryInterface.removeColumn('projects', 'public_id');
  },
};

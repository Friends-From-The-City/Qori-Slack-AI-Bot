'use strict';

/**
 * Fix research_plans foreign key to include ON DELETE CASCADE.
 * This was missing, causing study deletion to fail.
 */
module.exports = {
  async up(queryInterface) {
    // Drop old constraint and add with CASCADE
    await queryInterface.sequelize.query(`
      ALTER TABLE research_plans
        DROP CONSTRAINT IF EXISTS research_plans_study_id_fkey;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE research_plans
        ADD CONSTRAINT research_plans_study_id_fkey
          FOREIGN KEY (study_id) REFERENCES research_studies(id)
          ON UPDATE CASCADE ON DELETE CASCADE;
    `);
  },

  async down(queryInterface) {
    // Revert to non-cascading FK (not recommended)
    await queryInterface.sequelize.query(`
      ALTER TABLE research_plans
        DROP CONSTRAINT IF EXISTS research_plans_study_id_fkey;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE research_plans
        ADD CONSTRAINT research_plans_study_id_fkey
          FOREIGN KEY (study_id) REFERENCES research_studies(id);
    `);
  },
};

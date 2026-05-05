'use strict';

/**
 * Drop the old unique constraint on (study_name, variable_key) that was created
 * when study_variables was just an index table. Now that pool items create multiple
 * rows with the same study_name + variable_key, this constraint must go.
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeIndex('study_variables', 'study_variables_study_key_unique');
  },

  down: async (queryInterface) => {
    await queryInterface.addIndex('study_variables', ['study_name', 'variable_key'], {
      unique: true,
      name: 'study_variables_study_key_unique',
    });
  },
};

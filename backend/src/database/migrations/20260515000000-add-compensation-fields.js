'use strict';

/**
 * Add compensation-related columns to research_studies and study_participants.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // ResearchStudy columns
    await queryInterface.addColumn('research_studies', 'parsed_budget_amount', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    });

    await queryInterface.addColumn('research_studies', 'target_participants', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });

    // StudyParticipant column
    await queryInterface.addColumn('study_participants', 'compensation_amount', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    });

    console.log('\n  [migrate] Added parsed_budget_amount, target_participants to research_studies');
    console.log('  [migrate] Added compensation_amount to study_participants\n');
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('research_studies', 'parsed_budget_amount');
    await queryInterface.removeColumn('research_studies', 'target_participants');
    await queryInterface.removeColumn('study_participants', 'compensation_amount');
  },
};

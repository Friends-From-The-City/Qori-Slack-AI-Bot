'use strict';

/**
 * Track GitHub Issues created from ticket_candidates via /qori-tickets.
 * Enables duplicate prevention (don't re-create same ticket) and
 * traceability (link GitHub issue back to source ticket + study).
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('created_issues', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      study_name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Study slug (matches study_variables.study_name)',
      },
      audience: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Audience: designer, engineering, accessibility',
      },
      ticket_id: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Ticket candidate ID (design-ticket-001, eng-ticket-001, etc.)',
      },
      github_issue_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      github_url: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      github_repo: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'owner/repo where issue was created',
      },
      created_by: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Slack user ID who created the issue',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Prevent duplicate creation: same ticket in same study+audience
    await queryInterface.addIndex('created_issues', ['study_name', 'audience', 'ticket_id'], {
      unique: true,
      name: 'idx_created_issues_unique_ticket',
    });

    await queryInterface.addIndex('created_issues', ['study_name', 'audience'], {
      name: 'idx_created_issues_study_audience',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('created_issues');
  },
};

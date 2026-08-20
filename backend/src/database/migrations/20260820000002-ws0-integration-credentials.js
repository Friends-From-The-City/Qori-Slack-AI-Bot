'use strict';

/**
 * WS-0: Per-org integration credential boundary.
 *
 * Stores credential references (NOT raw tokens) for organization-scoped
 * external service integrations (GitHub, future Jira, etc.).
 *
 * Raw tokens come from deployment secret infrastructure (env vars, secret
 * manager). This table maps org → credential reference.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('integration_credentials', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      credential_ref: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // One active credential per provider per org
    await queryInterface.addIndex('integration_credentials', ['organization_id', 'provider'], {
      unique: true,
      name: 'integration_credentials_org_provider_unique',
      where: { status: 'active' },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE integration_credentials ADD CONSTRAINT chk_integration_credentials_status
        CHECK (status IN ('active', 'inactive'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('integration_credentials');
  },
};

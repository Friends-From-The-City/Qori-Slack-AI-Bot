'use strict';

/**
 * PLAT-3: Create identity_provider_bindings table.
 *
 * Maps OIDC issuers to organizations. Separate from adapter_workspace_bindings
 * because Slack workspace mappings and IdP issuers are different domain concepts.
 *
 * Invariant: (provider, issuer_url) uniquely resolves to exactly one organization
 * when status='active'. No ambiguous resolution.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('identity_provider_bindings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      provider: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      issuer_url: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      client_id: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'active',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Deterministic mapping: one active issuer → one organization
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_idp_bindings_active_issuer
        ON identity_provider_bindings (provider, issuer_url)
        WHERE status = 'active';
    `);

    // Provider constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE identity_provider_bindings ADD CONSTRAINT chk_idp_bindings_provider
        CHECK (provider IN ('oidc', 'saml'));
    `);

    // Status constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE identity_provider_bindings ADD CONSTRAINT chk_idp_bindings_status
        CHECK (status IN ('active', 'inactive'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('identity_provider_bindings');
  },
};

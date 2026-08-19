'use strict';

/**
 * PLAT-3: Add provider_issuer to actor_identities for OIDC identity uniqueness.
 *
 * Two different IdPs may issue the same `sub`. Identity uniqueness must be:
 *   - For issuer-scoped identities (OIDC): UNIQUE(provider, provider_issuer, provider_subject)
 *   - For non-issuer identities (Slack):    UNIQUE(provider, provider_subject)
 *
 * Implemented via two partial unique indexes (PostgreSQL NULL semantics).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add nullable provider_issuer column
    await queryInterface.addColumn('actor_identities', 'provider_issuer', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // 2. Drop existing unique index
    await queryInterface.removeIndex('actor_identities', 'uq_actor_identities_provider_subject');

    // 3. Create partial unique index for issuer-scoped identities (OIDC)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_actor_identities_with_issuer
        ON actor_identities (provider, provider_issuer, provider_subject)
        WHERE provider_issuer IS NOT NULL;
    `);

    // 4. Create partial unique index for non-issuer identities (Slack)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_actor_identities_without_issuer
        ON actor_identities (provider, provider_subject)
        WHERE provider_issuer IS NULL;
    `);
  },

  async down(queryInterface) {
    // Remove partial indexes
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS uq_actor_identities_with_issuer;',
    );
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS uq_actor_identities_without_issuer;',
    );

    // Restore original unique index
    await queryInterface.addIndex('actor_identities', ['provider', 'provider_subject'], {
      unique: true,
      name: 'uq_actor_identities_provider_subject',
    });

    // Remove column
    await queryInterface.removeColumn('actor_identities', 'provider_issuer');
  },
};

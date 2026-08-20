'use strict';

/**
 * WS-0: Organization-level membership and roles.
 *
 * Introduces org-scoped authorization separate from project-level membership.
 * A project owner does NOT automatically get organization admin authority.
 *
 * Roles:
 *   owner  — full organization administration
 *   admin  — org users/teams/config/integrations (no destructive owner transfer)
 *   member — no org-admin API access; project access via project_memberships
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organization_memberships', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      actor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'actors', key: 'id' },
        onDelete: 'CASCADE',
      },
      role: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'member',
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

    // Unique: one membership per actor per org
    await queryInterface.addIndex('organization_memberships', ['organization_id', 'actor_id'], {
      unique: true,
      name: 'organization_memberships_org_actor_unique',
    });

    // Role constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE organization_memberships ADD CONSTRAINT chk_org_membership_role
        CHECK (role IN ('owner', 'admin', 'member'));
    `);

    // ── Backfill ────────────────────────────────────────────────────
    //
    // BOOTSTRAP RULE:
    //   All existing actors are backfilled as 'member' ONLY.
    //   No actor is inferred as owner from creation order, email,
    //   Slack identity, GitHub identity, project ownership, or first login.
    //
    //   Organization owner must be assigned explicitly via:
    //   1. The bootstrap CLI command: npm run admin:bootstrap-owner
    //   2. Direct SQL by the deployment operator
    //
    //   Until an owner is assigned, admin API endpoints return 403 for
    //   all actors. This is intentional — it forces explicit operator
    //   assignment of the initial org owner.
    //
    await queryInterface.sequelize.query(`
      INSERT INTO organization_memberships (organization_id, actor_id, role)
      SELECT a.organization_id, a.id, 'member'
      FROM actors a
      WHERE a.status = 'active'
      ON CONFLICT DO NOTHING
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('organization_memberships');
  },
};

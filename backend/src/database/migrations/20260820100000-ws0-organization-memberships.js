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
    // Mapping rule:
    //   For each organization, find actors that exist in that org.
    //   The FIRST actor created in each org (lowest actor.id) becomes 'owner'.
    //   All other actors become 'member'.
    //
    // This is deterministic and conservative:
    //   - Does NOT grant org admin to every project owner
    //   - Only the earliest actor (likely the person who set up the org) gets owner
    //   - Everyone else starts as member — admin can be granted manually
    //
    await queryInterface.sequelize.query(`
      INSERT INTO organization_memberships (organization_id, actor_id, role)
      SELECT
        a.organization_id,
        a.id,
        CASE
          WHEN a.id = first_actor.min_id THEN 'owner'
          ELSE 'member'
        END
      FROM actors a
      INNER JOIN (
        SELECT organization_id, MIN(id) as min_id
        FROM actors
        WHERE status = 'active'
        GROUP BY organization_id
      ) first_actor ON a.organization_id = first_actor.organization_id
      WHERE a.status = 'active'
      ON CONFLICT DO NOTHING
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('organization_memberships');
  },
};

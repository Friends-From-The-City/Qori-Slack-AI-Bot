'use strict';

/**
 * PLAT-2: Backfill — Create default organization and map existing data.
 *
 * This migration creates a single default organization for the current
 * deployment and associates all existing projects with it. It also:
 *
 *   - Creates a default team from QORI_TEAM_SLUG (or 'default')
 *   - Creates canonical actors from existing project_members.user_id
 *   - Creates actor identities (provider=slack) for each unique user
 *   - Creates project_memberships from existing project_members
 *   - Assigns projects.organization_id to the default org
 *
 * This migration is deterministic and idempotent. It does not destroy any
 * existing data. It does not hard-code organization-specific names —
 * the default org uses env-configurable or generic names.
 *
 * After this migration, projects.organization_id is still nullable at the
 * schema level. A subsequent migration will enforce NOT NULL once the
 * backfill is verified.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ─── 1. Create default organization ────────────────────────
      // Use a generic name; deploying organizations rename via admin tooling
      const [orgs] = await queryInterface.sequelize.query(`
        INSERT INTO organizations (slug, name, status)
        VALUES ('default', 'Default Organization', 'active')
        ON CONFLICT (slug) DO NOTHING
        RETURNING id;
      `, { transaction });

      let orgId;
      if (orgs.length > 0) {
        orgId = orgs[0].id;
      } else {
        // Already exists (idempotent re-run)
        const [existing] = await queryInterface.sequelize.query(
          `SELECT id FROM organizations WHERE slug = 'default';`,
          { transaction },
        );
        orgId = existing[0].id;
      }

      // ─── 2. Create default team ───────────────────────────────
      const teamSlug = process.env.QORI_TEAM_SLUG || 'default';
      const teamName = teamSlug === 'default' ? 'Default Team' : teamSlug;

      const [teams] = await queryInterface.sequelize.query(`
        INSERT INTO teams (organization_id, slug, name, status)
        VALUES (:orgId, :slug, :name, 'active')
        ON CONFLICT (organization_id, slug) DO NOTHING
        RETURNING id;
      `, {
        replacements: { orgId, slug: teamSlug, name: teamName },
        transaction,
      });

      let teamId;
      if (teams.length > 0) {
        teamId = teams[0].id;
      } else {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT id FROM teams WHERE organization_id = :orgId AND slug = :slug;`,
          { replacements: { orgId, slug: teamSlug }, transaction },
        );
        teamId = existing[0].id;
      }

      // ─── 3. Assign all existing projects to default org/team ───
      await queryInterface.sequelize.query(`
        UPDATE projects
        SET organization_id = :orgId, team_id = :teamId
        WHERE organization_id IS NULL;
      `, { replacements: { orgId, teamId }, transaction });

      // ─── 4. Create actors from unique user_ids in project_members
      const [uniqueUsers] = await queryInterface.sequelize.query(`
        SELECT DISTINCT user_id FROM project_members
        UNION
        SELECT DISTINCT created_by AS user_id FROM projects
        WHERE created_by IS NOT NULL;
      `, { transaction });

      for (const row of uniqueUsers) {
        const userId = row.user_id;
        if (!userId) continue;

        // Create actor (skip if identity already exists — idempotent)
        const [existingIdentity] = await queryInterface.sequelize.query(`
          SELECT a.id FROM actors a
          JOIN actor_identities ai ON ai.actor_id = a.id
          WHERE ai.provider = 'slack' AND ai.provider_subject = :userId;
        `, { replacements: { userId }, transaction });

        if (existingIdentity.length > 0) continue;

        const [actors] = await queryInterface.sequelize.query(`
          INSERT INTO actors (organization_id, display_name, status)
          VALUES (:orgId, NULL, 'active')
          RETURNING id;
        `, { replacements: { orgId }, transaction });

        const actorId = actors[0].id;

        await queryInterface.sequelize.query(`
          INSERT INTO actor_identities (actor_id, provider, provider_subject)
          VALUES (:actorId, 'slack', :userId)
          ON CONFLICT (provider, provider_subject) DO NOTHING;
        `, { replacements: { actorId, userId }, transaction });
      }

      // ─── 5. Create project_memberships from project_members ────
      // Map each project_member to the canonical actor via identity lookup
      const [members] = await queryInterface.sequelize.query(`
        SELECT pm.project_id, pm.user_id, pm.role
        FROM project_members pm;
      `, { transaction });

      for (const member of members) {
        const [actorRows] = await queryInterface.sequelize.query(`
          SELECT a.id FROM actors a
          JOIN actor_identities ai ON ai.actor_id = a.id
          WHERE ai.provider = 'slack' AND ai.provider_subject = :userId;
        `, { replacements: { userId: member.user_id }, transaction });

        if (actorRows.length === 0) continue;

        const actorId = actorRows[0].id;
        // Map old roles: owner→owner, member→researcher
        const role = member.role === 'owner' ? 'owner' : 'researcher';

        await queryInterface.sequelize.query(`
          INSERT INTO project_memberships (project_id, actor_id, role)
          VALUES (:projectId, :actorId, :role)
          ON CONFLICT (project_id, actor_id) DO NOTHING;
        `, { replacements: { projectId: member.project_id, actorId, role }, transaction });
      }

      await transaction.commit();
      console.log(`PLAT-2 backfill complete: org=${orgId}, team=${teamId}, users=${uniqueUsers.length}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    // Remove backfilled data (reversible)
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Clear project_memberships (all are backfilled)
      await queryInterface.sequelize.query(`DELETE FROM project_memberships;`, { transaction });
      // Clear actor_identities and actors
      await queryInterface.sequelize.query(`DELETE FROM actor_identities;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM actors;`, { transaction });
      // Unassign projects
      await queryInterface.sequelize.query(`
        UPDATE projects SET organization_id = NULL, team_id = NULL;
      `, { transaction });
      // Remove default team and org
      await queryInterface.sequelize.query(`DELETE FROM teams WHERE slug IN ('default', '${process.env.QORI_TEAM_SLUG || 'default'}');`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM organizations WHERE slug = 'default';`, { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

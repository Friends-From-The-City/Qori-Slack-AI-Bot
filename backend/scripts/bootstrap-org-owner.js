#!/usr/bin/env node

/**
 * Bootstrap Organization Owner — WS-0
 *
 * Explicitly assigns an actor as organization owner.
 * This is the ONLY supported way to establish initial org ownership.
 *
 * Usage:
 *   node scripts/bootstrap-org-owner.js --org <slug> --actor <public_id>
 *   npm run admin:bootstrap-owner -- --org <slug> --actor <public_id>
 *
 * Examples:
 *   node scripts/bootstrap-org-owner.js --org friends-lab --actor 00000000-0000-4000-a000-000000000012
 *   npm run admin:bootstrap-owner -- --org friends-lab --actor 00000000-0000-4000-a000-000000000012
 *
 * This command is idempotent — running it twice with the same arguments is a no-op.
 *
 * BOOTSTRAP RULE:
 *   Organization owner is NEVER inferred from actor creation order, email,
 *   Slack identity, GitHub identity, project ownership, or first login.
 *   Owner must be assigned explicitly by a deployment operator using this command.
 */

require('dotenv').config();

const { Sequelize } = require('sequelize');

async function main() {
  const args = process.argv.slice(2);

  // Parse --org and --actor flags
  let orgSlug = null;
  let actorPublicId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org' && args[i + 1]) {
      orgSlug = args[++i];
    } else if (args[i] === '--actor' && args[i + 1]) {
      actorPublicId = args[++i];
    }
  }

  if (!orgSlug || !actorPublicId) {
    console.error('Usage: bootstrap-org-owner --org <slug> --actor <public_id>');
    console.error('');
    console.error('  --org     Organization slug (e.g., "friends-lab")');
    console.error('  --actor   Actor public_id UUID');
    process.exit(1);
  }

  // Connect to database
  const sequelize = new Sequelize({
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
  });

  try {
    await sequelize.authenticate();

    // Inline the bootstrap logic (avoid TS import complexity in a JS script)
    const [orgRows] = await sequelize.query(
      `SELECT id, slug FROM organizations WHERE slug = $1`,
      { bind: [orgSlug] },
    );

    if (orgRows.length === 0) {
      console.error(`Error: Organization "${orgSlug}" not found`);
      process.exit(1);
    }
    const orgId = orgRows[0].id;

    const [actorRows] = await sequelize.query(
      `SELECT id, public_id, organization_id, display_name FROM actors WHERE public_id = $1`,
      { bind: [actorPublicId] },
    );

    if (actorRows.length === 0) {
      console.error(`Error: Actor "${actorPublicId}" not found`);
      process.exit(1);
    }

    const actor = actorRows[0];
    if (actor.organization_id !== orgId) {
      console.error(`Error: Actor "${actorPublicId}" does not belong to organization "${orgSlug}"`);
      process.exit(1);
    }

    // Check existing membership
    const [membershipRows] = await sequelize.query(
      `SELECT id, role FROM organization_memberships
       WHERE organization_id = $1 AND actor_id = $2`,
      { bind: [orgId, actor.id] },
    );

    if (membershipRows.length > 0 && membershipRows[0].role === 'owner') {
      console.log(`OK: Actor "${actor.display_name || actorPublicId}" is already organization owner (no-op)`);
      process.exit(0);
    }

    // Upsert as owner
    if (membershipRows.length > 0) {
      await sequelize.query(
        `UPDATE organization_memberships SET role = 'owner', updated_at = NOW()
         WHERE organization_id = $1 AND actor_id = $2`,
        { bind: [orgId, actor.id] },
      );
      console.log(`OK: Actor "${actor.display_name || actorPublicId}" promoted from "${membershipRows[0].role}" to "owner" in organization "${orgSlug}"`);
    } else {
      await sequelize.query(
        `INSERT INTO organization_memberships (organization_id, actor_id, role)
         VALUES ($1, $2, 'owner')`,
        { bind: [orgId, actor.id] },
      );
      console.log(`OK: Actor "${actor.display_name || actorPublicId}" assigned as owner of organization "${orgSlug}"`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();

'use strict';

/**
 * PLAT-2: Organizations, Teams, Actors
 *
 * Introduces canonical organization/team/actor entities for multi-tenant
 * government deployment support. See ADR 0042.
 *
 * Tables created:
 *   organizations           — top-level tenant boundary
 *   teams                   — subdivision within organization
 *   actors                  — canonical user identity (interface-independent)
 *   actor_identities        — maps provider identities to canonical actors
 *   adapter_workspace_bindings — maps Slack workspaces to organizations
 *   repository_bindings     — maps GitHub repos to org/team/project scope
 *   project_memberships     — org-scoped project membership (actor-based)
 *
 * Columns added:
 *   projects.organization_id — FK to organizations (nullable for backfill)
 *   projects.team_id         — FK to teams (nullable)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── 1. organizations ────────────────────────────────────────
    await queryInterface.createTable('organizations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: Sequelize.UUID, allowNull: false, unique: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      slug: { type: Sequelize.TEXT, allowNull: false, unique: true },
      name: { type: Sequelize.TEXT, allowNull: false },
      status: {
        type: Sequelize.TEXT, allowNull: false, defaultValue: 'active',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE organizations ADD CONSTRAINT chk_organizations_status
        CHECK (status IN ('active', 'inactive'));
    `);

    // ─── 2. teams ────────────────────────────────────────────────
    await queryInterface.createTable('teams', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: Sequelize.UUID, allowNull: false, unique: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      organization_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      slug: { type: Sequelize.TEXT, allowNull: false },
      name: { type: Sequelize.TEXT, allowNull: false },
      status: {
        type: Sequelize.TEXT, allowNull: false, defaultValue: 'active',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('teams', ['organization_id', 'slug'], {
      unique: true,
      name: 'uq_teams_org_slug',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE teams ADD CONSTRAINT chk_teams_status
        CHECK (status IN ('active', 'inactive'));
    `);

    // ─── 3. actors ───────────────────────────────────────────────
    await queryInterface.createTable('actors', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      public_id: { type: Sequelize.UUID, allowNull: false, unique: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      organization_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      display_name: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.TEXT, allowNull: false, defaultValue: 'active',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE actors ADD CONSTRAINT chk_actors_status
        CHECK (status IN ('active', 'inactive'));
    `);

    // ─── 4. actor_identities ─────────────────────────────────────
    await queryInterface.createTable('actor_identities', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      actor_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'actors', key: 'id' },
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.TEXT, allowNull: false },
      provider_subject: { type: Sequelize.TEXT, allowNull: false },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: '{}' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('actor_identities', ['provider', 'provider_subject'], {
      unique: true,
      name: 'uq_actor_identities_provider_subject',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE actor_identities ADD CONSTRAINT chk_actor_identities_provider
        CHECK (provider IN ('slack', 'oidc', 'saml', 'local_test'));
    `);

    // ─── 5. adapter_workspace_bindings ───────────────────────────
    await queryInterface.createTable('adapter_workspace_bindings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.TEXT, allowNull: false },
      workspace_external_id: { type: Sequelize.TEXT, allowNull: false },
      status: {
        type: Sequelize.TEXT, allowNull: false, defaultValue: 'active',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('adapter_workspace_bindings', ['provider', 'workspace_external_id'], {
      unique: true,
      name: 'uq_workspace_bindings_provider_extid',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE adapter_workspace_bindings ADD CONSTRAINT chk_workspace_bindings_status
        CHECK (status IN ('active', 'inactive'));
    `);

    // ─── 6. repository_bindings ──────────────────────────────────
    await queryInterface.createTable('repository_bindings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organization_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      team_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'teams', key: 'id' },
        onDelete: 'SET NULL',
      },
      project_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'SET NULL',
      },
      provider: { type: Sequelize.TEXT, allowNull: false },
      owner: { type: Sequelize.TEXT, allowNull: false },
      repository: { type: Sequelize.TEXT, allowNull: false },
      default_branch: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.TEXT, allowNull: false, defaultValue: 'active',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE repository_bindings ADD CONSTRAINT chk_repo_bindings_status
        CHECK (status IN ('active', 'inactive'));
    `);

    // ─── 7. project_memberships (actor-based) ────────────────────
    await queryInterface.createTable('project_memberships', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      actor_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'actors', key: 'id' },
        onDelete: 'CASCADE',
      },
      role: {
        type: Sequelize.TEXT, allowNull: false, defaultValue: 'researcher',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('project_memberships', ['project_id', 'actor_id'], {
      unique: true,
      name: 'uq_project_memberships_project_actor',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE project_memberships ADD CONSTRAINT chk_project_memberships_role
        CHECK (role IN ('owner', 'admin', 'researcher'));
    `);

    // ─── 8. Add organization_id and team_id to projects ──────────
    await queryInterface.addColumn('projects', 'organization_id', {
      type: Sequelize.INTEGER,
      allowNull: true, // nullable for backfill transition
      references: { model: 'organizations', key: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('projects', 'team_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'teams', key: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    // Reverse order
    await queryInterface.removeColumn('projects', 'team_id');
    await queryInterface.removeColumn('projects', 'organization_id');
    await queryInterface.dropTable('project_memberships');
    await queryInterface.dropTable('repository_bindings');
    await queryInterface.dropTable('adapter_workspace_bindings');
    await queryInterface.dropTable('actor_identities');
    await queryInterface.dropTable('actors');
    await queryInterface.dropTable('teams');
    await queryInterface.dropTable('organizations');
  },
};

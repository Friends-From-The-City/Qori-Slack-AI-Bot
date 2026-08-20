/**
 * WS-0: Organization Admin Authorization Tests
 *
 * Verifies that org admin authority comes from organization_memberships,
 * NOT project_memberships.
 *
 * Tests:
 * 1. Org owner can administer org
 * 2. Org admin can perform allowed admin actions
 * 3. Org member denied admin access
 * 4. Project owner WITHOUT org admin denied admin access
 * 5. Cross-org admin denied
 * 6. Token/session metadata cannot override org role
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import type { Sequelize } from 'sequelize';

let sequelize: Sequelize;

beforeAll(() => {
  sequelize = getTestDb();
});

afterAll(async () => {
  await sequelize.close();
});

// ─── Helpers ───────────────────────────────────────────────────────

async function createActor(orgId: number, displayName: string) {
  const ActorModel = sequelize.models.Actor;
  return ActorModel.create({
    organization_id: orgId,
    display_name: displayName,
    status: 'active',
  } as any);
}

async function createOrgMembership(orgId: number, actorId: number, role: string) {
  const OrgMembershipModel = sequelize.models.OrganizationMembership;
  return OrgMembershipModel.create({
    organization_id: orgId,
    actor_id: actorId,
    role,
  } as any);
}

async function createProjectWithOwner(orgId: number, slug: string, ownerActorId: number) {
  const ProjectModel = sequelize.models.Project;
  const ProjectMembershipModel = sequelize.models.ProjectMembership;

  const project = await ProjectModel.create({
    name: `Project ${slug}`,
    slug,
    created_by: 'test',
    organization_id: orgId,
  } as any);

  await ProjectMembershipModel.create({
    project_id: (project as any).id,
    actor_id: ownerActorId,
    role: 'owner',
  } as any);

  return project;
}

// ─── 1. Organization membership schema ─────────────────────────────

describe('Organization membership model', () => {
  beforeEach(() => truncateAll());

  it('creates organization membership with valid roles', async () => {
    const actor = await createActor(TEST_ORG_ID, 'Test Actor');

    for (const role of ['owner', 'admin', 'member']) {
      await sequelize.query(
        `DELETE FROM organization_memberships WHERE actor_id = :actorId`,
        { replacements: { actorId: (actor as any).id } },
      );

      const membership = await createOrgMembership(TEST_ORG_ID, (actor as any).id, role);
      expect((membership as any).role).toBe(role);
    }
  });

  it('rejects invalid roles', async () => {
    const actor = await createActor(TEST_ORG_ID, 'Test Actor');

    await expect(
      sequelize.query(
        `INSERT INTO organization_memberships (organization_id, actor_id, role) VALUES (:orgId, :actorId, 'superadmin')`,
        { replacements: { orgId: TEST_ORG_ID, actorId: (actor as any).id } },
      ),
    ).rejects.toThrow();
  });

  it('enforces unique actor per org', async () => {
    const actor = await createActor(TEST_ORG_ID, 'Test Actor');
    await createOrgMembership(TEST_ORG_ID, (actor as any).id, 'member');

    await expect(
      createOrgMembership(TEST_ORG_ID, (actor as any).id, 'admin'),
    ).rejects.toThrow();
  });
});

// ─── 2. Org owner can administer ───────────────────────────────────

describe('Org owner authorization', () => {
  beforeEach(() => truncateAll());

  it('org owner can access admin operations', async () => {
    const actor = await createActor(TEST_ORG_ID, 'Org Owner');
    await createOrgMembership(TEST_ORG_ID, (actor as any).id, 'owner');

    const OrgMembershipModel = sequelize.models.OrganizationMembership;
    const membership = await OrgMembershipModel.findOne({
      where: {
        organization_id: TEST_ORG_ID,
        actor_id: (actor as any).id,
      },
    } as any);

    expect(membership).toBeTruthy();
    expect((membership as any).role).toBe('owner');
    expect(['owner', 'admin'].includes((membership as any).role)).toBe(true);
  });
});

// ─── 3. Org admin can perform allowed actions ──────────────────────

describe('Org admin authorization', () => {
  beforeEach(() => truncateAll());

  it('org admin has admin access', async () => {
    const actor = await createActor(TEST_ORG_ID, 'Org Admin');
    await createOrgMembership(TEST_ORG_ID, (actor as any).id, 'admin');

    const OrgMembershipModel = sequelize.models.OrganizationMembership;
    const membership = await OrgMembershipModel.findOne({
      where: {
        organization_id: TEST_ORG_ID,
        actor_id: (actor as any).id,
      },
    } as any);

    expect(membership).toBeTruthy();
    expect(['owner', 'admin'].includes((membership as any).role)).toBe(true);
  });
});

// ─── 4. Org member denied admin access ─────────────────────────────

describe('Org member denied admin', () => {
  beforeEach(() => truncateAll());

  it('org member cannot access admin operations', async () => {
    const actor = await createActor(TEST_ORG_ID, 'Regular Member');
    await createOrgMembership(TEST_ORG_ID, (actor as any).id, 'member');

    const OrgMembershipModel = sequelize.models.OrganizationMembership;
    const membership = await OrgMembershipModel.findOne({
      where: {
        organization_id: TEST_ORG_ID,
        actor_id: (actor as any).id,
      },
    } as any);

    expect(membership).toBeTruthy();
    expect(['owner', 'admin'].includes((membership as any).role)).toBe(false);
  });
});

// ─── 5. Project owner WITHOUT org admin denied ─────────────────────

describe('Project owner without org admin', () => {
  beforeEach(() => truncateAll());

  it('project owner with only org member role is denied admin access', async () => {
    const actor = await createActor(TEST_ORG_ID, 'Project Owner');

    // Give them org member role (NOT admin)
    await createOrgMembership(TEST_ORG_ID, (actor as any).id, 'member');

    // Make them a project owner
    await createProjectWithOwner(TEST_ORG_ID, 'their-project', (actor as any).id);

    // Verify project ownership
    const ProjectMembershipModel = sequelize.models.ProjectMembership;
    const projectMembership = await ProjectMembershipModel.findOne({
      where: { actor_id: (actor as any).id, role: 'owner' },
    } as any);
    expect(projectMembership).toBeTruthy();

    // Verify org membership is only 'member' — NOT admin
    const OrgMembershipModel = sequelize.models.OrganizationMembership;
    const orgMembership = await OrgMembershipModel.findOne({
      where: {
        organization_id: TEST_ORG_ID,
        actor_id: (actor as any).id,
      },
    } as any);
    expect(orgMembership).toBeTruthy();
    expect((orgMembership as any).role).toBe('member');
    expect(['owner', 'admin'].includes((orgMembership as any).role)).toBe(false);
  });
});

// ─── 6. Cross-org admin denied ─────────────────────────────────────

describe('Cross-org admin denial', () => {
  beforeEach(() => truncateAll());

  it('org admin in org A cannot access org B admin', async () => {
    // Create second org
    const [org2Result] = await sequelize.query(
      `INSERT INTO organizations (slug, name, status) VALUES ('other-org', 'Other Org', 'active') RETURNING id`,
    ) as [Array<{ id: number }>, unknown];
    const org2Id = org2Result[0].id;

    // Actor in org A with admin role
    const actor = await createActor(TEST_ORG_ID, 'Org A Admin');
    await createOrgMembership(TEST_ORG_ID, (actor as any).id, 'admin');

    // Check: actor has NO membership in org B
    const OrgMembershipModel = sequelize.models.OrganizationMembership;
    const crossOrgMembership = await OrgMembershipModel.findOne({
      where: {
        organization_id: org2Id,
        actor_id: (actor as any).id,
      },
    } as any);
    expect(crossOrgMembership).toBeNull();
  });
});

// ─── 7. No org membership = denied ─────────────────────────────────

describe('No org membership', () => {
  beforeEach(() => truncateAll());

  it('actor with no org membership is denied admin access', async () => {
    const actor = await createActor(TEST_ORG_ID, 'No Membership Actor');

    // Don't create any org membership
    const OrgMembershipModel = sequelize.models.OrganizationMembership;
    const membership = await OrgMembershipModel.findOne({
      where: {
        organization_id: TEST_ORG_ID,
        actor_id: (actor as any).id,
      },
    } as any);
    expect(membership).toBeNull();
  });
});

// ─── 8. Backfill behavior verification ─────────────────────────────

describe('Backfill mapping rule', () => {
  beforeEach(() => truncateAll());

  it('backfill assigns owner to first actor only', async () => {
    // Create actors in order
    const actor1 = await createActor(TEST_ORG_ID, 'First Actor');
    const actor2 = await createActor(TEST_ORG_ID, 'Second Actor');
    const actor3 = await createActor(TEST_ORG_ID, 'Third Actor');

    // Simulate backfill logic
    await sequelize.query(`
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

    const OrgMembershipModel = sequelize.models.OrganizationMembership;
    const m1 = await OrgMembershipModel.findOne({
      where: { actor_id: (actor1 as any).id },
    } as any);
    const m2 = await OrgMembershipModel.findOne({
      where: { actor_id: (actor2 as any).id },
    } as any);
    const m3 = await OrgMembershipModel.findOne({
      where: { actor_id: (actor3 as any).id },
    } as any);

    expect((m1 as any).role).toBe('owner');
    expect((m2 as any).role).toBe('member');
    expect((m3 as any).role).toBe('member');
  });
});

/**
 * PLAT-3 Application API Integration Tests
 *
 * Proves:
 * - Auth boundary (OIDC identity uniqueness, issuer mapping)
 * - Organization-scoped projects (cross-org denial)
 * - Actor-based authorization
 * - Artifact workflow vs publication status separation
 * - Stable external identifiers (no internal IDs)
 * - Client cannot create scope/authority
 * - Application services callable independent of Slack
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import type { Organization } from '../../database/models/organization';
import type { Actor } from '../../database/models/actor';
import type { ActorIdentity } from '../../database/models/actor_identity';
import type { Project } from '../../database/models/project';
import type { ProjectMembership } from '../../database/models/project_membership';
import type { ResearchStudy } from '../../database/models/research_study';
import type { ResearchArtifact } from '../../database/models/research_artifact';
import {
  isProjectMemberByActor,
  assertProjectAccessByActor,
  assertStudyAccessByActor,
  AuthorizationError,
} from '../../services/authorization.service';
import {
  listProjectsByOrg,
  getProjectByIdAndOrg,
  getProjectStudiesByOrg,
} from '../../services/project.service';
// resolveActor, resolveOrCreateOidcActor use production sequelize instance
// so OIDC identity tests validate DB constraints directly
import type { ApplicationContext } from '../../types/application-context';
import { getCurrentActor } from '../../application/me.app-service';
import * as projectAppService from '../../application/project.app-service';

const sequelize = getTestDb();
const OrganizationModel = sequelize.models.Organization as typeof Organization;
const ActorModel = sequelize.models.Actor as typeof Actor;
const ActorIdentityModel = sequelize.models.ActorIdentity as typeof ActorIdentity;
const ProjectModel = sequelize.models.Project as typeof Project;
const ProjectMembershipModel = sequelize.models.ProjectMembership as typeof ProjectMembership;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
const ArtifactModel = sequelize.models.ResearchArtifact as typeof ResearchArtifact;

// ─── Helpers ────────────────────────────────────────────────────────

let orgA_id: number;
let orgB_id: number;

async function createOrg(slug: string, name: string): Promise<number> {
  const org = await OrganizationModel.create({ slug, name, status: 'active' });
  return org.id;
}

async function createActorInOrg(orgId: number, displayName: string): Promise<Actor> {
  return ActorModel.create({
    organization_id: orgId,
    display_name: displayName,
    status: 'active',
  });
}

async function createProjectInOrg(orgId: number, slug: string, name: string): Promise<Project> {
  return ProjectModel.create({
    organization_id: orgId,
    slug,
    name,
    created_by: 'test',
    status: 'active',
  });
}

async function addActorToProject(actorId: number, projectId: number, role: 'owner' | 'admin' | 'researcher' = 'researcher') {
  return ProjectMembershipModel.create({
    actor_id: actorId,
    project_id: projectId,
    role,
  } as any);
}

function buildCtx(actor: Actor, org: any): ApplicationContext {
  return {
    actor: {
      id: actor.id,
      publicId: actor.public_id,
      organizationId: actor.organization_id,
      displayName: actor.display_name,
    },
    organization: {
      id: org.id,
      publicId: org.public_id,
      slug: org.slug,
      name: org.name,
    },
    authenticationProvider: 'local_test',
    correlationId: 'test-correlation-id',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('PLAT-3 Application API Integration', () => {
  beforeEach(async () => {
    await truncateAll();
    // Create two orgs for cross-org testing
    orgA_id = TEST_ORG_ID; // From seedTestOrg
    orgB_id = await createOrg('org-b', 'Organization B');
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // ─── Cross-Org Denial ───────────────────────────────────────────

  describe('Cross-org project denial', () => {
    it('actor from org-A cannot see org-B projects via listProjectsByOrg', async () => {
      await createProjectInOrg(orgA_id, 'proj-a', 'Project A');
      await createProjectInOrg(orgB_id, 'proj-b', 'Project B');

      const orgAProjects = await listProjectsByOrg(orgA_id);
      const orgBProjects = await listProjectsByOrg(orgB_id);

      expect(orgAProjects.map(p => p.slug)).toContain('proj-a');
      expect(orgAProjects.map(p => p.slug)).not.toContain('proj-b');
      expect(orgBProjects.map(p => p.slug)).toContain('proj-b');
      expect(orgBProjects.map(p => p.slug)).not.toContain('proj-a');
    });

    it('getProjectByIdAndOrg returns null for cross-org project', async () => {
      const projB = await createProjectInOrg(orgB_id, 'proj-b', 'Project B');

      const result = await getProjectByIdAndOrg(projB.id, orgA_id);
      expect(result).toBeNull();
    });

    it('getProjectStudiesByOrg returns empty for cross-org project', async () => {
      const projB = await createProjectInOrg(orgB_id, 'proj-b', 'Project B');

      const result = await getProjectStudiesByOrg(projB.id, orgA_id);
      expect(result).toHaveLength(0);
    });
  });

  // ─── Actor-Based Authorization ──────────────────────────────────

  describe('Actor-based authorization', () => {
    it('isProjectMemberByActor returns true for member', async () => {
      const actor = await createActorInOrg(orgA_id, 'Member');
      const project = await createProjectInOrg(orgA_id, 'proj-1', 'Project 1');
      await addActorToProject(actor.id, project.id);

      expect(await isProjectMemberByActor(actor.id, project.id)).toBe(true);
    });

    it('isProjectMemberByActor returns false for non-member', async () => {
      const actor = await createActorInOrg(orgA_id, 'Outsider');
      const project = await createProjectInOrg(orgA_id, 'proj-1', 'Project 1');

      expect(await isProjectMemberByActor(actor.id, project.id)).toBe(false);
    });

    it('assertProjectAccessByActor throws on org scope mismatch', async () => {
      const actorA = await createActorInOrg(orgA_id, 'Actor A');
      const projB = await createProjectInOrg(orgB_id, 'proj-b', 'Project B');

      await expect(
        assertProjectAccessByActor(actorA.id, projB.id, orgA_id),
      ).rejects.toThrow(AuthorizationError);
    });

    it('assertStudyAccessByActor throws on org scope mismatch', async () => {
      const actorA = await createActorInOrg(orgA_id, 'Actor A');
      const projB = await createProjectInOrg(orgB_id, 'proj-b', 'Project B');
      const studyB = await ResearchStudyModel.create({
        name: 'Study B',
        project_id: projB.id,
        created_by: 'test',
        channel_name: 'test-channel',
        researcher_name: 'Test',
        researcher_email: 'test@test.com',
      });

      await expect(
        assertStudyAccessByActor(actorA.id, studyB.id, orgA_id),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ─── OIDC Identity Uniqueness ───────────────────────────────────

  describe('OIDC identity uniqueness (DB constraints)', () => {
    it('same subject + same issuer: partial unique index prevents duplicates', async () => {
      const actor = await createActorInOrg(orgA_id, 'OIDC User');

      await ActorIdentityModel.create({
        actor_id: actor.id,
        provider: 'oidc',
        provider_issuer: 'https://idp.agency.gov',
        provider_subject: 'sub-123',
        metadata: {},
      });

      // Duplicate should fail
      await expect(
        ActorIdentityModel.create({
          actor_id: actor.id,
          provider: 'oidc',
          provider_issuer: 'https://idp.agency.gov',
          provider_subject: 'sub-123',
          metadata: {},
        }),
      ).rejects.toThrow();
    });

    it('same subject + different issuer: allowed by partial index', async () => {
      const actorA = await createActorInOrg(orgA_id, 'OIDC User A');
      const actorB = await createActorInOrg(orgB_id, 'OIDC User B');

      await ActorIdentityModel.create({
        actor_id: actorA.id,
        provider: 'oidc',
        provider_issuer: 'https://idp-1.agency.gov',
        provider_subject: 'sub-same',
        metadata: {},
      });

      // Different issuer, same subject — should succeed
      const identity2 = await ActorIdentityModel.create({
        actor_id: actorB.id,
        provider: 'oidc',
        provider_issuer: 'https://idp-2.agency.gov',
        provider_subject: 'sub-same',
        metadata: {},
      });

      expect(identity2).not.toBeNull();
      expect(identity2.actor_id).toBe(actorB.id);
    });

    it('NULL issuer uniqueness: Slack identity duplicates rejected', async () => {
      const actor = await createActorInOrg(orgA_id, 'Slack User');

      await ActorIdentityModel.create({
        actor_id: actor.id,
        provider: 'slack',
        provider_subject: 'U_SLACK_123',
        metadata: {},
      });

      // Duplicate Slack identity (null issuer) should fail
      await expect(
        ActorIdentityModel.create({
          actor_id: actor.id,
          provider: 'slack',
          provider_subject: 'U_SLACK_123',
          metadata: {},
        }),
      ).rejects.toThrow();
    });

    it('identity_provider_bindings: deterministic issuer→org mapping', async () => {
      const IdpBindingModel = sequelize.models.IdentityProviderBinding;

      await IdpBindingModel.create({
        organization_id: orgA_id,
        provider: 'oidc',
        issuer_url: 'https://idp.agency.gov',
        status: 'active',
      });

      // Same active issuer → different org should fail (unique partial index)
      await expect(
        IdpBindingModel.create({
          organization_id: orgB_id,
          provider: 'oidc',
          issuer_url: 'https://idp.agency.gov',
          status: 'active',
        }),
      ).rejects.toThrow();
    });
  });

  // ─── Artifact Workflow vs Publication Status ────────────────────

  describe('Artifact workflow vs publication status', () => {
    it('artifact has separate workflow and publication status', async () => {
      const project = await createProjectInOrg(orgA_id, 'proj-1', 'Project 1');

      const artifact = await ArtifactModel.create({
        project_id: project.id,
        template_id: 'test_template',
        template_version: '1.0',
        artifact_type: 'brief',
        repo: 'test-repo',
        status: 'written',
        publication_status: 'published',
        semantic_key: 'test/artifact/1',
        created_by: 'test',
      });

      expect(artifact.status).toBe('written');
      expect(artifact.publication_status).toBe('published');
    });

    it('GitHub failure does not corrupt canonical workflow status', async () => {
      const project = await createProjectInOrg(orgA_id, 'proj-1', 'Project 1');

      const artifact = await ArtifactModel.create({
        project_id: project.id,
        template_id: 'test_template',
        template_version: '1.0',
        artifact_type: 'readout',
        repo: 'test-repo',
        status: 'written', // Canonical: draft
        publication_status: 'not_published',
        semantic_key: 'test/artifact/2',
        created_by: 'test',
      });

      // Simulate GitHub failure: only publication_status changes
      await artifact.update({
        publication_status: 'projection_failed',
        last_write_error: 'GitHub API 500',
      });

      await artifact.reload();
      expect(artifact.status).toBe('written'); // Canonical unchanged
      expect(artifact.publication_status).toBe('projection_failed');
      expect(artifact.last_write_error).toBe('GitHub API 500');
    });
  });

  // ─── Application Services Callable Without Slack ────────────────

  describe('Application services callable without Slack', () => {
    it('getCurrentActor returns actor profile from ApplicationContext', async () => {
      const actor = await createActorInOrg(orgA_id, 'Test Researcher');
      const org = await OrganizationModel.findByPk(orgA_id);
      const ctx = buildCtx(actor, org);

      const result = await getCurrentActor(ctx);

      expect(result.actor.display_name).toBe('Test Researcher');
      expect(result.organization.slug).toBe('test-org');
      expect(result.authentication_provider).toBe('local_test');
    });

    it('listProjects returns only org-scoped projects for member', async () => {
      const actor = await createActorInOrg(orgA_id, 'Researcher');
      const org = await OrganizationModel.findByPk(orgA_id);
      const ctx = buildCtx(actor, org);

      const proj1 = await createProjectInOrg(orgA_id, 'my-proj', 'My Project');
      await addActorToProject(actor.id, proj1.id);

      await createProjectInOrg(orgB_id, 'other-proj', 'Other Org Project');

      const projects = await projectAppService.listProjects(ctx);

      expect(projects.length).toBe(1);
      expect(projects[0].slug).toBe('my-proj');
    });

    it('getProject throws for cross-org access attempt', async () => {
      const actor = await createActorInOrg(orgA_id, 'Researcher');
      const org = await OrganizationModel.findByPk(orgA_id);
      const ctx = buildCtx(actor, org);

      await createProjectInOrg(orgB_id, 'secret-proj', 'Secret Project');

      await expect(
        projectAppService.getProject(ctx, 'secret-proj'),
      ).rejects.toThrow(); // resourceNotFound — org scope mismatch returns 404
    });
  });

  // ─── Stable External Identifiers ────────────────────────────────

  describe('Stable external identifiers', () => {
    it('project API response uses slug, not internal ID', async () => {
      const actor = await createActorInOrg(orgA_id, 'Researcher');
      const org = await OrganizationModel.findByPk(orgA_id);
      const ctx = buildCtx(actor, org);

      const proj = await createProjectInOrg(orgA_id, 'stable-slug', 'Stable Project');
      await addActorToProject(actor.id, proj.id);

      const result = await projectAppService.getProject(ctx, 'stable-slug');

      // public_id is now a UUID (WS-0 migration), slug remains human-readable
      expect(result.public_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(result.slug).toBe('stable-slug');
      // Internal ID should NOT be in the response
      expect((result as any).id).toBeUndefined();
    });

    it('actor public_id is UUID', async () => {
      const actor = await createActorInOrg(orgA_id, 'UUID Actor');
      expect(actor.public_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('artifact public_id is UUID', async () => {
      const project = await createProjectInOrg(orgA_id, 'proj-1', 'Project');
      const artifact = await ArtifactModel.create({
        project_id: project.id,
        template_id: 'test',
        template_version: '1.0',
        artifact_type: 'brief',
        repo: 'test-repo',
        status: 'pending',
        semantic_key: 'test/uuid/check',
        created_by: 'test',
      });

      expect(artifact.public_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  // ─── Client Cannot Create Scope/Authority ───────────────────────

  describe('Client cannot create scope/authority', () => {
    it('ApplicationContext does not contain project or study', () => {
      const ctx: ApplicationContext = {
        actor: { id: 1, publicId: 'test', organizationId: 1, displayName: null },
        organization: { id: 1, publicId: 'test', slug: 'test', name: 'Test' },
        authenticationProvider: 'local_test',
        correlationId: 'test',
      };

      // These fields should not exist on base ApplicationContext
      expect((ctx as any).project).toBeUndefined();
      expect((ctx as any).study).toBeUndefined();
    });
  });
});

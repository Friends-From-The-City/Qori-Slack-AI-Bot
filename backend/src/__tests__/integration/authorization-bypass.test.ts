/**
 * Authorization Bypass Test
 *
 * Per ADR 0024: This test is the DECISIVE PROOF that the authorization
 * layer works. It attempts the actual attack vector: a non-member user
 * trying to access a study via forged studyId.
 *
 * If this test passes, C1/C2 from the federal readiness matrix are remediated.
 */

import { getTestDb, truncateAll } from './setup/testDb';
import { isProjectMember, assertStudyAccess, assertProjectAccess, AuthorizationError, addProjectMember } from '../../services/authorization.service';
import type { Project } from '../../database/models/project';
import type { ProjectMember } from '../../database/models/project_member';
import type { ResearchStudy } from '../../database/models/research_study';

const sequelize = getTestDb();
const ProjectModel = sequelize.models.Project as typeof Project;
const ProjectMemberModel = sequelize.models.ProjectMember as typeof ProjectMember;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;

describe('Authorization Bypass Prevention (ADR 0024)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('isProjectMember', () => {
    it('returns true for project member', async () => {
      // Create project
      const project = await ProjectModel.create({
        name: 'Test Project',
        slug: 'test-project',
        created_by: 'U_OWNER',
        status: 'active',
      });

      // Add member
      await ProjectMemberModel.create({
        project_id: project.id,
        user_id: 'U_MEMBER',
        role: 'member',
        source: 'explicit',
      });

      // Member should have access
      const result = await isProjectMember('U_MEMBER', project.id);
      expect(result).toBe(true);
    });

    it('returns false for non-member (THE BYPASS TEST)', async () => {
      // Create project with owner
      const project = await ProjectModel.create({
        name: 'Secret Project',
        slug: 'secret-project',
        created_by: 'U_OWNER',
        status: 'active',
      });

      // Add only the owner as member
      await ProjectMemberModel.create({
        project_id: project.id,
        user_id: 'U_OWNER',
        role: 'owner',
        source: 'creator',
      });

      // Attacker tries to access — should be DENIED
      const result = await isProjectMember('U_ATTACKER', project.id);
      expect(result).toBe(false);
    });

    it('returns false for non-existent project', async () => {
      const result = await isProjectMember('U_ANYONE', 999999);
      expect(result).toBe(false);
    });
  });

  describe('assertStudyAccess', () => {
    it('allows access for project member', async () => {
      // Create project with member
      const project = await ProjectModel.create({
        name: 'Team Project',
        slug: 'team-project',
        created_by: 'U_OWNER',
        status: 'active',
      });

      await ProjectMemberModel.create({
        project_id: project.id,
        user_id: 'U_MEMBER',
        role: 'member',
        source: 'explicit',
      });

      // Create study in project
      const study = await ResearchStudyModel.create({
        project_id: project.id,
        name: 'Team Study',
        channel_name: 'team-channel',
        created_by: 'U_OWNER',
        researcher_name: 'Test',
        researcher_email: 'test@example.com',
      });

      // Member should have access — should not throw
      await expect(assertStudyAccess('U_MEMBER', study.id)).resolves.not.toThrow();
    });

    it('DENIES access for non-member (THE BYPASS TEST)', async () => {
      // Create project — only owner is member
      const project = await ProjectModel.create({
        name: 'Private Project',
        slug: 'private-project',
        created_by: 'U_OWNER',
        status: 'active',
      });

      await ProjectMemberModel.create({
        project_id: project.id,
        user_id: 'U_OWNER',
        role: 'owner',
        source: 'creator',
      });

      // Create study in project
      const study = await ResearchStudyModel.create({
        project_id: project.id,
        name: 'Private Study',
        channel_name: 'private-channel',
        created_by: 'U_OWNER',
        researcher_name: 'Owner',
        researcher_email: 'owner@example.com',
      });

      // Attacker forges studyId and tries to access — MUST BE DENIED
      await expect(assertStudyAccess('U_ATTACKER', study.id)).rejects.toThrow(AuthorizationError);
    });

    it('DENIES access for non-existent study', async () => {
      await expect(assertStudyAccess('U_ANYONE', 999999)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('assertProjectAccess', () => {
    it('allows access for project member', async () => {
      const project = await ProjectModel.create({
        name: 'Open Project',
        slug: 'open-project',
        created_by: 'U_OWNER',
        status: 'active',
      });

      await ProjectMemberModel.create({
        project_id: project.id,
        user_id: 'U_MEMBER',
        role: 'member',
        source: 'explicit',
      });

      // Member should have access — should not throw
      await expect(assertProjectAccess('U_MEMBER', project.id)).resolves.not.toThrow();
    });

    it('DENIES access for non-member', async () => {
      const project = await ProjectModel.create({
        name: 'Closed Project',
        slug: 'closed-project',
        created_by: 'U_OWNER',
        status: 'active',
      });

      await ProjectMemberModel.create({
        project_id: project.id,
        user_id: 'U_OWNER',
        role: 'owner',
        source: 'creator',
      });

      // Non-member — MUST BE DENIED
      await expect(assertProjectAccess('U_ATTACKER', project.id)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('addProjectMember', () => {
    it('adds a new member', async () => {
      const project = await ProjectModel.create({
        name: 'Expandable Project',
        slug: 'expandable-project',
        created_by: 'U_OWNER',
        status: 'active',
      });

      // Initially no members
      expect(await isProjectMember('U_NEW', project.id)).toBe(false);

      // Add member
      await addProjectMember(project.id, 'U_NEW', 'explicit');

      // Now they should have access
      expect(await isProjectMember('U_NEW', project.id)).toBe(true);
    });

    it('is idempotent (no error on duplicate)', async () => {
      const project = await ProjectModel.create({
        name: 'Test Project',
        slug: 'test-project-idem',
        created_by: 'U_OWNER',
        status: 'active',
      });

      // Add twice — should not throw
      await addProjectMember(project.id, 'U_MEMBER', 'explicit');
      await expect(addProjectMember(project.id, 'U_MEMBER', 'explicit')).resolves.not.toThrow();
    });
  });
});

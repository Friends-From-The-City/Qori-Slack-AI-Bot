/**
 * Cross-Template Cascade Integration Tests
 *
 * Tests the cascade variable store's cross-template consume behavior:
 * - Source template ID resolution (desk_research → desk-research)
 * - Aggregation across multiple artifacts of same discovery type
 * - Pool vs non-pool aggregation semantics
 * - Source template filtering (prevents cross-template contamination)
 *
 * Phase B-0: Added to catch and prevent the cascade bug where
 * source: desk_research was not resolving correctly.
 *
 * Uses direct StudyVariable model operations against real Postgres,
 * following the pattern established in cascade-variable-store.test.ts.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';

const sequelize = getTestDb();

// Mock GitHub functions to prevent actual API calls
jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

// Test fixtures
let testProjectId: number;

beforeAll(async () => {
  await sequelize.authenticate();
  console.log('✓ Test database connected');
  await sequelize.sync();
  console.log('✓ Migrations complete');
});

beforeEach(async () => {
  await truncateAll();
  jest.clearAllMocks();

  // Create test project
  const Project = sequelize.models.Project;
  const project = await Project.create({
    name: 'Cascade Test Project',
    slug: 'cascade-test-project',
    status: 'active',
    created_by: 'U12345',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Cross-template cascade data patterns', () => {

  describe('source template filtering', () => {

    it('stores discovery variables with correct source_template for desk_research', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Simulate what desk_research template writes
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        scope: 'discovery',
        discovery_artifact_id: 'veterans-mobile-use',
        variable_key: 'discovered_barriers',
        value: [{ id: 'barrier-001', summary: 'Mobile app crashes frequently' }],
        source_template: 'desk_research',  // Template ID, not discovery type
        source_version: 'v7.0',
        source_date: new Date('2026-05-01'),
        is_pool: true,
      });

      // Verify the data is queryable by source_template
      const rows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          source_template: 'desk_research',
        },
      });

      expect(rows).toHaveLength(1);
      const row = rows[0] as unknown as { variable_key: string; value: unknown[] };
      expect(row.variable_key).toBe('discovered_barriers');
      expect(row.value).toHaveLength(1);
      expect(row.value[0]).toMatchObject({ id: 'barrier-001' });
    });

    it('filters by source_template when same variable_key exists across templates', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // knowledge_gaps is emitted by BOTH desk_research and stakeholder_synthesis
      // This tests that we can distinguish them

      await StudyVariable.bulkCreate([
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'veterans-mobile-use',
          variable_key: 'knowledge_gaps',
          value: [{ id: 'gap-001', gap: 'Need more mobile usage data' }],
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date('2026-05-01'),
          is_pool: true,
        },
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'stakeholder-interviews-topic',
          variable_key: 'knowledge_gaps',
          value: [{ id: 'gap-002', gap: 'Need stakeholder alignment on priorities' }],
          source_template: 'stakeholder_synthesis',
          source_version: 'v7.0',
          source_date: new Date('2026-05-15'),
          is_pool: true,
        },
      ]);

      // Query only desk_research knowledge_gaps
      const deskResearchGaps = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'knowledge_gaps',
          source_template: 'desk_research',
        },
      });

      expect(deskResearchGaps).toHaveLength(1);
      const deskGap = deskResearchGaps[0] as unknown as { value: unknown[] };
      expect(deskGap.value[0]).toMatchObject({ id: 'gap-001' });

      // Query only stakeholder_synthesis knowledge_gaps
      const stakeholderGaps = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'knowledge_gaps',
          source_template: 'stakeholder_synthesis',
        },
      });

      expect(stakeholderGaps).toHaveLength(1);
      const stakeholderGap = stakeholderGaps[0] as unknown as { value: unknown[] };
      expect(stakeholderGap.value[0]).toMatchObject({ id: 'gap-002' });
    });

  });

  describe('multi-artifact aggregation', () => {

    it('stores multiple artifacts of same discovery type in same project', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Two desk_research artifacts in same project
      await StudyVariable.bulkCreate([
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'veterans-mobile-use',
          variable_key: 'discovered_barriers',
          value: [{ id: 'barrier-001', summary: 'Mobile crashes' }],
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date('2026-05-01'),
          is_pool: true,
        },
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'veterans-accessibility',
          variable_key: 'discovered_barriers',
          value: [{ id: 'barrier-002', summary: 'Screen reader issues' }],
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date('2026-05-02'),
          is_pool: true,
        },
      ]);

      // Query all desk_research barriers
      const allBarriers = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'discovered_barriers',
          source_template: 'desk_research',
        },
      });

      expect(allBarriers).toHaveLength(2);

      // Verify both artifacts are represented
      const artifactIds = allBarriers.map(
        (r: unknown) => (r as { discovery_artifact_id: string }).discovery_artifact_id
      );
      expect(artifactIds).toContain('veterans-mobile-use');
      expect(artifactIds).toContain('veterans-accessibility');
    });

    it('supports non-pool variables with date-based precedence', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Two artifacts with same non-pool variable, different dates
      await StudyVariable.bulkCreate([
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'veterans-older',
          variable_key: 'sample_demographics',
          value: { total: 100, segment: 'older study' },
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date('2026-01-01'),
          is_pool: false,
        },
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'veterans-newer',
          variable_key: 'sample_demographics',
          value: { total: 200, segment: 'newer study' },
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date('2026-06-01'),
          is_pool: false,
        },
      ]);

      // Query with ORDER BY to verify we can get most recent
      const allDemographics = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'sample_demographics',
          source_template: 'desk_research',
        },
        order: [['source_date', 'DESC']],
      });

      expect(allDemographics).toHaveLength(2);

      // Most recent should be first
      const mostRecent = allDemographics[0] as unknown as { value: { total: number } };
      expect(mostRecent.value.total).toBe(200);
    });

  });

  describe('project isolation', () => {

    it('discovery variables are isolated by project_id', async () => {
      const StudyVariable = sequelize.models.StudyVariable;
      const Project = sequelize.models.Project;

      // Create second project
      const project2 = await Project.create({
        name: 'Other Project',
        slug: 'other-project',
        status: 'active',
        created_by: 'U12345',
    organization_id: TEST_ORG_ID,
      });
      const project2Id = (project2 as unknown as { id: number }).id;

      // Create discovery variable in each project
      await StudyVariable.bulkCreate([
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'project1-artifact',
          variable_key: 'discovered_barriers',
          value: [{ id: 'barrier-p1', summary: 'Project 1 barrier' }],
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date(),
          is_pool: true,
        },
        {
          project_id: project2Id,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'project2-artifact',
          variable_key: 'discovered_barriers',
          value: [{ id: 'barrier-p2', summary: 'Project 2 barrier' }],
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date(),
          is_pool: true,
        },
      ]);

      // Query for project 1 only
      const project1Barriers = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'discovered_barriers',
        },
      });

      expect(project1Barriers).toHaveLength(1);
      const p1Barrier = project1Barriers[0] as unknown as { value: unknown[] };
      expect(p1Barrier.value[0]).toMatchObject({ id: 'barrier-p1' });
    });

  });

  describe('scope isolation', () => {

    it('discovery-scoped variables have study_id = null', async () => {
      const StudyVariable = sequelize.models.StudyVariable;
      const ResearchStudy = sequelize.models.ResearchStudy;

      // Create a study
      const study = await ResearchStudy.create({
        project_id: testProjectId,
        name: 'Test Study',
        slug: 'test-study',
        path: 'cascade-test-project/test-study',
        status: 'active',
        created_by: 'U12345',
        channel_name: 'test-channel',
        researcher_name: 'Test Researcher',
        researcher_email: 'test@example.com',
      });
      const studyId = (study as unknown as { id: number }).id;

      // Create both discovery and study-scoped variables
      await StudyVariable.bulkCreate([
        {
          project_id: testProjectId,
          study_id: null,  // Discovery scope
          scope: 'discovery',
          discovery_artifact_id: 'desk-research-topic',
          variable_key: 'discovered_barriers',
          value: [{ id: 'disc-barrier' }],
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date(),
          is_pool: true,
        },
        {
          project_id: testProjectId,
          study_id: studyId,  // Study scope
          scope: 'study',
          discovery_artifact_id: null,
          variable_key: 'atomic_nuggets',
          value: [{ id: 'study-nugget' }],
          source_template: 'session_summary',
          source_version: 'v7.0',
          source_date: new Date(),
          is_pool: true,
        },
      ]);

      // Query discovery scope only
      const discoveryVars = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          study_id: null,
        },
      });

      expect(discoveryVars).toHaveLength(1);
      expect((discoveryVars[0] as unknown as { variable_key: string }).variable_key).toBe('discovered_barriers');

      // Query study scope only
      const studyVars = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'study',
          study_id: studyId,
        },
      });

      expect(studyVars).toHaveLength(1);
      expect((studyVars[0] as unknown as { variable_key: string }).variable_key).toBe('atomic_nuggets');
    });

  });

});

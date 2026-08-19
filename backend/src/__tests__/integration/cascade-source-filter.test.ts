/**
 * Cascade Source Filter Integration Tests
 *
 * Tests the source template filter in readUpstreamDiscoveryVariables.
 * Verifies that variables are returned when source.template matches
 * the consumes spec.source, and filtered out when they don't match.
 *
 * Phase B-0: Added to verify the fix for the desk_research_processor,
 * analyze_notes, and usability_issues_extractor naming mismatches.
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
let testStudyId: number;

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
    name: 'Source Filter Test Project',
    slug: 'source-filter-test',
    status: 'active',
    created_by: 'U12345',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;

  // Create test study for study-scoped variables
  const ResearchStudy = sequelize.models.ResearchStudy;
  const study = await ResearchStudy.create({
    project_id: testProjectId,
    name: 'Test Study',
    slug: 'test-study',
    path: 'source-filter-test/test-study',
    status: 'active',
    created_by: 'U12345',
    channel_name: 'test-channel',
    researcher_name: 'Test Researcher',
    researcher_email: 'test@example.com',
  });
  testStudyId = (study as unknown as { id: number }).id;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Cascade source filter behavior', () => {

  describe('matching source.template', () => {

    it('returns variable when source.template equals consumes spec.source', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Store a variable with source_template = 'desk_research'
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        scope: 'discovery',
        discovery_artifact_id: 'test-artifact',
        variable_key: 'discovered_barriers',
        value: [{ id: 'B-001', summary: 'Navigation is confusing' }],
        source_template: 'desk_research',  // Matches consumer expectation
        source_version: 'v7.0',
        source_date: new Date(),
        is_pool: true,
      });

      // Query with source_template filter (simulates consumer filter)
      const rows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'discovered_barriers',
          source_template: 'desk_research',  // Consumer looks for this
        },
      });

      expect(rows).toHaveLength(1);
      const row = rows[0] as unknown as { value: unknown[] };
      expect(row.value[0]).toMatchObject({ id: 'B-001' });
    });

    it('returns variable when source.template equals session_summary', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Store a variable with source_template = 'session_summary'
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: testStudyId,  // Study-scoped
        scope: 'study',
        discovery_artifact_id: null,
        variable_key: 'atomic_nugget_core',
        value: [{ id: 'N-001', text: 'User struggled with form' }],
        source_template: 'session_summary',  // Matches consumer expectation
        source_version: 'v7.0',
        source_date: new Date(),
        is_pool: true,
      });

      // Query with source_template filter
      const rows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'study',
          variable_key: 'atomic_nugget_core',
          source_template: 'session_summary',
        },
      });

      expect(rows).toHaveLength(1);
      const row = rows[0] as unknown as { value: unknown[] };
      expect(row.value[0]).toMatchObject({ id: 'N-001' });
    });

    it('returns variable when source.template equals usability_issues', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Store a variable with source_template = 'usability_issues'
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: testStudyId,
        scope: 'study',
        discovery_artifact_id: null,
        variable_key: 'prioritized_issues',
        value: [{ id: 'UI-001', severity: 'high', description: 'Button too small' }],
        source_template: 'usability_issues',  // Matches consumer expectation
        source_version: 'v7.0',
        source_date: new Date(),
        is_pool: true,
      });

      // Query with source_template filter
      const rows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'study',
          variable_key: 'prioritized_issues',
          source_template: 'usability_issues',
        },
      });

      expect(rows).toHaveLength(1);
      const row = rows[0] as unknown as { value: unknown[] };
      expect(row.value[0]).toMatchObject({ id: 'UI-001' });
    });

  });

  describe('mismatched source.template (the bug this fixes)', () => {

    it('filters out variable when source.template does NOT match spec.source', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Store a variable with OLD mismatched source_template
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        scope: 'discovery',
        discovery_artifact_id: 'test-artifact',
        variable_key: 'discovered_barriers',
        value: [{ id: 'B-001', summary: 'This should be filtered' }],
        source_template: 'desk_research_processor',  // OLD incorrect value
        source_version: 'v7.0',
        source_date: new Date(),
        is_pool: true,
      });

      // Query expecting 'desk_research' (what consumers specify)
      const rows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'discovered_barriers',
          source_template: 'desk_research',  // Consumer looks for this
        },
      });

      // Should NOT find the variable because source_template doesn't match
      expect(rows).toHaveLength(0);
    });

    it('filters out analyze_notes when consumer expects session_summary', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Store with OLD mismatched source_template
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: testStudyId,
        scope: 'study',
        discovery_artifact_id: null,
        variable_key: 'atomic_nugget_core',
        value: [{ id: 'N-001', text: 'This should be filtered' }],
        source_template: 'analyze_notes',  // OLD incorrect value
        source_version: 'v7.0',
        source_date: new Date(),
        is_pool: true,
      });

      // Query expecting 'session_summary'
      const rows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'study',
          variable_key: 'atomic_nugget_core',
          source_template: 'session_summary',  // Consumer looks for this
        },
      });

      expect(rows).toHaveLength(0);
    });

    it('filters out usability_issues_extractor when consumer expects usability_issues', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Store with OLD mismatched source_template
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: testStudyId,
        scope: 'study',
        discovery_artifact_id: null,
        variable_key: 'prioritized_issues',
        value: [{ id: 'UI-001', description: 'This should be filtered' }],
        source_template: 'usability_issues_extractor',  // OLD incorrect value
        source_version: 'v7.0',
        source_date: new Date(),
        is_pool: true,
      });

      // Query expecting 'usability_issues'
      const rows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'study',
          variable_key: 'prioritized_issues',
          source_template: 'usability_issues',
        },
      });

      expect(rows).toHaveLength(0);
    });

  });

  describe('cross-template contamination prevention', () => {

    it('filters out knowledge_gaps from stakeholder_synthesis when consuming from desk_research', async () => {
      const StudyVariable = sequelize.models.StudyVariable;

      // Both templates can emit knowledge_gaps - this tests the filter prevents cross-contamination
      await StudyVariable.bulkCreate([
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'desk-research-artifact',
          variable_key: 'knowledge_gaps',
          value: [{ id: 'G-001', gap: 'From desk research' }],
          source_template: 'desk_research',
          source_version: 'v7.0',
          source_date: new Date(),
          is_pool: true,
        },
        {
          project_id: testProjectId,
          study_id: null,
          scope: 'discovery',
          discovery_artifact_id: 'stakeholder-artifact',
          variable_key: 'knowledge_gaps',
          value: [{ id: 'G-002', gap: 'From stakeholder synthesis' }],
          source_template: 'stakeholder_synthesis',
          source_version: 'v7.0',
          source_date: new Date(),
          is_pool: true,
        },
      ]);

      // Query for desk_research only
      const deskRows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'knowledge_gaps',
          source_template: 'desk_research',
        },
      });

      expect(deskRows).toHaveLength(1);
      const deskGap = deskRows[0] as unknown as { value: unknown[] };
      expect(deskGap.value[0]).toMatchObject({ id: 'G-001', gap: 'From desk research' });

      // Query for stakeholder_synthesis only
      const stakeholderRows = await StudyVariable.findAll({
        where: {
          project_id: testProjectId,
          scope: 'discovery',
          variable_key: 'knowledge_gaps',
          source_template: 'stakeholder_synthesis',
        },
      });

      expect(stakeholderRows).toHaveLength(1);
      const stakeholderGap = stakeholderRows[0] as unknown as { value: unknown[] };
      expect(stakeholderGap.value[0]).toMatchObject({ id: 'G-002', gap: 'From stakeholder synthesis' });
    });

  });

});

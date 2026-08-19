/**
 * Cascade Traceability Tests (Generation-Side Role-Transformation)
 *
 * These tests verify that the cascade maintains traceable linkages between
 * upstream variables and their downstream transformations. This is critical
 * for patent Claims 5 & 11 which describe "single variable assumes different
 * structural roles across document types, traceably."
 *
 * The tests cover:
 * 1. Forward queries: task_scenario.validates_barriers → ["TB-001"]
 * 2. Reverse queries: "which tasks validate TB-001?" → [task-01, task-03]
 * 3. Linkage validation: detect empty linkage arrays when upstream exists
 *
 * v1.0 (June 6, 2026): Initial implementation for patent-grade traceability.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import {
  queryUpstreamReferences,
  validateStudyLinkages,
  injectSequelizeForTest,
  clearInjectedSequelize,
} from '../../helpers/studyVariables';

const sequelize = getTestDb();

// Inject test database so studyVariables.ts uses the same connection
beforeAll(() => {
  injectSequelizeForTest(sequelize);
});

afterAll(() => {
  clearInjectedSequelize();
});

// Mock GitHub functions to prevent actual API calls
jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

// Test fixtures
let testProjectId: number;
let testStudyId: number;

beforeEach(async () => {
  await truncateAll();
  jest.clearAllMocks();

  // Create test project and study
  const Project = sequelize.models.Project;
  const ResearchStudy = sequelize.models.ResearchStudy;

  const project = await Project.create({
    name: 'Traceability Test Project',
    slug: 'traceability-test',
    status: 'active',
    created_by: 'U12345',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;

  const study = await ResearchStudy.create({
    project_id: testProjectId,
    name: 'Traceability Test Study',
    slug: 'traceability-test-study',
    path: 'traceability-test/traceability-test-study',
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

// ═══════════════════════════════════════════════════════════
// TEST 1: Forward linkage (task_scenario → target_barriers)
// ═══════════════════════════════════════════════════════════

describe('forward linkage (task_scenario → barriers)', () => {
  it('stores task_scenarios with non-empty validates_barriers arrays', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create upstream target_barriers (from research_brief)
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'target_barriers',
      variable_type: 'singleton',
      scope: 'study',
      value: [
        { id: 'TB-001', barrier: 'Users cannot find the search feature' },
        { id: 'TB-002', barrier: 'Navigation is confusing on mobile' },
      ],
      source_template: 'research_brief',
      source_version: 'v7.0',
      is_pool: false,
    });

    // Create task_scenarios (from discussion_guide) with proper linkage
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-01',
        task_description: 'Find the search feature',
        success_criteria: 'Participant locates search within 30 seconds',
        validates_barriers: ['TB-001'],  // Traceable linkage
        addresses_questions: ['RQ-001'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-02',
        task_description: 'Navigate to appointments',
        success_criteria: 'Participant reaches appointments page',
        validates_barriers: ['TB-002'],  // Traceable linkage
        addresses_questions: ['RQ-002'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-03',
        task_description: 'Search for prescription refill',
        success_criteria: 'Participant finds refill option via search',
        validates_barriers: ['TB-001', 'TB-002'],  // Multi-barrier linkage
        addresses_questions: ['RQ-001', 'RQ-003'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    // Verify: read back and check linkages are present
    const rows = await StudyVariable.findAll({
      where: {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'task_scenarios',
      },
    });

    expect(rows.length).toBe(3);

    for (const row of rows) {
      const value = (row as unknown as { value: { validates_barriers: string[] } }).value;
      expect(value.validates_barriers).toBeDefined();
      expect(Array.isArray(value.validates_barriers)).toBe(true);
      expect(value.validates_barriers.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 2: Reverse query ("which tasks validate TB-001?")
// ═══════════════════════════════════════════════════════════

describe('reverse query (barrier → tasks)', () => {
  beforeEach(async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create task_scenarios with linkages
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-01',
        task_description: 'Find the search feature',
        validates_barriers: ['TB-001'],
        addresses_questions: ['RQ-001'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-02',
        task_description: 'Navigate to appointments',
        validates_barriers: ['TB-002'],
        addresses_questions: ['RQ-002'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-03',
        task_description: 'Search for prescription refill',
        validates_barriers: ['TB-001', 'TB-002'],
        addresses_questions: ['RQ-001', 'RQ-003'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });
  });

  it('returns all tasks that validate TB-001', async () => {
    const result = await queryUpstreamReferences(
      { projectId: testProjectId, studyId: testStudyId },
      'TB-001',
      'target_barriers',
    );

    expect(result.sourceVariable).toBe('target_barriers');
    expect(result.sourceId).toBe('TB-001');
    expect(result.items.length).toBe(2); // task-01 and task-03

    const taskIds = result.items.map(item => item.id);
    expect(taskIds).toContain('task-01');
    expect(taskIds).toContain('task-03');
    expect(taskIds).not.toContain('task-02'); // TB-002 only
  });

  it('returns all tasks that validate TB-002', async () => {
    const result = await queryUpstreamReferences(
      { projectId: testProjectId, studyId: testStudyId },
      'TB-002',
      'target_barriers',
    );

    expect(result.items.length).toBe(2); // task-02 and task-03

    const taskIds = result.items.map(item => item.id);
    expect(taskIds).toContain('task-02');
    expect(taskIds).toContain('task-03');
    expect(taskIds).not.toContain('task-01'); // TB-001 only
  });

  it('returns empty results for non-existent barrier', async () => {
    const result = await queryUpstreamReferences(
      { projectId: testProjectId, studyId: testStudyId },
      'TB-999',
      'target_barriers',
    );

    expect(result.items.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 3: Linkage validation (detect empty linkage)
// ═══════════════════════════════════════════════════════════

describe('linkage validation', () => {
  it('passes validation when all linkages are populated', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create properly linked task_scenarios
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-01',
        task_description: 'Find the search feature',
        validates_barriers: ['TB-001'],
        addresses_questions: ['RQ-001'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    const report = await validateStudyLinkages({
      projectId: testProjectId,
      studyId: testStudyId,
    });

    expect(report.valid).toBe(true);
    expect(report.gaps.length).toBe(0);
  });

  it('detects empty validates_barriers array', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create task_scenario with EMPTY validates_barriers (linkage gap)
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-01',
        task_description: 'Find the search feature',
        validates_barriers: [],  // EMPTY - linkage gap!
        addresses_questions: ['RQ-001'],
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    const report = await validateStudyLinkages({
      projectId: testProjectId,
      studyId: testStudyId,
    });

    expect(report.valid).toBe(false);
    expect(report.gaps.length).toBe(1);
    expect(report.gaps[0].variableKey).toBe('task_scenarios');
    expect(report.gaps[0].itemId).toBe('task-01');
    expect(report.gaps[0].missingField).toBe('validates_barriers');
  });

  it('detects multiple linkage gaps', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create task_scenario with BOTH linkage arrays empty
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'task_scenarios',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'task-01',
        task_description: 'Find the search feature',
        validates_barriers: [],  // EMPTY
        addresses_questions: [],  // EMPTY
      },
      source_template: 'discussion_guide',
      source_version: 'v7.0',
      is_pool: true,
    });

    const report = await validateStudyLinkages({
      projectId: testProjectId,
      studyId: testStudyId,
    });

    expect(report.valid).toBe(false);
    expect(report.gaps.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 4: Cross-type traceability (finding → theme → nugget)
// ═══════════════════════════════════════════════════════════

describe('cross-type traceability (finding → theme → nugget)', () => {
  beforeEach(async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create nuggets
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'atomic_nugget_core',
      variable_type: 'pool',
      scope: 'study',
      value: { id: 'nugget-PT-001-001', text: 'Search button is hard to find', participant: 'PT-001' },
      participant_id: 'PT-001',
      source_template: 'session_summary',
      source_version: 'v7.2',
      is_pool: true,
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'atomic_nugget_core',
      variable_type: 'pool',
      scope: 'study',
      value: { id: 'nugget-PT-002-001', text: 'Could not locate search anywhere', participant: 'PT-002' },
      participant_id: 'PT-002',
      source_template: 'session_summary',
      source_version: 'v7.2',
      is_pool: true,
    });

    // Create theme that references nuggets
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'validated_themes',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'theme-01',
        theme_name: 'Search Discoverability',
        summary: 'Users consistently struggled to find search',
        supporting_nuggets: ['nugget-PT-001-001', 'nugget-PT-002-001'],
        linked_barriers: ['TB-001'],
        confidence: 'Strong',
      },
      source_template: 'affinity_mapping',
      source_version: 'v7.0',
      is_pool: true,
    });

    // Create finding that references theme
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'prioritized_findings',
      variable_type: 'pool',
      scope: 'study',
      value: {
        id: 'finding-01',
        finding: 'Search feature is not discoverable',
        severity: 4,
        evidence_strength: 'Strong',
        supporting_themes: ['theme-01'],
        supporting_nuggets: ['nugget-PT-001-001', 'nugget-PT-002-001'],
        validates_barrier: 'TB-001',
      },
      source_template: 'research_readout',
      source_version: 'v7.0',
      is_pool: true,
    });
  });

  it('traces from finding back to themes', async () => {
    const result = await queryUpstreamReferences(
      { projectId: testProjectId, studyId: testStudyId },
      'theme-01',
      'validated_themes',
    );

    expect(result.items.length).toBe(1);
    expect(result.items[0].variableKey).toBe('prioritized_findings');
    expect(result.items[0].id).toBe('finding-01');
  });

  it('traces from theme back to nuggets', async () => {
    const result = await queryUpstreamReferences(
      { projectId: testProjectId, studyId: testStudyId },
      'nugget-PT-001-001',
      'atomic_nugget_core',
    );

    // Should find both theme and finding referencing this nugget
    const variableKeys = result.items.map(i => i.variableKey);
    expect(variableKeys).toContain('validated_themes');
    expect(variableKeys).toContain('prioritized_findings');
  });

  it('traces from barrier to all referencing elements', async () => {
    const result = await queryUpstreamReferences(
      { projectId: testProjectId, studyId: testStudyId },
      'TB-001',
      'target_barriers',
    );

    // Should find theme.linked_barriers and finding.validates_barrier
    expect(result.items.length).toBeGreaterThanOrEqual(2);

    const sources = result.items.map(i => i.variableKey);
    expect(sources).toContain('validated_themes');
    expect(sources).toContain('prioritized_findings');
  });
});

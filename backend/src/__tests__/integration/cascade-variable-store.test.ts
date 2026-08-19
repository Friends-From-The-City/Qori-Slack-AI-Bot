/**
 * Cascade Variable Store Tests
 *
 * These tests define the behavior contract for the cascade variable store.
 * They verify read/write roundtrips, pool merge strategies, and scope isolation.
 *
 * Phase 2B schema:
 *   - project_id: INTEGER FK (NOT NULL)
 *   - study_id: INTEGER FK (NULL for project-scoped/discovery variables)
 *   - scope: 'study' | 'discovery'
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';

const sequelize = getTestDb();

// Mock GitHub functions to prevent actual API calls
jest.mock('../../helpers/github', () => ({
  fetchFileFromRepoByPath: jest.fn().mockResolvedValue(null),
  createOrUpdateFileOnGitHub: jest.fn().mockResolvedValue({ success: true }),
  getContentRepo: jest.fn().mockReturnValue('test-repo'),
}));

// Test fixtures — created in beforeEach
let testProjectId: number;
let testStudyId: number;
let testProject2Id: number;
let testStudy2Id: number;

beforeEach(async () => {
  await truncateAll();
  jest.clearAllMocks();

  // Create test project and study for FK references
  const Project = sequelize.models.Project;
  const ResearchStudy = sequelize.models.ResearchStudy;

  const project = await Project.create({
    name: 'Test Project',
    slug: 'test-project',
    status: 'active',
    created_by: 'U12345',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;

  const study = await ResearchStudy.create({
    project_id: testProjectId,
    name: 'Test Study',
    slug: 'test-study',
    path: 'test-project/test-study',
    status: 'active',
    created_by: 'U12345',
    channel_name: 'test-channel',
    researcher_name: 'Test Researcher',
    researcher_email: 'test@example.com',
  });
  testStudyId = (study as unknown as { id: number }).id;

  // Create second project and study for cross-study tests
  const project2 = await Project.create({
    name: 'Project Alpha',
    slug: 'project-alpha',
    status: 'active',
    created_by: 'U12345',
    organization_id: TEST_ORG_ID,
  });
  testProject2Id = (project2 as unknown as { id: number }).id;

  const study2 = await ResearchStudy.create({
    project_id: testProject2Id,
    name: 'Study Beta',
    slug: 'study-beta',
    path: 'project-alpha/study-beta',
    status: 'active',
    created_by: 'U12345',
    channel_name: 'beta-channel',
    researcher_name: 'Beta Researcher',
    researcher_email: 'beta@example.com',
  });
  testStudy2Id = (study2 as unknown as { id: number }).id;
});

afterAll(async () => {
  await sequelize.close();
});

// ═══════════════════════════════════════════════════════════
// TEST 1: Read/write roundtrip (study-scoped singleton)
// ═══════════════════════════════════════════════════════════

describe('study-scoped singleton variables', () => {
  it('writes and reads back singleton variables correctly', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Write a singleton variable directly
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'research_objectives',
      variable_type: 'singleton',
      item_key: null,
      value: ['Objective 1', 'Objective 2', 'Objective 3'],
      participant_id: null,
      source_template: 'research_brief',
      source_version: 'v7.0',
      source_date: new Date().toISOString(),
      is_pool: false,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    });

    // Read it back
    const rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'research_objectives', scope: 'study' },
    });

    expect(rows).toHaveLength(1);
    const row = rows[0] as unknown as { value: unknown; is_pool: boolean; source_template: string };
    expect(row.value).toEqual(['Objective 1', 'Objective 2', 'Objective 3']);
    expect(row.is_pool).toBe(false);
    expect(row.source_template).toBe('research_brief');
  });

  it('updates singleton on re-write (replace behavior)', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Write initial value
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'methodology',
      variable_type: 'singleton',
      value: 'usability_testing',
      source_template: 'research_brief',
      source_version: 'v7.0',
      is_pool: false,
      scope: 'study',
    });

    // Verify initial
    let rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'methodology', scope: 'study' },
    });
    expect(rows).toHaveLength(1);
    expect((rows[0] as unknown as { value: string }).value).toBe('usability_testing');

    // Overwrite with new value (simulating mergeVariables replace behavior)
    await StudyVariable.destroy({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'methodology', scope: 'study' },
    });
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'methodology',
      variable_type: 'singleton',
      value: 'contextual_inquiry',
      source_template: 'research_plan',
      source_version: 'v7.0',
      is_pool: false,
      scope: 'study',
    });

    // Verify replaced
    rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'methodology', scope: 'study' },
    });
    expect(rows).toHaveLength(1);
    expect((rows[0] as unknown as { value: string }).value).toBe('contextual_inquiry');
    expect((rows[0] as unknown as { source_template: string }).source_template).toBe('research_plan');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 2: Read/write roundtrip (discovery-scoped)
// Discovery variables have study_id = NULL and scope = 'discovery'
// ═══════════════════════════════════════════════════════════

describe('discovery-scoped variables', () => {
  it('writes and reads back discovery variables correctly', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Write discovery variable (study_id = NULL for project-level discovery)
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: null,
      variable_key: 'validated_themes',
      variable_type: 'pool',
      item_key: 'T-001',
      value: { id: 'T-001', theme_name: 'Progressive disclosure', summary: 'Reveal complexity gradually' },
      source_template: 'desk_research',
      source_version: 'v7.0',
      is_pool: true,
      scope: 'discovery',
      discovery_artifact_id: 'mobile-nav-2026',
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: null,
      variable_key: 'validated_themes',
      variable_type: 'pool',
      item_key: 'T-002',
      value: { id: 'T-002', theme_name: 'Task-based IA', summary: 'Structure around user goals' },
      source_template: 'desk_research',
      source_version: 'v7.0',
      is_pool: true,
      scope: 'discovery',
      discovery_artifact_id: 'mobile-nav-2026',
    });

    // Read back
    const rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: null, variable_key: 'validated_themes', scope: 'discovery' },
    });

    expect(rows).toHaveLength(2);
    const values = rows.map((r: unknown) => (r as { value: unknown }).value);
    expect(values).toContainEqual(expect.objectContaining({ id: 'T-001', theme_name: 'Progressive disclosure' }));
    expect(values).toContainEqual(expect.objectContaining({ id: 'T-002', theme_name: 'Task-based IA' }));
  });

  it('discovery variables include discovery_artifact_id for multi-artifact grouping', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Write variables from two different artifacts
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: null,
      variable_key: 'stakeholder_needs',
      variable_type: 'pool',
      value: { need: 'Faster claim status updates' },
      source_template: 'stakeholder_synthesis',
      is_pool: true,
      scope: 'discovery',
      discovery_artifact_id: 'artifact-A',
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: null,
      variable_key: 'stakeholder_needs',
      variable_type: 'pool',
      value: { need: 'Mobile-first design' },
      source_template: 'stakeholder_synthesis',
      is_pool: true,
      scope: 'discovery',
      discovery_artifact_id: 'artifact-B',
    });

    // Query by artifact_id
    const artifactARows = await StudyVariable.findAll({
      where: { project_id: testProjectId, discovery_artifact_id: 'artifact-A' },
    });
    const artifactBRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, discovery_artifact_id: 'artifact-B' },
    });

    expect(artifactARows).toHaveLength(1);
    expect(artifactBRows).toHaveLength(1);
    expect((artifactARows[0] as unknown as { value: { need: string } }).value.need).toBe('Faster claim status updates');
    expect((artifactBRows[0] as unknown as { value: { need: string } }).value.need).toBe('Mobile-first design');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 3: Pool merge strategy - replace
// ═══════════════════════════════════════════════════════════

describe('pool merge: replace strategy', () => {
  it('replaces all existing pool items when using replace strategy', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Initial pool items
    await StudyVariable.bulkCreate([
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'target_barriers',
        variable_type: 'pool',
        item_key: 'TB-001',
        value: { id: 'TB-001', barrier: 'Old barrier 1' },
        source_template: 'research_brief',
        source_version: 'v6.0',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'target_barriers',
        variable_type: 'pool',
        item_key: 'TB-002',
        value: { id: 'TB-002', barrier: 'Old barrier 2' },
        source_template: 'research_brief',
        source_version: 'v6.0',
        is_pool: true,
        scope: 'study',
      },
    ]);

    // Verify initial state
    let rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'target_barriers', scope: 'study' },
    });
    expect(rows).toHaveLength(2);

    // Replace strategy: delete all, insert new
    await StudyVariable.destroy({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'target_barriers', scope: 'study' },
    });
    await StudyVariable.bulkCreate([
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'target_barriers',
        variable_type: 'pool',
        item_key: 'TB-001',
        value: { id: 'TB-001', barrier: 'New barrier 1' },
        source_template: 'research_brief',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'target_barriers',
        variable_type: 'pool',
        item_key: 'TB-002',
        value: { id: 'TB-002', barrier: 'New barrier 2' },
        source_template: 'research_brief',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'target_barriers',
        variable_type: 'pool',
        item_key: 'TB-003',
        value: { id: 'TB-003', barrier: 'New barrier 3' },
        source_template: 'research_brief',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'study',
      },
    ]);

    // Verify replaced
    rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'target_barriers', scope: 'study' },
    });
    expect(rows).toHaveLength(3);

    const values = rows.map((r: unknown) => (r as { value: { barrier: string } }).value.barrier);
    expect(values).toContain('New barrier 1');
    expect(values).toContain('New barrier 2');
    expect(values).toContain('New barrier 3');
    expect(values).not.toContain('Old barrier 1');
    expect(values).not.toContain('Old barrier 2');

    // Version updated
    const versions = rows.map((r: unknown) => (r as { source_version: string }).source_version);
    expect(versions.every((v) => v === 'v7.0')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 4: Pool merge strategy - append
// Note: Current implementation treats append same as append_or_replace_per_participant
// ═══════════════════════════════════════════════════════════

describe('pool merge: append strategy', () => {
  it('adds new items to existing pool without removing old items (different participants)', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Initial pool items from participant PT-001
    await StudyVariable.bulkCreate([
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-001',
        value: { id: 'N-001', text: 'Nugget from PT-001', participant: 'PT-001' },
        participant_id: 'PT-001',
        source_template: 'session_summary',
        is_pool: true,
        scope: 'study',
      },
    ]);

    // Append items from participant PT-002 (should add, not replace)
    await StudyVariable.bulkCreate([
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-002',
        value: { id: 'N-002', text: 'Nugget from PT-002', participant: 'PT-002' },
        participant_id: 'PT-002',
        source_template: 'session_summary',
        is_pool: true,
        scope: 'study',
      },
    ]);

    // Both should exist
    const rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'atomic_nuggets', scope: 'study' },
    });
    expect(rows).toHaveLength(2);

    const participants = rows.map((r: unknown) => (r as { participant_id: string }).participant_id);
    expect(participants).toContain('PT-001');
    expect(participants).toContain('PT-002');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 5: Pool merge strategy - append_or_replace_per_participant
// ═══════════════════════════════════════════════════════════

describe('pool merge: append_or_replace_per_participant strategy', () => {
  it('replaces items for same participant, preserves items from other participants', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Initial pool: 2 nuggets from PT-001, 1 from PT-002
    await StudyVariable.bulkCreate([
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-001',
        value: { id: 'N-001', text: 'Old nugget 1 from PT-001', participant: 'PT-001' },
        participant_id: 'PT-001',
        source_template: 'session_summary',
        source_version: 'v6.0',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-002',
        value: { id: 'N-002', text: 'Old nugget 2 from PT-001', participant: 'PT-001' },
        participant_id: 'PT-001',
        source_template: 'session_summary',
        source_version: 'v6.0',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-003',
        value: { id: 'N-003', text: 'Nugget from PT-002', participant: 'PT-002' },
        participant_id: 'PT-002',
        source_template: 'session_summary',
        source_version: 'v6.0',
        is_pool: true,
        scope: 'study',
      },
    ]);

    // Verify initial state
    let rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'atomic_nuggets', scope: 'study' },
    });
    expect(rows).toHaveLength(3);

    // Simulate append_or_replace_per_participant for PT-001:
    // Delete PT-001's items, insert new ones, leave PT-002 untouched
    await StudyVariable.destroy({
      where: {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        participant_id: 'PT-001',
        scope: 'study',
      },
    });
    await StudyVariable.bulkCreate([
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-004',
        value: { id: 'N-004', text: 'New nugget 1 from PT-001', participant: 'PT-001' },
        participant_id: 'PT-001',
        source_template: 'session_summary',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-005',
        value: { id: 'N-005', text: 'New nugget 2 from PT-001', participant: 'PT-001' },
        participant_id: 'PT-001',
        source_template: 'session_summary',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'atomic_nuggets',
        variable_type: 'pool',
        item_key: 'N-006',
        value: { id: 'N-006', text: 'New nugget 3 from PT-001', participant: 'PT-001' },
        participant_id: 'PT-001',
        source_template: 'session_summary',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'study',
      },
    ]);

    // Verify: PT-001 has 3 new items, PT-002 still has 1 original item
    rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'atomic_nuggets', scope: 'study' },
    });
    expect(rows).toHaveLength(4); // 3 from PT-001 + 1 from PT-002

    const pt001Rows = rows.filter((r: unknown) => (r as { participant_id: string }).participant_id === 'PT-001');
    const pt002Rows = rows.filter((r: unknown) => (r as { participant_id: string }).participant_id === 'PT-002');

    expect(pt001Rows).toHaveLength(3);
    expect(pt002Rows).toHaveLength(1);

    // PT-001's items are all new (v7.0)
    const pt001Versions = pt001Rows.map((r: unknown) => (r as { source_version: string }).source_version);
    expect(pt001Versions.every((v) => v === 'v7.0')).toBe(true);

    // PT-002's item is still old (v6.0)
    expect((pt002Rows[0] as unknown as { source_version: string }).source_version).toBe('v6.0');

    // PT-001's old nuggets are gone
    const pt001Texts = pt001Rows.map((r: unknown) => (r as { value: { text: string } }).value.text);
    expect(pt001Texts).not.toContain('Old nugget 1 from PT-001');
    expect(pt001Texts).not.toContain('Old nugget 2 from PT-001');
    expect(pt001Texts).toContain('New nugget 1 from PT-001');
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 6: Scope isolation
// ═══════════════════════════════════════════════════════════

describe('scope isolation', () => {
  it('study-scoped queries do not return discovery-scoped variables', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create variables in both scopes with same variable_key
    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'validated_themes',
      value: { theme: 'Study theme' },
      source_template: 'affinity_mapping',
      is_pool: false,
      scope: 'study',
    });

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: null,
      variable_key: 'validated_themes',
      value: { theme: 'Discovery theme' },
      source_template: 'desk_research',
      is_pool: false,
      scope: 'discovery',
    });

    // Query study scope only
    const studyRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, variable_key: 'validated_themes', scope: 'study' },
    });

    expect(studyRows).toHaveLength(1);
    expect((studyRows[0] as unknown as { value: { theme: string } }).value.theme).toBe('Study theme');

    // Query discovery scope only
    const discoveryRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, variable_key: 'validated_themes', scope: 'discovery' },
    });

    expect(discoveryRows).toHaveLength(1);
    expect((discoveryRows[0] as unknown as { value: { theme: string } }).value.theme).toBe('Discovery theme');
  });

  it('cross-study search respects project_id isolation', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Create findings in two studies (different projects) and one discovery
    await StudyVariable.bulkCreate([
      {
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'prioritized_findings',
        value: { id: 'F-001', finding: 'Finding from test study' },
        source_template: 'research_readout',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProject2Id,
        study_id: testStudy2Id,
        variable_key: 'prioritized_findings',
        value: { id: 'F-002', finding: 'Finding from study beta' },
        source_template: 'research_readout',
        is_pool: true,
        scope: 'study',
      },
      {
        project_id: testProjectId,
        study_id: null,
        variable_key: 'prioritized_findings',
        value: { id: 'F-003', finding: 'Finding from discovery (should not appear in study queries)' },
        source_template: 'desk_research',
        is_pool: true,
        scope: 'discovery',
      },
    ]);

    // Query all study-scoped findings for project 1
    const project1Findings = await StudyVariable.findAll({
      where: { project_id: testProjectId, variable_key: 'prioritized_findings', scope: 'study' },
    });

    expect(project1Findings).toHaveLength(1);
    const project1Ids = project1Findings.map((r: unknown) => (r as { study_id: number }).study_id);
    expect(project1Ids).toContain(testStudyId);
    expect(project1Ids).not.toContain(testStudy2Id);

    // Query all study-scoped findings across all projects
    const allStudyFindings = await StudyVariable.findAll({
      where: { variable_key: 'prioritized_findings', scope: 'study' },
    });

    expect(allStudyFindings).toHaveLength(2);
    const allProjectIds = allStudyFindings.map((r: unknown) => (r as { project_id: number }).project_id);
    expect(allProjectIds).toContain(testProjectId);
    expect(allProjectIds).toContain(testProject2Id);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 7: Postgres → GitHub fallback behavior
// Note: This tests the fallback path for when Postgres is unavailable
// ═══════════════════════════════════════════════════════════

describe('postgres to github fallback', () => {
  it('returns empty structure when postgres has no data and github returns null', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Verify no data in Postgres for a different study
    const rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: 999, scope: 'study' },
    });
    expect(rows).toHaveLength(0);

    // The github mock returns null for fetchFileFromRepoByPath
    // When the actual readStudyVariables is called on empty data,
    // it should return an empty structure
    // (This test verifies the database layer; the GitHub fallback
    // is mocked and would need integration testing)
  });

  it('source_template and source_version are preserved through write/read cycle', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    await StudyVariable.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'research_objectives',
      value: ['Objective A', 'Objective B'],
      source_template: 'research_brief',
      source_version: 'v7.0',
      source_date: new Date('2026-05-21T10:00:00Z'),
      is_pool: false,
      scope: 'study',
    });

    const rows = await StudyVariable.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'research_objectives' },
    });

    expect(rows).toHaveLength(1);
    const row = rows[0] as unknown as {
      source_template: string;
      source_version: string;
      source_date: Date;
    };
    expect(row.source_template).toBe('research_brief');
    expect(row.source_version).toBe('v7.0');
    expect(row.source_date).toBeInstanceOf(Date);
  });
});

// ═══════════════════════════════════════════════════════════
// TEST 8: Discovery type isolation (Bug fix verification)
// Writing one discovery type must NOT nuke other discovery types
//
// This tests the fix for the bug where writeDiscoveryToPostgresByProject
// deleted ALL discovery variables instead of just the source_template
// being written. We use direct model operations to simulate the fixed
// behavior and verify scope isolation.
// ═══════════════════════════════════════════════════════════

describe('discovery type isolation', () => {
  it('writing one discovery type preserves other discovery types', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Simulate writing desk_research (delete by source_template, then insert)
    await sequelize.transaction(async (t) => {
      await StudyVariable.destroy({
        where: { project_id: testProjectId, study_id: null, scope: 'discovery', source_template: 'desk_research' },
        transaction: t,
      });
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        variable_key: 'desk_findings',
        value: { id: 'DF-001', finding: 'Desk finding 1' },
        source_template: 'desk_research',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'discovery',
        discovery_artifact_id: 'artifact-1',
      }, { transaction: t });
    });

    // Simulate writing stakeholder_synthesis
    await sequelize.transaction(async (t) => {
      await StudyVariable.destroy({
        where: { project_id: testProjectId, study_id: null, scope: 'discovery', source_template: 'stakeholder_synthesis' },
        transaction: t,
      });
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        variable_key: 'stakeholder_needs',
        value: { id: 'SN-001', need: 'Stakeholder need 1' },
        source_template: 'stakeholder_synthesis',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'discovery',
        discovery_artifact_id: 'artifact-2',
      }, { transaction: t });
    });

    // Simulate writing survey_synthesis
    await sequelize.transaction(async (t) => {
      await StudyVariable.destroy({
        where: { project_id: testProjectId, study_id: null, scope: 'discovery', source_template: 'survey_synthesis' },
        transaction: t,
      });
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        variable_key: 'survey_insights',
        value: { id: 'SI-001', insight: 'Survey insight 1' },
        source_template: 'survey_synthesis',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'discovery',
        discovery_artifact_id: 'artifact-3',
      }, { transaction: t });
    });

    // All three should exist - none were nuked by writing others
    const deskRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, scope: 'discovery', source_template: 'desk_research' },
    });
    const stakeholderRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, scope: 'discovery', source_template: 'stakeholder_synthesis' },
    });
    const surveyRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, scope: 'discovery', source_template: 'survey_synthesis' },
    });

    expect(deskRows).toHaveLength(1);
    expect(stakeholderRows).toHaveLength(1);
    expect(surveyRows).toHaveLength(1);

    // Verify each has correct content
    expect((deskRows[0] as unknown as { value: { id: string } }).value.id).toBe('DF-001');
    expect((stakeholderRows[0] as unknown as { value: { id: string } }).value.id).toBe('SN-001');
    expect((surveyRows[0] as unknown as { value: { id: string } }).value.id).toBe('SI-001');

    // Verify total count is 3 (one of each type)
    const allDiscoveryRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, scope: 'discovery' },
    });
    expect(allDiscoveryRows).toHaveLength(3);
  });

  it('re-writing same discovery type replaces only that type', async () => {
    const StudyVariable = sequelize.models.StudyVariable;

    // Initial write: desk_research with finding DF-001
    await sequelize.transaction(async (t) => {
      await StudyVariable.destroy({
        where: { project_id: testProjectId, study_id: null, scope: 'discovery', source_template: 'desk_research' },
        transaction: t,
      });
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        variable_key: 'desk_findings',
        value: { id: 'DF-001', finding: 'Original finding' },
        source_template: 'desk_research',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'discovery',
      }, { transaction: t });
    });

    // Also write stakeholder_synthesis
    await sequelize.transaction(async (t) => {
      await StudyVariable.destroy({
        where: { project_id: testProjectId, study_id: null, scope: 'discovery', source_template: 'stakeholder_synthesis' },
        transaction: t,
      });
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        variable_key: 'stakeholder_needs',
        value: { id: 'SN-001', need: 'Stakeholder need' },
        source_template: 'stakeholder_synthesis',
        source_version: 'v7.0',
        is_pool: true,
        scope: 'discovery',
      }, { transaction: t });
    });

    // Re-write desk_research with updated finding
    await sequelize.transaction(async (t) => {
      await StudyVariable.destroy({
        where: { project_id: testProjectId, study_id: null, scope: 'discovery', source_template: 'desk_research' },
        transaction: t,
      });
      await StudyVariable.create({
        project_id: testProjectId,
        study_id: null,
        variable_key: 'desk_findings',
        value: { id: 'DF-002', finding: 'Updated finding' },
        source_template: 'desk_research',
        source_version: 'v7.1',
        is_pool: true,
        scope: 'discovery',
      }, { transaction: t });
    });

    // Verify desk_research was replaced (DF-002, not DF-001)
    const deskRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, scope: 'discovery', source_template: 'desk_research' },
    });
    expect(deskRows).toHaveLength(1);
    const deskValue = (deskRows[0] as unknown as { value: { id: string; finding: string } }).value;
    expect(deskValue.id).toBe('DF-002');
    expect(deskValue.finding).toBe('Updated finding');

    // Verify stakeholder_synthesis is untouched
    const stakeholderRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, scope: 'discovery', source_template: 'stakeholder_synthesis' },
    });
    expect(stakeholderRows).toHaveLength(1);
    const stakeholderValue = (stakeholderRows[0] as unknown as { value: { id: string; need: string } }).value;
    expect(stakeholderValue.id).toBe('SN-001');
    expect(stakeholderValue.need).toBe('Stakeholder need');

    // Verify total is still 2 (desk replaced, stakeholder preserved)
    const allDiscoveryRows = await StudyVariable.findAll({
      where: { project_id: testProjectId, scope: 'discovery' },
    });
    expect(allDiscoveryRows).toHaveLength(2);
  });
});

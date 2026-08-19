/**
 * Flow 4: Cascade variable flow — end-to-end
 *
 * Tests the cascade contract: variables stored correctly in StudyVariable,
 * retrievable by project_id + study_id + variable_key, pool vs singleton
 * distinction works, and JSONB values survive round-trip.
 *
 * Phase 2B schema: Uses project_id + study_id FKs instead of study_name.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';

const sequelize = getTestDb();

let testProjectId: number;
let testStudyId: number;

beforeEach(async () => {
  await truncateAll();

  const Project = sequelize.models.Project;
  const ResearchStudy = sequelize.models.ResearchStudy;

  const project = await Project.create({
    name: 'Cascade Test Project',
    slug: 'cascade-test-project',
    status: 'active',
    created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;

  const study = await ResearchStudy.create({
    project_id: testProjectId,
    name: 'cascade-test',
    slug: 'cascade-test',
    channel_name: 'test-channel',
    created_by: 'U_TEST',
    researcher_name: 'Test Researcher',
    researcher_email: 'test@example.com',
  });
  testStudyId = (study as unknown as { id: number }).id;
});

afterAll(() => sequelize.close());

describe('cascade variable flow', () => {
  it('writes and reads back a singleton variable', async () => {
    const SV = sequelize.models.StudyVariable;

    // Write — mimics what writeVariablesToPostgres does for singletons
    await SV.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'research_objectives',
      variable_type: 'singleton',
      item_key: null,
      value: ['Understand user needs', 'Identify pain points', 'Validate hypotheses'],
      participant_id: null,
      source_template: 'research_brief',
      source_version: '6.0',
      is_pool: false,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    // Read back — mimics what readUpstreamVariables does
    const rows = await SV.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'research_objectives', scope: 'study' },
    });

    expect(rows).toHaveLength(1);
    expect((rows[0] as any).is_pool).toBe(false);

    const value = (rows[0] as any).value;
    expect(Array.isArray(value)).toBe(true);
    expect(value).toHaveLength(3);
    expect(value[0]).toBe('Understand user needs');
  });

  it('writes and reads back pool variables (one row per item)', async () => {
    const SV = sequelize.models.StudyVariable;

    const questions = [
      { id: 'RQ-001', question: 'How do users navigate?', priority: 'high' },
      { id: 'RQ-002', question: 'What causes friction?', priority: 'medium' },
    ];

    // Write — mimics pool variable storage
    for (const q of questions) {
      await SV.create({
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'research_questions',
        variable_type: 'pool',
        item_key: q.id,
        value: q,
        participant_id: null,
        source_template: 'research_brief',
        source_version: '6.0',
        is_pool: true,
        scope: 'study',
        stale: false,
        extracted_at: new Date(),
      } as Record<string, unknown>);
    }

    // Read back
    const rows = await SV.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'research_questions', scope: 'study' },
    });

    expect(rows).toHaveLength(2);
    expect((rows[0] as any).is_pool).toBe(true);

    // Reconstruct the pool (mimics readUpstreamVariables pool logic)
    const poolValues = rows.map((r: any) => r.value);
    expect(poolValues).toHaveLength(2);
    expect(poolValues.find((v: any) => v.id === 'RQ-001')).toBeDefined();
    expect(poolValues.find((v: any) => v.id === 'RQ-002')).toBeDefined();
  });

  it('scopes variables by study_id — different studies dont leak', async () => {
    const SV = sequelize.models.StudyVariable;
    const RS = sequelize.models.ResearchStudy;

    // Create a second study in the same project
    const studyB = await RS.create({
      project_id: testProjectId,
      name: 'study-b',
      slug: 'study-b',
      channel_name: 'test-channel',
      created_by: 'U_TEST',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
    });
    const studyBId = (studyB as unknown as { id: number }).id;

    await SV.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'research_objectives',
      variable_type: 'singleton',
      value: ['Objective A'],
      source_template: 'brief',
      is_pool: false,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    await SV.create({
      project_id: testProjectId,
      study_id: studyBId,
      variable_key: 'research_objectives',
      variable_type: 'singleton',
      value: ['Objective B'],
      source_template: 'brief',
      is_pool: false,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    const rowsA = await SV.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'research_objectives', scope: 'study' },
    });
    const rowsB = await SV.findAll({
      where: { project_id: testProjectId, study_id: studyBId, variable_key: 'research_objectives', scope: 'study' },
    });

    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect((rowsA[0] as any).value[0]).toBe('Objective A');
    expect((rowsB[0] as any).value[0]).toBe('Objective B');
  });

  it('JSONB complex objects survive round-trip', async () => {
    const SV = sequelize.models.StudyVariable;

    const complexBarrier = {
      id: 'TB-001',
      barrier: 'Technology literacy',
      population: 'Veterans 65+',
      mitigation: 'Provide assistive technology',
      severity: 'high',
      nested: { sources: ['interview-1', 'interview-2'], count: 2 },
    };

    await SV.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'target_barriers',
      variable_type: 'pool',
      item_key: 'TB-001',
      value: complexBarrier,
      source_template: 'brief',
      is_pool: true,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    const rows = await SV.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'target_barriers' },
    });

    const stored = (rows[0] as any).value;
    expect(stored.id).toBe('TB-001');
    expect(stored.nested.sources).toEqual(['interview-1', 'interview-2']);
    expect(stored.nested.count).toBe(2);
  });

  it('brief → plan cascade: objectives written by brief are readable for plan', async () => {
    const SV = sequelize.models.StudyVariable;

    // Brief emits research_objectives (singleton: string[])
    const objectives = ['Understand appointment scheduling barriers', 'Identify digital access gaps'];
    await SV.create({
      project_id: testProjectId,
      study_id: testStudyId,
      variable_key: 'research_objectives',
      variable_type: 'singleton',
      value: objectives,
      source_template: 'research_brief',
      source_version: '6.0',
      is_pool: false,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    // Brief emits research_questions (pool)
    const questions = [
      { id: 'RQ-001', question: 'How do Veterans schedule appointments?', priority: 'high' },
    ];
    for (const q of questions) {
      await SV.create({
        project_id: testProjectId,
        study_id: testStudyId,
        variable_key: 'research_questions',
        variable_type: 'pool',
        item_key: q.id,
        value: q,
        source_template: 'research_brief',
        source_version: '6.0',
        is_pool: true,
        scope: 'study',
        stale: false,
        extracted_at: new Date(),
      } as Record<string, unknown>);
    }

    // Plan reads: objectives + questions (mimics readUpstreamVariables query)
    const objRows = await SV.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'research_objectives', scope: 'study' },
    });
    const qRows = await SV.findAll({
      where: { project_id: testProjectId, study_id: testStudyId, variable_key: 'research_questions', scope: 'study' },
    });

    // Objectives: singleton → single row → value is string[]
    expect(objRows).toHaveLength(1);
    const upstreamObjectives = (objRows[0] as any).value as string[];
    expect(upstreamObjectives).toHaveLength(2);

    // Transform to OBJ-001 format (plan handler logic)
    const formattedObjectives = upstreamObjectives.map((obj, i) => ({
      id: `OBJ-${String(i + 1).padStart(3, '0')}`,
      objective: obj,
    }));
    expect(formattedObjectives[0].id).toBe('OBJ-001');
    expect(formattedObjectives[0].objective).toBe('Understand appointment scheduling barriers');

    // Questions: pool → multiple rows → array of values
    expect(qRows).toHaveLength(1);
    const upstreamQuestions = qRows.map((r: any) => r.value);
    expect(upstreamQuestions[0].id).toBe('RQ-001');
  });
});

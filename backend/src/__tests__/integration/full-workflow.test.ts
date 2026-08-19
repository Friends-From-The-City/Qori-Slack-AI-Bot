/**
 * Flow 5: Full workflow — discovery → brief → plan happy path
 *
 * Tests the highest-value sequence end-to-end at the database layer.
 * Creates artifacts in the correct cascade order and verifies each
 * is queryable with correct relationships.
 *
 * Phase 2B schema: Uses project_id + study_id FKs instead of study_name.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import { calculatePerPersonCompensation } from '../../utils/compensationCalculator';

const sequelize = getTestDb();

let testProjectId: number;

beforeEach(async () => {
  await truncateAll();

  const Project = sequelize.models.Project;
  const project = await Project.create({
    name: 'Workflow Test Project',
    slug: 'workflow-test-project',
    status: 'active',
    created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;
});

afterAll(() => sequelize.close());

describe('full workflow: discovery → brief → plan', () => {
  it('runs the complete happy path', async () => {
    const RS = sequelize.models.ResearchStudy;
    const SP = sequelize.models.StudyParticipant;
    const SV = sequelize.models.StudyVariable;
    const SS = sequelize.models.StudyStatus;
    const RP = sequelize.models.ResearchPlan;

    // ─── Step 1: Discovery emits variables ──────────────────
    // Discovery variables use project_id with study_id = NULL
    await SV.create({
      project_id: testProjectId,
      study_id: null,
      variable_key: 'discovered_barriers',
      variable_type: 'pool',
      item_key: 'DB-001',
      value: { id: 'DB-001', barrier: 'Low digital literacy', severity: 'high' },
      source_template: 'desk_research',
      source_version: '2.0',
      is_pool: true,
      scope: 'discovery',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    // Verify discovery variable stored
    const discoveryRows = await SV.findAll({
      where: { project_id: testProjectId, study_id: null, scope: 'discovery' },
    });
    expect(discoveryRows.length).toBeGreaterThan(0);

    // ─── Step 2: Create study ───────────────────────────────
    const study = await RS.create({
      project_id: testProjectId,
      name: 'workflow-e2e-study',
      slug: 'workflow-e2e-study',
      channel_name: 'test-channel',
      created_by: 'U_RESEARCHER',
      researcher_name: 'Jane Smith',
      researcher_email: 'jane@example.com',
      parsed_budget_amount: 2000,
      target_participants: 10,
    });
    const studyId = study.get('id') as number;
    const studyName = study.get('name') as string;

    // ─── Step 3: Brief emits cascade variables ──────────────
    const objectives = ['Understand scheduling barriers', 'Identify digital access gaps', 'Validate hypothesis'];
    await SV.create({
      project_id: testProjectId,
      study_id: studyId,
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

    const questions = [
      { id: 'RQ-001', question: 'How do Veterans schedule?', priority: 'high' },
      { id: 'RQ-002', question: 'What are access barriers?', priority: 'medium' },
    ];
    for (const q of questions) {
      await SV.create({
        project_id: testProjectId,
        study_id: studyId,
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

    const barriers = [
      { id: 'TB-001', barrier: 'Technology literacy', population: 'Veterans 65+' },
    ];
    for (const b of barriers) {
      await SV.create({
        project_id: testProjectId,
        study_id: studyId,
        variable_key: 'target_barriers',
        variable_type: 'pool',
        item_key: b.id,
        value: b,
        source_template: 'research_brief',
        source_version: '6.0',
        is_pool: true,
        scope: 'study',
        stale: false,
        extracted_at: new Date(),
      } as Record<string, unknown>);
    }

    // Record brief status
    await SS.create({
      study_id: studyId,
      path: 'https://github.com/example/brief.md',
      status: 'created',
      created_by: 'U_RESEARCHER',
    });

    // ─── Step 4: Plan consumes brief variables ──────────────
    // Read objectives (singleton)
    const objRows = await SV.findAll({
      where: { project_id: testProjectId, study_id: studyId, variable_key: 'research_objectives', scope: 'study' },
    });
    expect(objRows).toHaveLength(1);
    const upstreamObjectives = (objRows[0] as any).value as string[];
    expect(upstreamObjectives).toHaveLength(3);

    // Read research_questions (pool)
    const qRows = await SV.findAll({
      where: { project_id: testProjectId, study_id: studyId, variable_key: 'research_questions', scope: 'study' },
    });
    expect(qRows).toHaveLength(2);

    // Read target_barriers (pool)
    const bRows = await SV.findAll({
      where: { project_id: testProjectId, study_id: studyId, variable_key: 'target_barriers', scope: 'study' },
    });
    expect(bRows).toHaveLength(1);

    // Plan handler assembles data
    const formattedObjectives = upstreamObjectives.map((obj, i) => ({
      id: `OBJ-${String(i + 1).padStart(3, '0')}`,
      objective: obj,
    }));
    expect(formattedObjectives).toHaveLength(3);
    expect(formattedObjectives[0].id).toBe('OBJ-001');

    // Compensation calculation
    const studyFromDb = await RS.findByPk(studyId);
    const perPerson = calculatePerPersonCompensation({
      parsed_budget_amount: studyFromDb!.get('parsed_budget_amount') as number,
      target_participants: studyFromDb!.get('target_participants') as number,
    });
    expect(perPerson).toBe(200); // 2000 / 10

    // Record plan
    await RP.create({
      study_id: studyId,
      study_name: studyName,
      filename: 'research-plan.md',
      file_path: `research-content/${studyName}/02-plan/research-plan.md`,
      file_url: 'https://github.com/example/plan.md',
      created_by: 'U_RESEARCHER',
    });

    await SS.create({
      study_id: studyId,
      path: 'https://github.com/example/plan.md',
      status: 'created',
      created_by: 'U_RESEARCHER',
    });

    // ─── Step 5: Verify all artifacts are queryable ─────────
    const finalStudy = await RS.findByPk(studyId);
    expect(finalStudy).not.toBeNull();
    expect(finalStudy!.get('name')).toBe(studyName);

    const allVars = await SV.findAll({ where: { project_id: testProjectId, study_id: studyId, scope: 'study' } });
    // 1 objectives (singleton) + 2 questions (pool) + 1 barrier (pool) = 4 rows
    expect(allVars).toHaveLength(4);

    const statuses = await SS.findAll({ where: { study_id: studyId } });
    expect(statuses).toHaveLength(2); // brief + plan

    const plans = await RP.findAll({ where: { study_id: studyId } });
    expect(plans).toHaveLength(1);
    expect(plans[0].get('filename')).toBe('research-plan.md');
  });

  it('study cascade variables are isolated from other studies', async () => {
    const RS = sequelize.models.ResearchStudy;
    const SV = sequelize.models.StudyVariable;

    const study1 = await RS.create({
      project_id: testProjectId,
      name: 'study-1',
      slug: 'study-1',
      channel_name: 'c',
      created_by: 'U',
      researcher_name: 'R',
      researcher_email: 'r@t.com',
    });
    const study2 = await RS.create({
      project_id: testProjectId,
      name: 'study-2',
      slug: 'study-2',
      channel_name: 'c',
      created_by: 'U',
      researcher_name: 'R',
      researcher_email: 'r@t.com',
    });

    const study1Id = (study1 as unknown as { id: number }).id;
    const study2Id = (study2 as unknown as { id: number }).id;

    await SV.create({
      project_id: testProjectId,
      study_id: study1Id,
      variable_key: 'research_objectives',
      variable_type: 'singleton',
      value: ['S1 Objective'],
      source_template: 'brief',
      is_pool: false,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    await SV.create({
      project_id: testProjectId,
      study_id: study2Id,
      variable_key: 'research_objectives',
      variable_type: 'singleton',
      value: ['S2 Objective'],
      source_template: 'brief',
      is_pool: false,
      scope: 'study',
      stale: false,
      extracted_at: new Date(),
    } as Record<string, unknown>);

    const s1Vars = await SV.findAll({ where: { project_id: testProjectId, study_id: study1Id, scope: 'study' } });
    const s2Vars = await SV.findAll({ where: { project_id: testProjectId, study_id: study2Id, scope: 'study' } });

    expect(s1Vars).toHaveLength(1);
    expect(s2Vars).toHaveLength(1);
    expect((s1Vars[0] as any).value[0]).toBe('S1 Objective');
    expect((s2Vars[0] as any).value[0]).toBe('S2 Objective');
  });
});

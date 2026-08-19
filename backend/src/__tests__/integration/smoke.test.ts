/**
 * Smoke test — verifies the test database infrastructure works.
 * Creates a project and study via the models, queries them back, asserts shape.
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';

const sequelize = getTestDb();

// Test fixture — created fresh in beforeEach
let testProjectId: number;

beforeEach(async () => {
  await truncateAll();

  // Create a project for all tests that need to create studies
  const Project = sequelize.models.Project;
  const project = await Project.create({
    name: 'Test Project',
    slug: 'test-project',
    status: 'active',
    created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;
});

afterAll(() => sequelize.close());

describe('test database infrastructure', () => {
  it('creates a ResearchStudy and reads it back with correct types', async () => {
    const ResearchStudy = sequelize.models.ResearchStudy;

    // Create
    const study = await ResearchStudy.create({
      project_id: testProjectId,
      name: 'test-study-001',
      slug: 'test-study-001',
      channel_name: 'test-channel',
      created_by: 'U_TEST_USER',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
      parsed_budget_amount: 1000,
      target_participants: 8,
    });

    expect(study).toBeDefined();
    expect(study.get('id')).toBeGreaterThan(0);
    expect(study.get('name')).toBe('test-study-001');

    // Read back
    const found = await ResearchStudy.findByPk(study.get('id') as number);
    expect(found).not.toBeNull();
    expect(found!.get('name')).toBe('test-study-001');
    expect(found!.get('researcher_name')).toBe('Test Researcher');
    expect(found!.get('parsed_budget_amount')).toBe(1000);
    expect(found!.get('target_participants')).toBe(8);
    expect(found!.get('created_by')).toBe('U_TEST_USER');
    expect(found!.get('project_id')).toBe(testProjectId);
  });

  it('per-test truncation works — table is empty at start', async () => {
    const ResearchStudy = sequelize.models.ResearchStudy;
    const count = await ResearchStudy.count();
    expect(count).toBe(0);
  });

  it('creates a StudyParticipant linked to a study via FK', async () => {
    const ResearchStudy = sequelize.models.ResearchStudy;
    const StudyParticipant = sequelize.models.StudyParticipant;

    const study = await ResearchStudy.create({
      project_id: testProjectId,
      name: 'fk-test-study',
      slug: 'fk-test-study',
      channel_name: 'test-channel',
      created_by: 'U_TEST',
      researcher_name: 'Researcher',
      researcher_email: 'r@test.com',
    });

    const participant = await StudyParticipant.create({
      study_id: study.get('id') as number,
      participant_code: 'PT-001',
      participant_name: 'Jane Doe',
      status_select: 'not_contacted',
      added_by: 'U_TEST',
    });

    expect(participant.get('id')).toBeGreaterThan(0);
    expect(participant.get('study_id')).toBe(study.get('id'));

    // FK constraint works — querying back via association
    const participants = await StudyParticipant.findAll({
      where: { study_id: study.get('id') as number },
    });
    expect(participants).toHaveLength(1);
    expect(participants[0].get('participant_name')).toBe('Jane Doe');
  });
});

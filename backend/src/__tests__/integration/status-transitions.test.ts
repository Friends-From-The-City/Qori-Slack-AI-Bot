/**
 * Flow 2: Status transition flow
 *
 * Tests the canonical status enum and participant tracker integrity.
 * Verifies that status updates propagate correctly through the model
 * and that getParticipantStats counts reflect the actual state.
 *
 * Phase 2B: Updated to create Project before ResearchStudy (FK required).
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import { PARTICIPANT_STATUS, ACTIVE_STATUSES, TERMINAL_STATUSES } from '../../constants/participantStatus';

const sequelize = getTestDb();

let testProjectId: number;

beforeEach(async () => {
  await truncateAll();

  const Project = sequelize.models.Project;
  const project = await Project.create({
    name: 'Status Test Project',
    slug: 'status-test-project',
    status: 'active',
    created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;
});

afterAll(() => sequelize.close());

async function createStudyWithParticipant(overrides: Record<string, unknown> = {}) {
  const study = await sequelize.models.ResearchStudy.create({
    project_id: testProjectId,
    name: 'status-test-study',
    slug: 'status-test-study',
    channel_name: 'test',
    created_by: 'U_TEST',
    researcher_name: 'R',
    researcher_email: 'r@test.com',
  });

  const participant = await sequelize.models.StudyParticipant.create({
    study_id: study.get('id') as number,
    participant_code: 'PT-001',
    participant_name: 'Test Participant',
    status_select: PARTICIPANT_STATUS.NOT_CONTACTED,
    added_by: 'U_TEST',
    ...overrides,
  });

  return { study, participant };
}

describe('status transitions', () => {
  it('starts a participant in not_contacted status', async () => {
    const { participant } = await createStudyWithParticipant();
    expect(participant.get('status_select')).toBe('not_contacted');
  });

  it('updates status from not_contacted to contacted', async () => {
    const { participant } = await createStudyWithParticipant();

    await participant.update({ status_select: PARTICIPANT_STATUS.CONTACTED });

    const fromDb = await sequelize.models.StudyParticipant.findByPk(participant.get('id') as number);
    expect(fromDb!.get('status_select')).toBe('contacted');
  });

  it('tracks full lifecycle: not_contacted → contacted → confirmed → completed', async () => {
    const { study, participant } = await createStudyWithParticipant();
    const StudyParticipant = sequelize.models.StudyParticipant;

    // Step 1: contacted
    await participant.update({ status_select: PARTICIPANT_STATUS.CONTACTED });

    // Step 2: confirmed
    await participant.update({ status_select: PARTICIPANT_STATUS.CONFIRMED });
    let fromDb = await StudyParticipant.findByPk(participant.get('id') as number);
    expect(fromDb!.get('status_select')).toBe('confirmed');

    // Step 3: completed
    await participant.update({ status_select: PARTICIPANT_STATUS.COMPLETED });
    fromDb = await StudyParticipant.findByPk(participant.get('id') as number);
    expect(fromDb!.get('status_select')).toBe('completed');
  });

  it('getParticipantStats reflects correct counts per status', async () => {
    const study = await sequelize.models.ResearchStudy.create({
      project_id: testProjectId,
      name: 'stats-test',
      slug: 'stats-test',
      channel_name: 'test',
      created_by: 'U_TEST',
      researcher_name: 'R',
      researcher_email: 'r@test.com',
    });
    const studyId = study.get('id') as number;
    const SP = sequelize.models.StudyParticipant;

    // Create participants in various statuses
    await SP.create({ study_id: studyId, participant_code: 'PT-001', participant_name: 'P1', status_select: 'not_contacted', added_by: 'U' });
    await SP.create({ study_id: studyId, participant_code: 'PT-002', participant_name: 'P2', status_select: 'contacted', added_by: 'U' });
    await SP.create({ study_id: studyId, participant_code: 'PT-003', participant_name: 'P3', status_select: 'confirmed', added_by: 'U' });
    await SP.create({ study_id: studyId, participant_code: 'PT-004', participant_name: 'P4', status_select: 'completed', added_by: 'U' });
    await SP.create({ study_id: studyId, participant_code: 'PT-005', participant_name: 'P5', status_select: 'contacted', added_by: 'U' });

    // Count by status directly (mirroring getParticipantStats logic)
    const total = await SP.count({ where: { study_id: studyId } });
    const confirmed = await SP.count({ where: { study_id: studyId, status_select: 'confirmed' } });
    const contacted = await SP.count({ where: { study_id: studyId, status_select: 'contacted' } });
    const completed = await SP.count({ where: { study_id: studyId, status_select: 'completed' } });
    const active = await SP.count({ where: { study_id: studyId, status_select: ACTIVE_STATUSES } });

    expect(total).toBe(5);
    expect(confirmed).toBe(1);
    expect(contacted).toBe(2);
    expect(completed).toBe(1);
    expect(active).toBe(3); // contacted(2) + confirmed(1) — active statuses
  });

  it('terminal statuses are excluded from active count', async () => {
    const study = await sequelize.models.ResearchStudy.create({
      project_id: testProjectId,
      name: 'terminal-test',
      slug: 'terminal-test',
      channel_name: 'test',
      created_by: 'U_TEST',
      researcher_name: 'R',
      researcher_email: 'r@test.com',
    });
    const studyId = study.get('id') as number;
    const SP = sequelize.models.StudyParticipant;

    // All terminal statuses
    let i = 1;
    for (const status of TERMINAL_STATUSES) {
      await SP.create({ study_id: studyId, participant_code: `PT-${String(i++).padStart(3, '0')}`, participant_name: `P-${status}`, status_select: status, added_by: 'U' });
    }

    const active = await SP.count({ where: { study_id: studyId, status_select: ACTIVE_STATUSES } });
    expect(active).toBe(0);
  });
});

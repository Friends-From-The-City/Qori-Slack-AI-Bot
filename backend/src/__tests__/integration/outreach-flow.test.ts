/**
 * Flow 3: Outreach event flow
 *
 * Tests the participant outreach tracking: recordOutreachSent(),
 * outreach_count incrementing, outreach_method recording, and
 * automatic status transition from not_contacted → contacted.
 *
 * Phase 2B: Updated to create Project before ResearchStudy (FK required).
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import { PARTICIPANT_STATUS } from '../../constants/participantStatus';
import type { OutreachMethod } from '../../types/common';

const sequelize = getTestDb();

let testProjectId: number;

beforeEach(async () => {
  await truncateAll();

  const Project = sequelize.models.Project;
  const project = await Project.create({
    name: 'Outreach Test Project',
    slug: 'outreach-test-project',
    status: 'active',
    created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;
});

afterAll(() => sequelize.close());

async function createParticipant(status: string = PARTICIPANT_STATUS.NOT_CONTACTED) {
  const study = await sequelize.models.ResearchStudy.create({
    project_id: testProjectId,
    name: 'outreach-test',
    slug: 'outreach-test',
    channel_name: 'test',
    created_by: 'U_TEST',
    researcher_name: 'R',
    researcher_email: 'r@test.com',
  });

  const participant = await sequelize.models.StudyParticipant.create({
    study_id: study.get('id') as number,
    participant_code: 'PT-001',
    participant_name: 'Outreach Participant',
    status_select: status,
    added_by: 'U_TEST',
  });

  return { study, participant };
}

describe('outreach flow', () => {
  it('recordOutreachSent sets timestamp, method, and increments count', async () => {
    const { participant } = await createParticipant();

    // Initial state
    expect(participant.get('outreach_sent_at')).toBeNull();
    expect(participant.get('outreach_method')).toBeNull();
    expect(participant.get('outreach_count')).toBe(0);

    // Record outreach
    await (participant as any).recordOutreachSent('email');

    // Read back from DB
    const fromDb = await sequelize.models.StudyParticipant.findByPk(participant.get('id') as number);
    expect(fromDb!.get('outreach_sent_at')).not.toBeNull();
    expect(fromDb!.get('outreach_method')).toBe('email');
    expect(fromDb!.get('outreach_count')).toBe(1);
  });

  it('auto-transitions from not_contacted to contacted on first outreach', async () => {
    const { participant } = await createParticipant(PARTICIPANT_STATUS.NOT_CONTACTED);

    expect(participant.get('status_select')).toBe('not_contacted');

    await (participant as any).recordOutreachSent('email');

    const fromDb = await sequelize.models.StudyParticipant.findByPk(participant.get('id') as number);
    expect(fromDb!.get('status_select')).toBe('contacted');
  });

  it('does NOT change status if already beyond not_contacted', async () => {
    const { participant } = await createParticipant(PARTICIPANT_STATUS.CONFIRMED);

    await (participant as any).recordOutreachSent('phone');

    const fromDb = await sequelize.models.StudyParticipant.findByPk(participant.get('id') as number);
    // Status stays confirmed — recordOutreachSent only auto-transitions not_contacted
    expect(fromDb!.get('status_select')).toBe('confirmed');
    // But outreach fields still updated
    expect(fromDb!.get('outreach_method')).toBe('phone');
    expect(fromDb!.get('outreach_count')).toBe(1);
  });

  it('increments outreach_count on repeated outreach', async () => {
    const { participant } = await createParticipant();

    await (participant as any).recordOutreachSent('email');
    await (participant as any).recordOutreachSent('slack');
    await (participant as any).recordOutreachSent('phone');

    const fromDb = await sequelize.models.StudyParticipant.findByPk(participant.get('id') as number);
    expect(fromDb!.get('outreach_count')).toBe(3);
    // Method reflects the most recent outreach
    expect(fromDb!.get('outreach_method')).toBe('phone');
  });

  it('outreach data survives round-trip through participant query', async () => {
    const study = await sequelize.models.ResearchStudy.create({
      project_id: testProjectId,
      name: 'outreach-query-test',
      slug: 'outreach-query-test',
      channel_name: 'test',
      created_by: 'U_TEST',
      researcher_name: 'R',
      researcher_email: 'r@test.com',
    });
    const studyId = study.get('id') as number;

    const p = await sequelize.models.StudyParticipant.create({
      study_id: studyId,
      participant_code: 'PT-001',
      participant_name: 'Query Participant',
      status_select: 'not_contacted',
      added_by: 'U_TEST',
    });
    await (p as any).recordOutreachSent('email');

    // Query all participants for study (mimics getParticipantsByStudy)
    const participants = await sequelize.models.StudyParticipant.findAll({
      where: { study_id: studyId },
    });

    expect(participants).toHaveLength(1);
    expect(participants[0].get('outreach_count')).toBe(1);
    expect(participants[0].get('outreach_method')).toBe('email');
    expect(participants[0].get('status_select')).toBe('contacted');
  });
});

/**
 * Flow 1: Compensation flow — end-to-end
 *
 * Tests the bug class we spent three rounds debugging in Phase 4.
 * Verifies that DECIMAL(10,2) → number coercion, service attribute
 * whitelisting, and compensation calculation all work together.
 *
 * Phase 2B: Updated to create Project before ResearchStudy (FK required).
 */

import { getTestDb, truncateAll, TEST_ORG_ID } from './setup/testDb';
import { calculatePerPersonCompensation } from '../../utils/compensationCalculator';

const sequelize = getTestDb();

let testProjectId: number;

beforeEach(async () => {
  await truncateAll();

  const Project = sequelize.models.Project;
  const project = await Project.create({
    name: 'Compensation Test Project',
    slug: 'compensation-test-project',
    status: 'active',
    created_by: 'U_TEST',
    organization_id: TEST_ORG_ID,
  });
  testProjectId = (project as unknown as { id: number }).id;
});

afterAll(() => sequelize.close());

describe('compensation flow', () => {
  it('calculates per-participant compensation from study budget and target', async () => {
    const ResearchStudy = sequelize.models.ResearchStudy;

    const study = await ResearchStudy.create({
      project_id: testProjectId,
      name: 'comp-test-study',
      slug: 'comp-test-study',
      channel_name: 'test-channel',
      created_by: 'U_TEST',
      researcher_name: 'Test Researcher',
      researcher_email: 'test@example.com',
      parsed_budget_amount: 1000,
      target_participants: 8,
    });

    // Read back from DB to verify DECIMAL coercion
    const fromDb = await ResearchStudy.findByPk(study.get('id') as number);
    expect(fromDb).not.toBeNull();

    const budget = fromDb!.get('parsed_budget_amount') as number;
    const target = fromDb!.get('target_participants') as number;

    // DECIMAL(10,2) → number coercion (ADR 0014)
    expect(typeof budget).toBe('number');
    expect(budget).toBe(1000);
    expect(target).toBe(8);

    // Compensation calculation
    const perPerson = calculatePerPersonCompensation({
      parsed_budget_amount: budget,
      target_participants: target,
    });

    expect(perPerson).toBe(125);
  });

  it('returns null when budget is missing', async () => {
    const result = calculatePerPersonCompensation({
      parsed_budget_amount: null,
      target_participants: 8,
    });
    expect(result).toBeNull();
  });

  it('returns null when target_participants is zero', async () => {
    const result = calculatePerPersonCompensation({
      parsed_budget_amount: 1000,
      target_participants: 0,
    });
    expect(result).toBeNull();
  });

  it('handles non-round division correctly', async () => {
    const ResearchStudy = sequelize.models.ResearchStudy;

    const study = await ResearchStudy.create({
      project_id: testProjectId,
      name: 'odd-division-study',
      slug: 'odd-division-study',
      channel_name: 'test',
      created_by: 'U_TEST',
      researcher_name: 'R',
      researcher_email: 'r@test.com',
      parsed_budget_amount: 1000,
      target_participants: 7,
    });

    const fromDb = await ResearchStudy.findByPk(study.get('id') as number);
    const perPerson = calculatePerPersonCompensation({
      parsed_budget_amount: fromDb!.get('parsed_budget_amount') as number,
      target_participants: fromDb!.get('target_participants') as number,
    });

    // 1000/7 = 142.857... → rounds to 142.86
    expect(perPerson).toBe(142.86);
  });

  it('DECIMAL budget survives round-trip through database', async () => {
    const ResearchStudy = sequelize.models.ResearchStudy;

    // Store a budget with cents
    await ResearchStudy.create({
      project_id: testProjectId,
      name: 'decimal-test',
      slug: 'decimal-test',
      channel_name: 'test',
      created_by: 'U_TEST',
      researcher_name: 'R',
      researcher_email: 'r@test.com',
      parsed_budget_amount: 1234.56,
      target_participants: 10,
    });

    const fromDb = await ResearchStudy.findOne({ where: { name: 'decimal-test' } });
    const budget = fromDb!.get('parsed_budget_amount') as number;

    // Must be a number, not a string (DECIMAL coercion)
    expect(typeof budget).toBe('number');
    expect(budget).toBe(1234.56);
  });
});

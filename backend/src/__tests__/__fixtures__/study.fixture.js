/**
 * Factory for ResearchStudy-shaped test objects.
 * Returns a fresh object each call so tests can mutate freely.
 */
function makeStudy(overrides = {}) {
  return {
    id: 1,
    name: 'test-study',
    path: 'studies/test-study',
    channel_name: 'C12345TEST',
    researcher_name: 'Test Researcher',
    researcher_email: 'test@example.com',
    parsed_budget_amount: 800.00,
    target_participants: 10,
    total_participants: 0,
    created_by: 'U_TEST_USER',
    created_at: new Date('2026-05-01T00:00:00Z'),
    updated_at: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

module.exports = { makeStudy };

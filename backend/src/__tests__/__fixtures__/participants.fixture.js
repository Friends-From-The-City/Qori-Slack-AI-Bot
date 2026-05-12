const { PARTICIPANT_STATUS } = require('../../constants/participantStatus');

/**
 * Factory for StudyParticipant-shaped test objects.
 */
function makeParticipant(overrides = {}) {
  return {
    id: 1,
    study_id: 1,
    participant_name: 'Test Participant',
    contact_details: 'test@example.com',
    recruitment_source: 'VA panel',
    status_select: PARTICIPANT_STATUS.NOT_CONTACTED,
    compensation_amount: null,
    outreach_sent_at: null,
    outreach_method: null,
    outreach_count: 0,
    added_by: 'U_TEST_USER',
    created_at: new Date('2026-05-01T00:00:00Z'),
    updated_at: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Returns a small cohort of participants in various statuses.
 */
function makeParticipantCohort(studyId = 1) {
  return [
    makeParticipant({ id: 1, study_id: studyId, participant_name: 'Participant A', status_select: PARTICIPANT_STATUS.COMPLETED, compensation_amount: 80.00 }),
    makeParticipant({ id: 2, study_id: studyId, participant_name: 'Participant B', status_select: PARTICIPANT_STATUS.SCHEDULED }),
    makeParticipant({ id: 3, study_id: studyId, participant_name: 'Participant C', status_select: PARTICIPANT_STATUS.NOT_CONTACTED }),
  ];
}

module.exports = { makeParticipant, makeParticipantCohort };

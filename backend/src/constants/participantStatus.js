const PARTICIPANT_STATUS = Object.freeze({
  NOT_CONTACTED: 'not_contacted',
  CONTACTED: 'contacted',
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  NEEDS_RESCHEDULE: 'needs_reschedule',
  COMPLETED: 'completed',
  DECLINED: 'declined',
  NO_RESPONSE: 'no_response',
  CANCELED: 'canceled',
});

const PARTICIPANT_STATUS_VALUES = Object.values(PARTICIPANT_STATUS);

const PARTICIPANT_STATUS_LABELS = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  needs_reschedule: 'Needs reschedule',
  completed: 'Completed',
  declined: 'Declined',
  no_response: 'No response',
  canceled: 'Canceled',
};

// States that count as 'active' for dashboard purposes
// (in pipeline, not terminal)
const ACTIVE_STATUSES = [
  PARTICIPANT_STATUS.CONTACTED,
  PARTICIPANT_STATUS.SCHEDULED,
  PARTICIPANT_STATUS.CONFIRMED,
  PARTICIPANT_STATUS.NEEDS_RESCHEDULE,
];

// Terminal statuses (no further action expected)
const TERMINAL_STATUSES = [
  PARTICIPANT_STATUS.COMPLETED,
  PARTICIPANT_STATUS.DECLINED,
  PARTICIPANT_STATUS.NO_RESPONSE,
  PARTICIPANT_STATUS.CANCELED,
];

module.exports = {
  PARTICIPANT_STATUS,
  PARTICIPANT_STATUS_VALUES,
  PARTICIPANT_STATUS_LABELS,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
};

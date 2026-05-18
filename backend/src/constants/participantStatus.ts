export const PARTICIPANT_STATUS = {
  NOT_CONTACTED: 'not_contacted',
  CONTACTED: 'contacted',
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  NEEDS_RESCHEDULE: 'needs_reschedule',
  COMPLETED: 'completed',
  DECLINED: 'declined',
  NO_RESPONSE: 'no_response',
  CANCELED: 'canceled',
} as const;

export type ParticipantStatus = typeof PARTICIPANT_STATUS[keyof typeof PARTICIPANT_STATUS];

export const PARTICIPANT_STATUS_VALUES: readonly ParticipantStatus[] = Object.values(PARTICIPANT_STATUS);

export const PARTICIPANT_STATUS_LABELS: Record<ParticipantStatus, string> = {
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
export const ACTIVE_STATUSES: readonly ParticipantStatus[] = [
  PARTICIPANT_STATUS.CONTACTED,
  PARTICIPANT_STATUS.SCHEDULED,
  PARTICIPANT_STATUS.CONFIRMED,
  PARTICIPANT_STATUS.NEEDS_RESCHEDULE,
];

// Terminal statuses (no further action expected)
export const TERMINAL_STATUSES: readonly ParticipantStatus[] = [
  PARTICIPANT_STATUS.COMPLETED,
  PARTICIPANT_STATUS.DECLINED,
  PARTICIPANT_STATUS.NO_RESPONSE,
  PARTICIPANT_STATUS.CANCELED,
];


/**
 * Fieldwork dashboard modal (Pattern B — status dashboard with sub-modal actions).
 *
 * Opens as a read-only state view with action buttons that push sub-modals.
 * Parent dashboard refreshes via views.update() after each sub-modal submit.
 */

const buildFieldworkDashboard = (study, participantStats, observerStats, outreachStats) => {
  const studyName = study.name;
  const totalTarget = study.total_participants || 0;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Fieldwork: ${studyName}` },
    },
    { type: 'divider' },

    // ── Participant status ─────────────────────────────────
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          '*Participants*',
          `  Confirmed: *${participantStats.confirmed_sessions_count}* of ${participantStats.total_participants_count}`,
          `  Pending: *${participantStats.pending_responses_count}*`,
          `  Completed: *${participantStats.completed_sessions_count}*`,
        ].join('\n'),
      },
    },

    // ── Observer status ────────────────────────────────────
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: (() => {
          const active = (observerStats.confirmed_observers || 0) + (observerStats.approved_observers || 0);
          const covered = observerStats.sessions_covered || 0;
          const total = observerStats.total_sessions || 0;
          const lines = [`*Observers* — ${active} (${covered} of ${total} sessions covered)`];
          const details = [];
          if (observerStats.confirmed_observers > 0) details.push(`${observerStats.confirmed_observers} confirmed`);
          if (observerStats.approved_observers > 0) details.push(`${observerStats.approved_observers} approved`);
          if (observerStats.pending_observers > 0) details.push(`${observerStats.pending_observers} pending`);
          if (observerStats.sessions_at_cap > 0) details.push(`${observerStats.sessions_at_cap} session${observerStats.sessions_at_cap === 1 ? '' : 's'} at cap`);
          if (details.length > 0) lines.push(`  ${details.join(' · ')}`);
          return lines.join('\n');
        })(),
      },
    },

    // ── Outreach status ────────────────────────────────────
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          '*Outreach*',
          `  Total contacted: *${outreachStats.total_contacted}*`,
          `  Awaiting response: *${outreachStats.awaiting_response}*`,
        ].join('\n'),
      },
    },

    { type: 'divider' },

    // ── Action buttons ─────────────────────────────────────
    {
      type: 'actions',
      block_id: 'fieldwork_actions_row1',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Add participant' },
          action_id: 'fieldwork_add_participant',
          value: JSON.stringify({ studyId: study.id, studyName }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Update status' },
          action_id: 'fieldwork_update_status',
          value: JSON.stringify({ studyId: study.id, studyName }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Add observer' },
          action_id: 'fieldwork_observe',
          value: JSON.stringify({ studyId: study.id, studyName }),
        },
      ],
    },
    {
      type: 'actions',
      block_id: 'fieldwork_actions_row2',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send outreach' },
          action_id: 'fieldwork_outreach',
          value: JSON.stringify({ studyId: study.id, studyName }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Upload notes' },
          action_id: 'fieldwork_upload_notes',
          value: JSON.stringify({ studyId: study.id, studyName }),
        },
      ],
    },
  ];

  return {
    type: 'modal',
    callback_id: 'fieldwork_dashboard',
    title: { type: 'plain_text', text: 'Fieldwork' },
    close: { type: 'plain_text', text: 'Close' },
    blocks,
  };
};

/**
 * Study selection modal shown when user has multiple studies.
 * After selecting, the dashboard opens for that study.
 */
const buildFieldworkStudyPicker = (studyOptions, activeStudyId) => {
  const initialOption = activeStudyId
    ? studyOptions.find(o => o.value === activeStudyId.toString()) || studyOptions[0]
    : studyOptions[0];

  return {
    type: 'modal',
    callback_id: 'fieldwork_study_picker',
    title: { type: 'plain_text', text: 'Fieldwork' },
    submit: { type: 'plain_text', text: 'Open dashboard' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'fieldwork_study_select',
        label: { type: 'plain_text', text: 'Select study' },
        element: {
          type: 'static_select',
          action_id: 'fieldwork_study_choice',
          placeholder: { type: 'plain_text', text: 'Pick a study...' },
          options: studyOptions,
          ...(initialOption ? { initial_option: initialOption } : {}),
        },
      },
    ],
  };
};

module.exports = { buildFieldworkDashboard, buildFieldworkStudyPicker };

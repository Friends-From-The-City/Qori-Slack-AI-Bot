/**
 * Fieldwork dashboard modal (Pattern B — status dashboard with sub-modal actions).
 *
 * Opens as a read-only state view with action buttons that push sub-modals.
 * Parent dashboard refreshes via views.update() after each sub-modal submit.
 */

// ── Helpers ───────────────────────────────────────────────

function timeAgo(date) {
  if (!date) return null;
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main dashboard builder ────────────────────────────────

const buildFieldworkDashboard = (study, participantStats, observerStats, outreachStats, context = {}) => {
  const studyName = study.name;
  const btnValue = JSON.stringify({ studyId: study.id, studyName });

  // ── Top context (study name + last updated) ─────────────
  const metaParts = [studyName];
  if (context.lastUpdated) metaParts.push(`Last updated ${timeAgo(context.lastUpdated)}`);

  // ── Participants ────────────────────────────────────────
  const pTotal = participantStats.total_participants_count || 0;
  const pConfirmed = participantStats.confirmed_sessions_count || 0;
  const pText = pTotal === 0
    ? '*Participants* — no participants yet'
    : `*Participants* — ${pConfirmed} of ${pTotal} confirmed`;

  // ── Observers ───────────────────────────────────────────
  const oActive = (observerStats.confirmed_observers || 0) + (observerStats.approved_observers || 0);
  const oText = oActive === 0
    ? '*Observers* — none yet'
    : `*Observers* — ${oActive} active`;

  // ── Outreach ────────────────────────────────────────────
  const rTotal = outreachStats.total_contacted || 0;
  const rResponses = outreachStats.responses_received || 0;
  const rText = rTotal === 0
    ? '*Outreach* — no outreach sent'
    : `*Outreach* — ${rTotal} sent, ${rResponses} responses`;

  const blocks = [
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: metaParts.join('  ·  ') }],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: pText },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Add participant' },
        action_id: 'fieldwork_add_participant',
        value: btnValue,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: oText },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Add observer' },
        action_id: 'fieldwork_observe',
        value: btnValue,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: rText },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Send outreach' },
        action_id: 'fieldwork_outreach',
        value: btnValue,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: 'fieldwork_actions_bottom',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Upload notes' },
          action_id: 'fieldwork_upload_notes',
          value: btnValue,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Update status' },
          action_id: 'fieldwork_update_status',
          value: btnValue,
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
    ? studyOptions.find((o) => o.value === activeStudyId.toString()) || studyOptions[0]
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

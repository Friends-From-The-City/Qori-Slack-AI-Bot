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

  const blocks = [];

  // ── Header ──────────────────────────────────────────────
  blocks.push(
    { type: 'header', text: { type: 'plain_text', text: 'Fieldwork' } },
    { type: 'divider' },
  );

  // ── Top context block (study metadata) ──────────────────
  const metaParts = [studyName, 'In study'];
  if (context.sessionDateRange) metaParts.push(context.sessionDateRange);
  if (context.lastUpdated) metaParts.push(`Last updated ${timeAgo(context.lastUpdated)}`);
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: metaParts.join('  ·  ') }],
  });

  // ── Participants ────────────────────────────────────────
  const pTotal = participantStats.total_participants_count || 0;
  const pConfirmed = participantStats.confirmed_sessions_count || 0;
  const pPending = participantStats.pending_responses_count || 0;
  const pCompleted = participantStats.completed_sessions_count || 0;
  const pDeclined = participantStats.declined_count || 0;
  const pNotContacted = Math.max(0, pTotal - pConfirmed - pPending - pCompleted - pDeclined);

  const pText = pTotal === 0
    ? '👥  *Participants* — none yet'
    : `👥  *Participants* — ${pConfirmed} of ${pTotal} confirmed`;

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: pText },
    accessory: {
      type: 'button',
      text: { type: 'plain_text', text: 'Add participant' },
      action_id: 'fieldwork_add_participant',
      value: btnValue,
    },
  });

  if (pTotal > 0) {
    const pParts = [];
    if (pConfirmed > 0) pParts.push(`✅ ${pConfirmed} confirmed`);
    if (pPending > 0) pParts.push(`⏳ ${pPending} pending`);
    if (pDeclined > 0) pParts.push(`❌ ${pDeclined} declined`);
    if (pNotContacted > 0) pParts.push(`${pNotContacted} not contacted`);
    if (pParts.length > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: pParts.join('  ·  ') }],
      });
    }
  }

  // ── Observers ───────────────────────────────────────────
  const oActive = (observerStats.confirmed_observers || 0) + (observerStats.approved_observers || 0);
  const oCovered = observerStats.sessions_covered || 0;
  const oTotalSessions = observerStats.total_sessions || 0;
  const oPending = observerStats.pending_observers || 0;
  const oAtCap = observerStats.sessions_at_cap || 0;

  const oText = oActive === 0 && oPending === 0
    ? '👁️  *Observers* — none yet'
    : `👁️  *Observers* — ${oActive} (${oCovered} of ${oTotalSessions} sessions covered)`;

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: oText },
    accessory: {
      type: 'button',
      text: { type: 'plain_text', text: 'Add observer' },
      action_id: 'fieldwork_observe',
      value: btnValue,
    },
  });

  if (oActive > 0 || oPending > 0) {
    const oParts = [];
    if (observerStats.confirmed_observers > 0) oParts.push(`✅ ${observerStats.confirmed_observers} confirmed`);
    if (oPending > 0) oParts.push(`⏳ ${oPending} pending`);
    if (oAtCap > 0) oParts.push(`${oAtCap} session${oAtCap === 1 ? '' : 's'} at cap`);
    if (oParts.length > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: oParts.join('  ·  ') }],
      });
    }
  }

  // ── Outreach ────────────────────────────────────────────
  const rTotal = outreachStats.total_contacted || 0;
  const rAwaiting = outreachStats.awaiting_response || 0;
  const rResponses = outreachStats.responses_received || 0;

  const rText = rTotal === 0
    ? '✉️  *Outreach* — none sent yet'
    : `✉️  *Outreach* — ${rTotal} contacted, ${rAwaiting} awaiting reply`;

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: rText },
    accessory: {
      type: 'button',
      text: { type: 'plain_text', text: 'Send outreach' },
      action_id: 'fieldwork_outreach',
      value: btnValue,
    },
  });

  if (rTotal > 0) {
    const rParts = [];
    if (context.lastOutreachSent) {
      rParts.push(`Last sent ${timeAgo(context.lastOutreachSent)}`);
    }
    rParts.push(`${rResponses} responses received`);
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: rParts.join('  ·  ') }],
    });
  }

  // ── Bottom actions ──────────────────────────────────────
  blocks.push(
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
  );

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

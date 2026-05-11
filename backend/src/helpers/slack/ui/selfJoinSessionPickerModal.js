/**
 * Self-join session picker — shown when a user clicks "Join as observer"
 * from the channel CTA message. Lets them pick which sessions to observe.
 *
 * @param {Array<{id: string, label: string, count: number}>} sessions
 *   Same shape as addObserverModal. Only sessions from the CTA are shown.
 * @param {string} studyName - Display name of the study.
 * @returns {object} Slack modal view
 */
const MAX_OBSERVERS = 3;

const buildSelfJoinSessionPickerModal = (sessions, studyName) => {
  const sessionOptions = sessions.map(s => {
    const slots = MAX_OBSERVERS - s.count;
    const suffix = slots <= 0 ? '(full)' : `(${s.count}/${MAX_OBSERVERS})`;
    return {
      text: { type: 'plain_text', text: `${s.label} ${suffix}` },
      value: s.id,
    };
  });

  const availableSessions = sessions.filter(s => s.count < MAX_OBSERVERS);

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Select the sessions you'd like to observe for *${studyName}*.`,
      },
    },
    { type: 'divider' },
  ];

  if (availableSessions.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'All sessions are at capacity. No observer slots available.',
      },
    });

    return {
      type: 'modal',
      callback_id: 'self_join_session_picker_modal',
      title: { type: 'plain_text', text: 'Join as observer' },
      close: { type: 'plain_text', text: 'Close' },
      blocks,
    };
  }

  blocks.push(
    {
      type: 'input',
      block_id: 'self_join_sessions_block',
      label: { type: 'plain_text', text: 'Sessions' },
      element: {
        type: 'multi_static_select',
        action_id: 'self_join_sessions',
        placeholder: { type: 'plain_text', text: 'Select sessions...' },
        options: sessionOptions,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Cap: ${MAX_OBSERVERS} observers per session. You'll receive the observer guide via DM.`,
        },
      ],
    },
  );

  return {
    type: 'modal',
    callback_id: 'self_join_session_picker_modal',
    title: { type: 'plain_text', text: 'Join as observer' },
    submit: { type: 'plain_text', text: 'Join' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
};

module.exports = { buildSelfJoinSessionPickerModal };

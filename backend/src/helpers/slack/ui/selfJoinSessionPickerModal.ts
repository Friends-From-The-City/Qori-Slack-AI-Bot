/**
 * Self-join session picker — shown when a user clicks "Join as observer"
 * from the channel CTA message. Lets them pick which sessions to observe.
 */

interface SessionOption {
  id: string;
  label: string;
  count: number;
}

const MAX_OBSERVERS = 3;

export const buildSelfJoinSessionPickerModal = (sessions: SessionOption[], studyName: string) => {
  const sessionOptions = sessions.map(s => {
    const slots = MAX_OBSERVERS - s.count;
    const suffix = slots <= 0 ? '(full)' : `(${s.count}/${MAX_OBSERVERS})`;
    return {
      text: { type: 'plain_text' as const, text: `${s.label} ${suffix}` },
      value: s.id,
    };
  });

  const availableSessions = sessions.filter(s => s.count < MAX_OBSERVERS);

  const blocks: Record<string, unknown>[] = [
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
      type: 'input',
      block_id: 'self_join_role_block',
      label: { type: 'plain_text', text: 'Your role' },
      element: {
        type: 'static_select',
        action_id: 'self_join_role',
        placeholder: { type: 'plain_text', text: 'Select a role...' },
        options: [
          { text: { type: 'plain_text', text: '\u{1f4dd} Note-taker' }, value: 'note_taker' },
          { text: { type: 'plain_text', text: '\u{1f441}\ufe0f Silent Observer' }, value: 'silent_observer' },
          { text: { type: 'plain_text', text: '\u{1f4ca} PM Observer' }, value: 'pm_observer' },
          { text: { type: 'plain_text', text: '\u{1f3db}\ufe0f Stakeholder' }, value: 'stakeholder' },
        ],
        initial_option: { text: { type: 'plain_text', text: '\u{1f441}\ufe0f Silent Observer' }, value: 'silent_observer' },
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Cap: ${MAX_OBSERVERS} total per session · 1 Note-taker · 1 Stakeholder · 2 PM Observers · 3 Silent Observers. You'll receive the observer guide via DM.`,
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

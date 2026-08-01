import type { View } from '@slack/types';

/**
 * "Add observer" modal — researcher selects sessions + people and/or posts a channel CTA.
 */

interface SessionOption {
  id: string;
  label: string;
  count: number;
}

const MAX_OBSERVERS = 3;

const buildAddObserverModal = (sessions: SessionOption[], channelName: string) => {
  const sessionOptions = sessions.map(s => {
    const slots = MAX_OBSERVERS - s.count;
    const suffix = slots <= 0 ? '(full)' : `(${s.count}/${MAX_OBSERVERS})`;
    return {
      text: { type: 'plain_text', text: `${s.label} ${suffix}` },
      value: s.id,
    };
  });

  const blocks = [
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'observer_sessions_block',
      label: { type: 'plain_text', text: 'Sessions' },
      element: {
        type: 'multi_static_select',
        action_id: 'observer_sessions',
        placeholder: { type: 'plain_text', text: 'Select sessions...' },
        options: sessionOptions,
      },
    },
    {
      type: 'input',
      block_id: 'observer_people_block',
      optional: true,
      label: { type: 'plain_text', text: 'Specific people' },
      element: {
        type: 'multi_users_select',
        action_id: 'observer_people',
        placeholder: { type: 'plain_text', text: 'Choose people' },
      },
    },
    {
      type: 'input',
      block_id: 'observer_role_block',
      label: { type: 'plain_text', text: 'Observer role' },
      element: {
        type: 'static_select',
        action_id: 'observer_role',
        placeholder: { type: 'plain_text', text: 'Select a role...' },
        options: [
          { text: { type: 'plain_text', text: 'Note-taker' }, value: 'note_taker' },
          { text: { type: 'plain_text', text: 'Silent Observer' }, value: 'silent_observer' },
          { text: { type: 'plain_text', text: 'PM Observer' }, value: 'pm_observer' },
          { text: { type: 'plain_text', text: 'Stakeholder' }, value: 'stakeholder' },
        ],
        initial_option: { text: { type: 'plain_text', text: 'Silent Observer' }, value: 'silent_observer' },
      },
    },
    {
      type: 'input',
      block_id: 'observer_channel_cta_block',
      optional: true,
      label: { type: 'plain_text', text: 'Channel invite' },
      element: {
        type: 'checkboxes',
        action_id: 'observer_channel_cta',
        options: [
          {
            text: {
              type: 'mrkdwn',
              text: `Also post invite to #${channelName}`,
            },
            description: {
              type: 'plain_text',
              text: 'Anyone in the channel can click to self-join the selected sessions.',
            },
            value: 'post_channel_cta',
          },
        ],
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Cap: ${MAX_OBSERVERS} total per session · 1 Note-taker · 1 Stakeholder · 2 PM Observers · 3 Silent Observers. Both paths trigger the observer guide DM.`,
        },
      ],
    },
  ];

  return {
    type: 'modal',
    callback_id: 'add_observer_modal',
    title: { type: 'plain_text', text: 'Add observer' },
    submit: { type: 'plain_text', text: 'Done' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  } as unknown as View;
};

export { buildAddObserverModal };

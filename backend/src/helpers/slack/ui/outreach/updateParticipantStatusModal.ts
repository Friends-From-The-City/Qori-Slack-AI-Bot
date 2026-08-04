/* eslint-disable max-len */
/* eslint-disable quotes */
import { PARTICIPANT_STATUS_VALUES, PARTICIPANT_STATUS_LABELS } from '../../../../constants/participantStatus';

const statusOptions = PARTICIPANT_STATUS_VALUES.map((value) => ({
  text: { type: 'plain_text' as const, text: PARTICIPANT_STATUS_LABELS[value] },
  value,
}));

export const updateParticipantStatusModal = {
  type: "modal",
  callback_id: "update-participant-status",
  title: {
    type: "plain_text",
    text: "Update Participant",
  },
  submit: {
    type: "plain_text",
    text: "Update Participant",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    {
      type: "input",
      block_id: "study_selection_block",
      element: {
        type: "static_select",
        action_id: "update_participant_study_selection",
        placeholder: {
          type: "plain_text",
          text: "Select study...",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "Loading studies...",
            },
            value: "loading",
          },
        ],
      },
      label: {
        type: "plain_text",
        text: "Study",
      },
    },
    // Load Participants Button (only shown when study is selected)
    {
      type: "actions",
      block_id: "load_participants_block",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Load Participants",
            emoji: true,
          },
          action_id: "load_participants_button",
          confirm: {
            title: {
              type: "plain_text",
              text: "Load Participants",
            },
            text: {
              type: "mrkdwn",
              text: "This will load all available participants for the selected study. Continue?",
            },
            confirm: {
              type: "plain_text",
              text: "Yes, Load Participants",
            },
            deny: {
              type: "plain_text",
              text: "Cancel",
            },
          },
        },
      ],
    },
    { type: "divider" },
    {
      type: "input",
      block_id: "participant_selection_block",
      element: {
        type: "static_select",
        action_id: "participant_selection",
        placeholder: {
          type: "plain_text",
          text: "Select participant...",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "Select a study first...",
            },
            value: "no_study_selected",
          },
        ],
      },
      label: {
        type: "plain_text",
        text: "Participant",
      },
      hint: {
        type: "plain_text",
        text: "Load participants first to see options",
      },
    },
    { type: "divider" },
    {
      type: "input",
      block_id: "status_update_block",
      element: {
        type: "static_select",
        action_id: "status_update",
        placeholder: {
          type: "plain_text",
          text: "Select new status...",
        },
        options: statusOptions,
      },
      label: {
        type: "plain_text",
        text: "Status",
      },
    },
    {
      type: "input",
      optional: true,
      block_id: "update_notes_block",
      element: {
        type: "plain_text_input",
        multiline: true,
        action_id: "update_notes",
        placeholder: {
          type: "plain_text",
          text: "e.g., Participant confirmed availability, moved session to morning slot, accommodation request noted...",
        },
      },
      label: {
        type: "plain_text",
        text: "Notes",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Add context for this status change.",
        },
      ],
    },
  ],
};

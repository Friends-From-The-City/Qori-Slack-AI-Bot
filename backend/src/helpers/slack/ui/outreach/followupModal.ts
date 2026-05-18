export const followupModal = {
  type: "modal",
  callback_id: "outreach_follow_up_modal",
  title: {
    type: "plain_text",
    text: "Follow-up",
  },
  submit: {
    type: "plain_text",
    text: "Generate",
  },
  close: {
    type: "plain_text",
    text: "Back",
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Gentle check-in when a participant hasn't responded. Includes easy opt-out.",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "participant_id_block",
      label: {
        type: "plain_text",
        text: "Participant",
      },
      element: {
        type: "static_select",
        action_id: "participant_id",
        placeholder: {
          type: "plain_text",
          text: "Select participant...",
        },
        options: [{ text: { type: "plain_text", text: "Loading..." }, value: "loading" }],
      },
    },
  ],
};

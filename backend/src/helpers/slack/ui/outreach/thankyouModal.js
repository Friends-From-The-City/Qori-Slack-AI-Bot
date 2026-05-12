const thankyouModal = {
  type: "modal",
  callback_id: "outreach_thank_you_modal",
  title: {
    type: "plain_text",
    text: "Thank you",
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
          text: "Post-session appreciation with compensation info and next steps.",
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

module.exports = { thankyouModal };

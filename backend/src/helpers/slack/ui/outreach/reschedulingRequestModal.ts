export const reschedulingRequestModal = {
  type: "modal",
  callback_id: "outreach_rescheduling_modal",
  title: {
    type: "plain_text",
    text: "Rescheduling request",
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
          text: "Request to reschedule a session with alternative time options.",
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
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Rescheduling*",
      },
    },
    {
      type: "input",
      block_id: "original_date_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Original session date",
      },
      element: {
        type: "datepicker",
        action_id: "original_date",
        placeholder: {
          type: "plain_text",
          text: "Select date",
        },
      },
    },
    {
      type: "input",
      block_id: "new_options_block",
      label: {
        type: "plain_text",
        text: "New time options *",
      },
      hint: {
        type: "plain_text",
        text: "Provide 2-3 alternative times",
      },
      element: {
        type: "plain_text_input",
        action_id: "new_options",
        placeholder: {
          type: "plain_text",
          text: "e.g., Tuesday 2pm, Wednesday 10am, or Thursday 3pm",
        },
        multiline: true,
      },
    },
  ],
};

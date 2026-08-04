export const sessionReminderModal = {
  type: "modal",
  callback_id: "outreach_session_reminder_modal",
  title: {
    type: "plain_text",
    text: "Session Reminder",
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
          text: "Send a 24-48 hour reminder before their scheduled session.",
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
        text: "*Session details*",
      },
    },
    {
      type: "input",
      block_id: "session_date_block",
      label: {
        type: "plain_text",
        text: "Session date *",
      },
      element: {
        type: "datepicker",
        action_id: "session_date",
        placeholder: {
          type: "plain_text",
          text: "Select date",
        },
      },
    },
    {
      type: "input",
      block_id: "session_time_block",
      label: {
        type: "plain_text",
        text: "Session time *",
      },
      element: {
        type: "timepicker",
        action_id: "session_time",
        placeholder: {
          type: "plain_text",
          text: "Select time",
        },
      },
    },
    {
      type: "input",
      block_id: "meeting_link_block",
      label: {
        type: "plain_text",
        text: "Meeting link *",
      },
      element: {
        type: "plain_text_input",
        action_id: "meeting_link",
        placeholder: {
          type: "plain_text",
          text: "e.g., https://va-gov.zoom.us/j/123456789",
        },
      },
    },
  ],
};

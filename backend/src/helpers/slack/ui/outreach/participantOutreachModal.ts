export const participantOutreachModal = {
  type: "modal",
  callback_id: "participant-outreach-modal",
  title: {
    type: "plain_text",
    text: "Participant Outreach",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  submit: {
    type: "plain_text",
    text: "Next",
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          "type": "mrkdwn",
          "text": "Create professional messages to recruit, schedule, remind, and thank your research participants."
        }
      ]
    },
    // {
    //   type: "section",
    //   block_id: "message_types_header_section",
    //   text: {
    //     type: "mrkdwn",
    //     text: "\ud83d\udcc3 *Message Types*\nSelect the type of outreach message you need based on your recruitment phase.",
    //   },
    // },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📬 Message type*",
      },
    },
    {
      type: "input",
      block_id: "message_type_block",
      label: {
        type: "plain_text",
        text: "Select message type *",
      },
      element: {
        type: "radio_buttons",
        action_id: "message_type",
        options: [
          {
            text: {
              type: "plain_text",
              text: "📧 Initial recruitment",
            },
            value: "initial_recruitment",
          },
          {
            text: {
              type: "plain_text",
              text: "📅 Session confirmation",
            },
            value: "session_confirmation",
          },
          {
            text: {
              type: "plain_text",
              text: "⏰ Session reminder",
            },
            value: "session_reminder",
          },
          {
            text: {
              type: "plain_text",
              text: "🔄 Rescheduling request",
            },
            value: "rescheduling_request",
          },
          {
            text: {
              type: "plain_text",
              text: "🔔 Follow-up",
            },
            value: "follow_up",
          },
          {
            text: {
              type: "plain_text",
              text: "🙏 Thank you",
            },
            value: "thank_you",
          },
        ],
      },
    },
    // {
    //   type: "divider",
    // },
    // {
    //   type: "context",
    //   elements: [
    //     {
    //       type: "mrkdwn",
    //       text: "💡 *Tip:* Choose the message type that best matches your current recruitment phase.",
    //     },
    //   ],
    // },
  ],
};

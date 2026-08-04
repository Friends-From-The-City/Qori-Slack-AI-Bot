export const initialRecruitmentModal = {
  type: "modal",
  callback_id: "outreach_initial_recruitment_modal",
  title: {
    type: "plain_text",
    text: "Initial Recruitment",
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
          text: "First contact to invite a participant to your study. Study details and researcher info will be pulled automatically.",
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
        text: "*Signup details*",
      },
    },
    {
      type: "input",
      block_id: "signup_instructions_block",
      label: {
        type: "plain_text",
        text: "How should they sign up? *",
      },
      hint: {
        type: "plain_text",
        text: "Include screener link, Calendly, or instructions to reply",
      },
      element: {
        type: "plain_text_input",
        action_id: "signup_instructions",
        placeholder: {
          type: "plain_text",
          text: "e.g., https://calendly.com/research-team or Reply to this email",
        },
        multiline: true,
      },
    },
  ],
};

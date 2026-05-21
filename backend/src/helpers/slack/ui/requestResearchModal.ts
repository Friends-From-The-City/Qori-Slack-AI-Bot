export const requestResearchModal = {
  type: "modal",
  callback_id: "request_research_modal",
  private_metadata: "{}",
  title: {
    type: "plain_text",
    text: "Request Research",
    emoji: true,
  },
  submit: {
    type: "plain_text",
    text: "Submit",
    emoji: true,
  },
  close: {
    type: "plain_text",
    text: "Cancel",
    emoji: true,
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Describe the business problem and what you'd like to learn. The research team will review your request and create a detailed research plan.",
        },
      ],
    },
    {
      type: "input",
      block_id: "project_title_block",
      label: {
        type: "plain_text",
        text: "Project Title *",
      },
      element: {
        type: "plain_text_input",
        action_id: "project_title_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Claims Status Navigation Study",
        },
        max_length: 100,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🎯 Research Scope*",
      },
    },
    {
      type: "input",
      block_id: "problem_description_block",
      label: {
        type: "plain_text",
        text: "What problem or opportunity does this address? *",
      },
      hint: {
        type: "plain_text",
        text: "Include data observed, user complaints, or business metrics.",
      },
      element: {
        type: "plain_text_input",
        action_id: "problem_description_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Users report difficulty navigating the mobile app...",
        },
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "affected_users_block",
      label: {
        type: "plain_text",
        text: "Who are the affected users? *",
      },
      element: {
        type: "plain_text_input",
        action_id: "affected_users_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Veterans using the mobile app to check claim status",
        },
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "decisions_block",
      label: {
        type: "plain_text",
        text: "What decisions will this research inform? *",
      },
      element: {
        type: "plain_text_input",
        action_id: "decisions_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Q4 navigation redesign priorities, IA strategy",
        },
        multiline: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*⏱️ Timeline*",
      },
    },
    {
      type: "input",
      block_id: "urgency_block",
      label: {
        type: "plain_text",
        text: "Urgency *",
      },
      element: {
        type: "static_select",
        action_id: "urgency_select",
        placeholder: {
          type: "plain_text",
          text: "Select urgency...",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "🔴 Critical (1-2 weeks)",
            },
            value: "critical",
          },
          {
            text: {
              type: "plain_text",
              text: "🟠 High (2-4 weeks)",
            },
            value: "high",
          },
          {
            text: {
              type: "plain_text",
              text: "🟡 Medium (1-2 months)",
            },
            value: "medium",
          },
          {
            text: {
              type: "plain_text",
              text: "🟢 Low (no deadline)",
            },
            value: "low",
          },
        ],
      },
    },
    {
      type: "input",
      block_id: "deadline_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Deadline",
      },
      element: {
        type: "datepicker",
        action_id: "deadline_picker",
        placeholder: {
          type: "plain_text",
          text: "Select a date",
        },
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📎 Additional Context*",
      },
    },
    {
      type: "input",
      block_id: "existing_knowledge_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "What do you already know?",
      },
      element: {
        type: "plain_text_input",
        action_id: "existing_knowledge_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Previous research showed..., Analytics indicate...",
        },
        multiline: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "submitted_by_block",
      label: {
        type: "plain_text",
        text: "Submitted by",
      },
      hint: {
        type: "plain_text",
        text: "Auto-filled with you — change if submitting on someone's behalf",
      },
      element: {
        type: "users_select",
        action_id: "submitted_by_select",
        placeholder: {
          type: "plain_text",
          text: "Select person...",
        },
      },
    },
  ],
};

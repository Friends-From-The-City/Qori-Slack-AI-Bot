/* eslint-disable max-len */
/* eslint-disable quotes */

export const stakeholderInterviewGuideModal = {
  type: "modal",
  callback_id: "stakeholder_interview_guide_modal",
  title: {
    type: "plain_text",
    text: "Stakeholder guide",
  },
  submit: {
    type: "plain_text",
    text: "Generate Guide",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Create an interview guide for internal stakeholder conversations.",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📂 Study*",
      },
    },
    {
      type: "input",
      block_id: "study_select_block",
      label: {
        type: "plain_text",
        text: "Research study folder",
      },
      hint: {
        type: "plain_text",
        text: "Auto-populated from study",
      },
      element: {
        type: "plain_text_input",
        action_id: "selected_study",
        initial_value: "{{study_name}}",
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*👤 Stakeholder info*",
      },
    },
    {
      type: "input",
      block_id: "stakeholder_name_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Stakeholder name",
      },
      element: {
        type: "plain_text_input",
        action_id: "stakeholder_name",
        placeholder: {
          type: "plain_text",
          text: "e.g., Sarah Chen",
        },
      },
    },
    {
      type: "input",
      block_id: "stakeholder_role_block",
      label: {
        type: "plain_text",
        text: "Stakeholder role *",
      },
      element: {
        type: "static_select",
        action_id: "stakeholder_role",
        placeholder: {
          type: "plain_text",
          text: "Select role...",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "Product Owner / PM",
            },
            value: "product_owner",
          },
          {
            text: {
              type: "plain_text",
              text: "Engineering Lead",
            },
            value: "engineering_lead",
          },
          {
            text: {
              type: "plain_text",
              text: "Design Lead",
            },
            value: "design_lead",
          },
          {
            text: {
              type: "plain_text",
              text: "Policy / Compliance SME",
            },
            value: "policy_sme",
          },
          {
            text: {
              type: "plain_text",
              text: "Operations / Support",
            },
            value: "operations",
          },
          {
            text: {
              type: "plain_text",
              text: "Content Strategist",
            },
            value: "content",
          },
          {
            text: {
              type: "plain_text",
              text: "Other",
            },
            value: "other",
          },
        ],
      },
    },
    {
      type: "input",
      block_id: "stakeholder_team_block",
      label: {
        type: "plain_text",
        text: "Team / Department *",
      },
      element: {
        type: "plain_text_input",
        action_id: "stakeholder_team",
        placeholder: {
          type: "plain_text",
          text: "e.g., OCTO Health & Benefits",
        },
      },
    },
    {
      type: "input",
      block_id: "session_duration_block",
      label: {
        type: "plain_text",
        text: "Interview duration *",
      },
      element: {
        type: "static_select",
        action_id: "session_duration",
        placeholder: {
          type: "plain_text",
          text: "Select duration...",
        },
        initial_option: {
          text: {
            type: "plain_text",
            text: "45 minutes",
          },
          value: "45",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "30 minutes",
            },
            value: "30",
          },
          {
            text: {
              type: "plain_text",
              text: "45 minutes",
            },
            value: "45",
          },
          {
            text: {
              type: "plain_text",
              text: "60 minutes",
            },
            value: "60",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🎯 Focus areas*",
      },
    },
    {
      type: "input",
      block_id: "interview_focus_block",
      label: {
        type: "plain_text",
        text: "Select all that apply *",
      },
      element: {
        type: "checkboxes",
        action_id: "interview_focus",
        options: [
          {
            text: {
              type: "plain_text",
              text: "🔧 Constraints",
            },
            description: {
              type: "plain_text",
              text: "Technical, policy, resource limitations",
            },
            value: "constraints",
          },
          {
            text: {
              type: "plain_text",
              text: "🎯 Priorities",
            },
            description: {
              type: "plain_text",
              text: "Strategic goals, roadmap",
            },
            value: "priorities",
          },
          {
            text: {
              type: "plain_text",
              text: "⚙️ Processes",
            },
            description: {
              type: "plain_text",
              text: "Backstage operations",
            },
            value: "processes",
          },
          {
            text: {
              type: "plain_text",
              text: "📋 Requirements",
            },
            description: {
              type: "plain_text",
              text: "Must-haves, dependencies",
            },
            value: "requirements",
          },
          {
            text: {
              type: "plain_text",
              text: "📜 History",
            },
            description: {
              type: "plain_text",
              text: "Why things are this way",
            },
            value: "history",
          },
          {
            text: {
              type: "plain_text",
              text: "🔍 User research",
            },
            description: {
              type: "plain_text",
              text: "Explain user findings",
            },
            value: "user_research",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📊 Research context*",
      },
    },
    {
      type: "input",
      block_id: "research_questions_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Key questions you want answered",
      },
      element: {
        type: "plain_text_input",
        action_id: "research_questions",
        placeholder: {
          type: "plain_text",
          text: "e.g., Why is the claims API limited to 10 results? What would it take to change?",
        },
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "user_findings_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "User findings to discuss",
      },
      hint: {
        type: "plain_text",
        text: "Share findings you want stakeholder perspective on",
      },
      element: {
        type: "plain_text_input",
        action_id: "user_findings",
        placeholder: {
          type: "plain_text",
          text: "e.g., 45% of users abandon at step 3. Users report confusion about status labels.",
        },
        multiline: true,
      },
    },
  ],
};

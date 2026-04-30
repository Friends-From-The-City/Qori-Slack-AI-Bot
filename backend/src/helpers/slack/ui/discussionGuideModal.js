/* eslint-disable max-len */
/* eslint-disable quotes */
const discussionGuideModal = {
  type: "modal",
  callback_id: "discussion_guide_modal",
  title: {
    type: "plain_text",
    text: "Discussion Guide",
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
          text: "Create a session guide for your user research. Qori generates introduction scripts, methodology-specific tasks, and closing protocols.",
        },
      ],
    },
    {
      type: "divider",
    },
    // Study (auto-populated)
    {
      type: "input",
      block_id: "study_name",
      element: {
        type: "plain_text_input",
        action_id: "value",
        placeholder: {
          type: "plain_text",
          text: "Auto-selected study name",
        },
      },
      label: {
        type: "plain_text",
        text: "Study",
      },
    },
    {
      type: "divider",
    },
    // Research goal / focus
    {
      type: "input",
      block_id: "research_focus_block",
      label: {
        type: "plain_text",
        text: "Research goal / focus",
      },
      hint: {
        type: "plain_text",
        text: "What are you trying to learn in this session?",
      },
      element: {
        type: "plain_text_input",
        action_id: "research_focus",
        placeholder: {
          type: "plain_text",
          text: "e.g., How Veterans navigate the mobile app to complete tasks",
        },
        multiline: true,
      },
    },
    // Research questions
    {
      type: "input",
      block_id: "research_questions_block",
      label: {
        type: "plain_text",
        text: "Research questions",
      },
      hint: {
        type: "plain_text",
        text: "Specific questions this session should answer",
      },
      element: {
        type: "plain_text_input",
        action_id: "research_questions",
        placeholder: {
          type: "plain_text",
          text: "e.g., Where do Veterans abandon tasks? What causes confusion?",
        },
        multiline: true,
      },
    },
    {
      type: "divider",
    },
    // Methodology
    {
      type: "input",
      block_id: "research_method_block",
      label: {
        type: "plain_text",
        text: "Methodology",
      },
      element: {
        type: "static_select",
        action_id: "research_method",
        placeholder: {
          type: "plain_text",
          text: "Select method...",
        },
        options: [
          {
            text: { type: "plain_text", text: "Usability Testing" },
            value: "usability_testing",
          },
          {
            text: { type: "plain_text", text: "User Interviews" },
            value: "user_interviews",
          },
          {
            text: { type: "plain_text", text: "Card Sorting" },
            value: "card_sorting",
          },
          {
            text: { type: "plain_text", text: "Concept Testing" },
            value: "concept_testing",
          },
          {
            text: { type: "plain_text", text: "Contextual Inquiry" },
            value: "contextual_inquiry",
          },
          {
            text: { type: "plain_text", text: "Tree Test" },
            value: "tree_test",
          },
          {
            text: { type: "plain_text", text: "Mixed Methods" },
            value: "mixed_methods",
          },
        ],
      },
    },
    // Session length
    {
      type: "input",
      block_id: "session_length_block",
      label: {
        type: "plain_text",
        text: "Session length",
      },
      element: {
        type: "static_select",
        action_id: "session_length",
        initial_option: {
          text: { type: "plain_text", text: "60 minutes" },
          value: "60",
        },
        options: [
          {
            text: { type: "plain_text", text: "30 minutes" },
            value: "30",
          },
          {
            text: { type: "plain_text", text: "45 minutes" },
            value: "45",
          },
          {
            text: { type: "plain_text", text: "60 minutes" },
            value: "60",
          },
          {
            text: { type: "plain_text", text: "90 minutes" },
            value: "90",
          },
        ],
      },
    },
    // Number of tasks / topics
    {
      type: "input",
      block_id: "task_count_block",
      label: {
        type: "plain_text",
        text: "Number of tasks / topics",
      },
      hint: {
        type: "plain_text",
        text: "Main activities in the session (typically 3-7)",
      },
      element: {
        type: "static_select",
        action_id: "task_count",
        initial_option: {
          text: { type: "plain_text", text: "5" },
          value: "5",
        },
        options: [
          {
            text: { type: "plain_text", text: "3" },
            value: "3",
          },
          {
            text: { type: "plain_text", text: "5" },
            value: "5",
          },
          {
            text: { type: "plain_text", text: "7" },
            value: "7",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    // Lead moderator (auto-filled)
    {
      type: "input",
      block_id: "lead_moderator_block",
      label: {
        type: "plain_text",
        text: "Lead moderator",
      },
      hint: {
        type: "plain_text",
        text: "Auto-filled from your profile. Edit if needed.",
      },
      element: {
        type: "plain_text_input",
        action_id: "lead_moderator",
        initial_value: "{{lead_researcher}}",
      },
    },
  ],
};

module.exports = { discussionGuideModal };

/* eslint-disable max-len */
/* eslint-disable quotes */

// Compute next Monday from today for default start date
function getNextMonday() {
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = day === 0 ? 1 : (8 - day);
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  return nextMonday.toISOString().split('T')[0]; // YYYY-MM-DD format
}

const researchPlanGeneratorModal = {
  type: "modal",
  callback_id: "research_plan_modal",
  title: {
    type: "plain_text",
    text: "Research Plan",
  },
  submit: {
    type: "plain_text",
    text: "Generate Plan",
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
          text: "Define your research approach. Qori will generate a stakeholder-ready research plan with methodology, timeline, and deliverables.",
        },
      ],
    },
    {
      type: "divider",
    },
    // Study (auto-populated from selection)
    {
      type: "input",
      block_id: "study_folder_block",
      label: {
        type: "plain_text",
        text: "Study",
      },
      hint: {
        type: "plain_text",
        text: "Auto-populated from study selection",
      },
      element: {
        type: "plain_text_input",
        action_id: "study_folder_input",
        initial_value: "{{study_name}}",
      },
    },
    // Study title
    {
      type: "input",
      block_id: "study_title_block",
      label: {
        type: "plain_text",
        text: "Study title",
      },
      element: {
        type: "plain_text_input",
        action_id: "study_title_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Navigation Redesign Usability Study",
        },
      },
    },
    {
      type: "divider",
    },
    // Business context (replaces product_area + decision_context)
    {
      type: "input",
      block_id: "decision_block",
      label: {
        type: "plain_text",
        text: "Business context",
      },
      hint: {
        type: "plain_text",
        text: "What problem does this research address? What product or feature is involved? What decision will the findings inform?",
      },
      element: {
        type: "plain_text_input",
        action_id: "decision_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., VA mobile app navigation has 45% task abandonment. Identify causes to inform Q3 redesign.",
        },
        multiline: true,
      },
    },
    // Research goal
    {
      type: "input",
      block_id: "research_goal_block",
      label: {
        type: "plain_text",
        text: "What do you want to learn?",
      },
      element: {
        type: "plain_text_input",
        action_id: "research_goal_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Identify navigation barriers and understand veteran mental models",
        },
        multiline: true,
      },
    },
    {
      type: "divider",
    },
    // Methodology (single select — replaces multi_static_select)
    {
      type: "input",
      block_id: "methodology_block",
      label: {
        type: "plain_text",
        text: "Methodology",
      },
      element: {
        type: "static_select",
        action_id: "methodology_select",
        placeholder: {
          type: "plain_text",
          text: "Select method...",
        },
        options: [
          {
            text: { type: "plain_text", text: "Usability Testing" },
            value: "Usability Testing",
          },
          {
            text: { type: "plain_text", text: "User Interviews" },
            value: "User Interviews",
          },
          {
            text: { type: "plain_text", text: "Survey Research" },
            value: "Survey Research",
          },
          {
            text: { type: "plain_text", text: "Card Sorting" },
            value: "Card Sorting",
          },
          {
            text: { type: "plain_text", text: "Concept Testing" },
            value: "Concept Testing",
          },
          {
            text: { type: "plain_text", text: "Mixed Methods" },
            value: "Mixed Methods",
          },
          {
            text: { type: "plain_text", text: "Contextual Inquiry" },
            value: "Contextual Inquiry",
          },
          {
            text: { type: "plain_text", text: "Tree Test" },
            value: "Tree Test",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    // Target participants
    {
      type: "input",
      block_id: "target_participants_block",
      label: {
        type: "plain_text",
        text: "Target participants",
      },
      hint: {
        type: "plain_text",
        text: "Who should participate, what diversity matters, any accessibility needs",
      },
      element: {
        type: "plain_text_input",
        action_id: "target_participants_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., 8-10 Veterans who use the mobile app, 50% using assistive technology",
        },
        multiline: true,
      },
    },
    // Participant count
    {
      type: "input",
      block_id: "num_participants_block",
      label: {
        type: "plain_text",
        text: "Number of participants",
      },
      element: {
        type: "static_select",
        action_id: "num_participants_select",
        placeholder: {
          type: "plain_text",
          text: "Select...",
        },
        options: [
          {
            text: { type: "plain_text", text: "5-6 participants" },
            value: "5-6",
          },
          {
            text: { type: "plain_text", text: "8-10 participants" },
            value: "8-10",
          },
          {
            text: { type: "plain_text", text: "12-15 participants" },
            value: "12-15",
          },
          {
            text: { type: "plain_text", text: "15+ participants" },
            value: "15+",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    // Start date (defaults to next Monday)
    {
      type: "input",
      block_id: "start_date_block",
      label: {
        type: "plain_text",
        text: "Start date",
      },
      hint: {
        type: "plain_text",
        text: "When planning begins. Defaults to next Monday.",
      },
      element: {
        type: "datepicker",
        action_id: "start_date_picker",
        initial_date: getNextMonday(),
        placeholder: {
          type: "plain_text",
          text: "Select a date",
        },
      },
    },
    // Timeline preference
    {
      type: "input",
      block_id: "timeline_block",
      label: {
        type: "plain_text",
        text: "Timeline",
      },
      element: {
        type: "radio_buttons",
        action_id: "timeline_radio",
        initial_option: {
          text: { type: "plain_text", text: "Standard (5 weeks)" },
          value: "standard",
        },
        options: [
          {
            text: { type: "plain_text", text: "Accelerated (2 weeks)" },
            value: "accelerated",
          },
          {
            text: { type: "plain_text", text: "Standard (5 weeks)" },
            value: "standard",
          },
          {
            text: { type: "plain_text", text: "Extended (8 weeks)" },
            value: "extended",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    // Lead researcher (auto-filled from study or Slack profile)
    {
      type: "input",
      block_id: "lead_researcher_block",
      label: {
        type: "plain_text",
        text: "Lead researcher",
      },
      hint: {
        type: "plain_text",
        text: "Auto-filled from your profile. Edit if needed.",
      },
      element: {
        type: "plain_text_input",
        action_id: "lead_researcher_input",
        initial_value: "{{lead_researcher}}",
      },
    },
  ],
};

module.exports = { researchPlanGeneratorModal };

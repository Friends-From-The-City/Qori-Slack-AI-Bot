/* eslint-disable max-len */
/* eslint-disable quotes */

/**
 * Research Brief Modal v5.0
 *
 * Lean modal: 7 required fields + study selector
 * Brief = approval gate. Plan = execution doc.
 */
const researchBriefModal = {
  type: "modal",
  callback_id: "research_brief_modal",
  title: {
    type: "plain_text",
    text: "Research Brief",
  },
  submit: {
    type: "plain_text",
    text: "Create Brief",
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
          text: "Define the research scope for stakeholder approval. Brief approved → plan elaborates.",
        },
      ],
    },
    {
      type: "divider",
    },
    // Study name - text input (study created on brief submission if it doesn't exist)
    {
      type: "input",
      block_id: "study_name_block",
      label: {
        type: "plain_text",
        text: "Study name *",
      },
      hint: {
        type: "plain_text",
        text: "Use kebab-case (e.g., va-mobile-nav-2026). Study folder will be created automatically.",
      },
      element: {
        type: "plain_text_input",
        action_id: "study_name_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., va-mobile-nav-2026",
        },
      },
    },
    // Stakeholder who requested
    {
      type: "input",
      block_id: "stakeholder_block",
      label: {
        type: "plain_text",
        text: "Requested by *",
      },
      hint: {
        type: "plain_text",
        text: "Stakeholder who will approve this brief",
      },
      element: {
        type: "plain_text_input",
        action_id: "stakeholder_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Sarah Chen, Product",
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
        text: "*Research Scope*",
      },
    },
    // Problem statement (was business_context)
    {
      type: "input",
      block_id: "problem_statement_block",
      label: {
        type: "plain_text",
        text: "Problem statement *",
      },
      hint: {
        type: "plain_text",
        text: "What problem are we solving? Include metrics if available.",
      },
      element: {
        type: "plain_text_input",
        action_id: "problem_statement_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., 45% task abandonment rate on claims status flow, 4.2/10 satisfaction...",
        },
        multiline: true,
      },
    },
    // What we'll learn (consolidates objectives + questions)
    {
      type: "input",
      block_id: "learning_objectives_block",
      label: {
        type: "plain_text",
        text: "What we'll learn *",
      },
      hint: {
        type: "plain_text",
        text: "4-6 bullets: what questions will this research answer?",
      },
      element: {
        type: "plain_text_input",
        action_id: "learning_objectives_input",
        placeholder: {
          type: "plain_text",
          text: "Where veterans expect to find X, How they categorize Y, Which pattern enables Z...",
        },
        multiline: true,
      },
    },
    // Out of scope
    {
      type: "input",
      block_id: "out_of_scope_block",
      label: {
        type: "plain_text",
        text: "Out of scope *",
      },
      hint: {
        type: "plain_text",
        text: "What this research will NOT cover",
      },
      element: {
        type: "plain_text_input",
        action_id: "out_of_scope_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Visual design, onboarding flow, web app...",
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
        text: "*Method & Timeline*",
      },
    },
    // Research method
    {
      type: "input",
      block_id: "research_method_block",
      label: {
        type: "plain_text",
        text: "Research method *",
      },
      element: {
        type: "static_select",
        action_id: "research_method_select",
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
            text: { type: "plain_text", text: "Contextual Inquiry" },
            value: "contextual_inquiry",
          },
          {
            text: { type: "plain_text", text: "Concept Testing" },
            value: "concept_testing",
          },
          {
            text: { type: "plain_text", text: "Survey Research" },
            value: "survey",
          },
          {
            text: { type: "plain_text", text: "Card Sorting" },
            value: "card_sorting",
          },
          {
            text: { type: "plain_text", text: "Tree Testing" },
            value: "tree_testing",
          },
          {
            text: { type: "plain_text", text: "Mixed Methods" },
            value: "mixed_methods",
          },
        ],
      },
    },
    // Why this method (rationale)
    {
      type: "input",
      block_id: "method_rationale_block",
      label: {
        type: "plain_text",
        text: "Why this method? *",
      },
      element: {
        type: "plain_text_input",
        action_id: "method_rationale_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Task-based observation lets us see where users get stuck in real time...",
        },
        multiline: true,
      },
    },
    // Timeline preference (same as research_plan)
    {
      type: "input",
      block_id: "timeline_block",
      label: {
        type: "plain_text",
        text: "Timeline *",
      },
      element: {
        type: "radio_buttons",
        action_id: "timeline_radio",
        options: [
          {
            text: { type: "plain_text", text: "Standard (5 weeks)" },
            value: "standard",
          },
          {
            text: { type: "plain_text", text: "Accelerated (2 weeks)" },
            value: "accelerated",
          },
          {
            text: { type: "plain_text", text: "Extended (8 weeks)" },
            value: "extended",
          },
        ],
      },
    },
    // Start date
    {
      type: "input",
      block_id: "start_date_block",
      label: {
        type: "plain_text",
        text: "Start date *",
      },
      element: {
        type: "datepicker",
        action_id: "start_date_picker",
        placeholder: {
          type: "plain_text",
          text: "Select start date",
        },
      },
    },
    // Decision deadline
    {
      type: "input",
      block_id: "decision_deadline_block",
      label: {
        type: "plain_text",
        text: "Decision deadline *",
      },
      hint: {
        type: "plain_text",
        text: "When do stakeholders need findings by?",
      },
      element: {
        type: "datepicker",
        action_id: "decision_deadline_picker",
        placeholder: {
          type: "plain_text",
          text: "Select deadline",
        },
      },
    },
    {
      type: "divider",
    },
    // Budget (optional)
    {
      type: "input",
      block_id: "budget_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Budget",
      },
      hint: {
        type: "plain_text",
        text: "Participant incentives, tooling, etc.",
      },
      element: {
        type: "plain_text_input",
        action_id: "budget_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., $800 participant incentives",
        },
      },
    },
  ],
};

module.exports = { researchBriefModal };

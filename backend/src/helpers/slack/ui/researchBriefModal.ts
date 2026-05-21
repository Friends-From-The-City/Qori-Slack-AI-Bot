/**
 * Research Brief Modal v5.2
 *
 * Brief = approval gate. Collects everything stakeholders need to approve.
 * Plan consumes brief outputs via cascade — no overlap.
 *
 * v5.2: Conversational labels per modal design principles. Manual asterisks
 * removed (Slack's required indicator handles this). Section headers stay formal.
 * v5.1: Stakeholder field converted to users_select (PR #157).
 */
export const researchBriefModal = {
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
          text: "Define the research scope for stakeholder approval. Once approved, the research plan will elaborate the execution details.",
        },
      ],
    },
    {
      type: "divider",
    },
    // Study name
    {
      type: "input",
      block_id: "study_name_block",
      label: {
        type: "plain_text",
        text: "What's the study called?",
      },
      hint: {
        type: "plain_text",
        text: "Use kebab-case (e.g., va-mobile-nav-2026). Study folder created automatically.",
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
    // Stakeholder (users_select — captures Slack user ID for approval routing)
    {
      type: "input",
      block_id: "stakeholder_block",
      label: {
        type: "plain_text",
        text: "Who's requesting this research?",
      },
      hint: {
        type: "plain_text",
        text: "Stakeholder who will approve this brief",
      },
      element: {
        type: "users_select",
        action_id: "stakeholder_select",
        placeholder: {
          type: "plain_text",
          text: "Select stakeholder...",
        },
      },
    },
    {
      type: "divider",
    },
    // Discovery context — populated dynamically by buildBriefEntryModal
    {
      type: "section",
      block_id: "discovery_header_block",
      text: {
        type: "mrkdwn",
        text: "*Discovery to inform this brief*",
      },
    },
    {
      type: "context",
      block_id: "discovery_status_block",
      elements: [
        {
          type: "mrkdwn",
          text: "Loading discovery artifacts...",
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
        text: "*Research Scope*",
      },
    },
    // Problem statement
    {
      type: "input",
      block_id: "problem_statement_block",
      label: {
        type: "plain_text",
        text: "What problem are you solving?",
      },
      hint: {
        type: "plain_text",
        text: "Include metrics if available.",
      },
      element: {
        type: "plain_text_input",
        action_id: "problem_statement_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., 45% task abandonment rate, 4.2/10 satisfaction...",
        },
        multiline: true,
      },
    },
    // What we'll learn
    {
      type: "input",
      block_id: "learning_objectives_block",
      label: {
        type: "plain_text",
        text: "What will this research answer?",
      },
      hint: {
        type: "plain_text",
        text: "3-5 bullets: the questions this study will resolve",
      },
      element: {
        type: "plain_text_input",
        action_id: "learning_objectives_input",
        placeholder: {
          type: "plain_text",
          text: "Where veterans expect to find X, How they categorize Y...",
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
        text: "What's out of scope?",
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
        text: "*Method & Participants*",
      },
    },
    // Research method
    {
      type: "input",
      block_id: "research_method_block",
      label: {
        type: "plain_text",
        text: "What method fits best?",
      },
      element: {
        type: "static_select",
        action_id: "research_method_select",
        placeholder: {
          type: "plain_text",
          text: "Select method...",
        },
        options: [
          { text: { type: "plain_text", text: "Usability Testing" }, value: "usability_testing" },
          { text: { type: "plain_text", text: "User Interviews" }, value: "user_interviews" },
          { text: { type: "plain_text", text: "Contextual Inquiry" }, value: "contextual_inquiry" },
          { text: { type: "plain_text", text: "Concept Testing" }, value: "concept_testing" },
          { text: { type: "plain_text", text: "Survey Research" }, value: "survey" },
          { text: { type: "plain_text", text: "Card Sorting" }, value: "card_sorting" },
          { text: { type: "plain_text", text: "Tree Testing" }, value: "tree_testing" },
          { text: { type: "plain_text", text: "Mixed Methods" }, value: "mixed_methods" },
        ],
      },
    },
    // Method override — for combined/custom approaches not in dropdown
    {
      type: "input",
      block_id: "method_override_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Or specify custom method (e.g., combined approaches)",
      },
      element: {
        type: "plain_text_input",
        action_id: "method_override_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Card sorting + tree testing",
        },
      },
    },
    // Participants
    {
      type: "input",
      block_id: "participant_approach_block",
      label: {
        type: "plain_text",
        text: "Who are you researching with?",
      },
      hint: {
        type: "plain_text",
        text: "How many, and key composition requirements",
      },
      element: {
        type: "plain_text_input",
        action_id: "participant_approach_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., 8 Veterans, 50% using assistive technology, mix of iOS/Android",
        },
        multiline: true,
      },
    },
    // Recruitment sources
    {
      type: "input",
      block_id: "recruitment_sources_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Recruitment sources",
      },
      hint: {
        type: "plain_text",
        text: "Where will participants be recruited from?",
      },
      element: {
        type: "plain_text_input",
        action_id: "recruitment_sources_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., Perigean Recruiting, VA Section 508 Office, MHV coordinators",
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
        text: "*Timeline & Budget*",
      },
    },
    // Start date
    {
      type: "input",
      block_id: "start_date_block",
      label: {
        type: "plain_text",
        text: "When does research start?",
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
        text: "When do stakeholders need findings?",
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

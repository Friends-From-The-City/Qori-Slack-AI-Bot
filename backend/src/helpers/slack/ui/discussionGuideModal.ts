/**
 * Discussion Guide Modal v2.0
 *
 * v2.0: Cascade-driven redesign per modal design principles.
 * - Study name → non-editable context block (handler reads from private_metadata)
 * - Research focus and questions pre-filled from cascade by opener
 * - Methodology pre-selected from cascade by opener
 * - tree_test → tree_testing (matches brief enum)
 * - Conversational labels
 * - Cascade gate (opener hides form when required vars missing)
 *
 * v1.0: Lead moderator converted to users_select (PR #157)
 */

/** Block ID for the study name context display. Used by opener to inject study name. */
export const DG_STUDY_DISPLAY_BLOCK_ID = 'dg_study_display_block';

/**
 * Reverse mapping: brief methodology label → select option value.
 * Brief stores the label string (e.g., "Moderated usability testing") in cascade.
 * This map converts it back to the select enum value for pre-selection.
 *
 * If the cascade value doesn't match any key, the select stays unset
 * (custom method override or survey — no DG option for those).
 */
export const METHODOLOGY_LABEL_TO_VALUE: Record<string, string> = {
  'Moderated usability testing': 'usability_testing',
  'User interviews': 'user_interviews',
  'Contextual inquiry': 'contextual_inquiry',
  'Concept testing': 'concept_testing',
  'Card sorting': 'card_sorting',
  'Tree testing': 'tree_testing',
  'Mixed methods': 'mixed_methods',
  // Also handle raw enum values (in case extraction returns the value, not the label)
  'usability_testing': 'usability_testing',
  'user_interviews': 'user_interviews',
  'contextual_inquiry': 'contextual_inquiry',
  'concept_testing': 'concept_testing',
  'card_sorting': 'card_sorting',
  'tree_testing': 'tree_testing',
  'mixed_methods': 'mixed_methods',
};

/** Select option value → display text for building initial_option. */
export const METHODOLOGY_VALUE_TO_TEXT: Record<string, string> = {
  usability_testing: 'Usability Testing',
  user_interviews: 'User Interviews',
  card_sorting: 'Card Sorting',
  concept_testing: 'Concept Testing',
  contextual_inquiry: 'Contextual Inquiry',
  tree_testing: 'Tree Testing',
  mixed_methods: 'Mixed Methods',
};

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
    // Study name — non-editable display, set by opener
    {
      type: "context",
      block_id: DG_STUDY_DISPLAY_BLOCK_ID,
      elements: [
        {
          type: "mrkdwn",
          text: "*{{study_name}}*\nBuilding a session guide from your approved brief.",
        },
      ],
    },
    {
      type: "divider",
    },
    // Research focus (pre-filled from cascade objectives by opener)
    {
      type: "input",
      block_id: "research_focus_block",
      label: {
        type: "plain_text",
        text: "What should this session focus on?",
      },
      hint: {
        type: "plain_text",
        text: "Pre-filled from your brief — refine for this session",
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
    // Research questions (pre-filled from cascade by opener)
    {
      type: "input",
      block_id: "research_questions_block",
      label: {
        type: "plain_text",
        text: "Which questions should this session answer?",
      },
      hint: {
        type: "plain_text",
        text: "Pre-filled from your brief — remove any not relevant to this session",
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
    // Methodology (pre-selected from cascade by opener)
    {
      type: "input",
      block_id: "research_method_block",
      label: {
        type: "plain_text",
        text: "How are you running this session?",
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
    // Session length
    {
      type: "input",
      block_id: "session_length_block",
      label: {
        type: "plain_text",
        text: "How long is each session?",
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
            text: { type: "plain_text", text: "75 minutes" },
            value: "75",
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
          { text: { type: "plain_text", text: "1" }, value: "1" },
          { text: { type: "plain_text", text: "2" }, value: "2" },
          { text: { type: "plain_text", text: "3" }, value: "3" },
          { text: { type: "plain_text", text: "4" }, value: "4" },
          { text: { type: "plain_text", text: "5" }, value: "5" },
          { text: { type: "plain_text", text: "6" }, value: "6" },
          { text: { type: "plain_text", text: "7" }, value: "7" },
        ],
      },
    },
    {
      type: "divider",
    },
    // Lead moderator (users_select — defaults to opener)
    {
      type: "input",
      block_id: "lead_moderator_block",
      label: {
        type: "plain_text",
        text: "Lead moderator",
      },
      hint: {
        type: "plain_text",
        text: "Auto-filled with you — change if someone else is moderating",
      },
      element: {
        type: "users_select",
        action_id: "lead_moderator_select",
        placeholder: {
          type: "plain_text",
          text: "Select moderator...",
        },
      },
    },
  ],
};

export { discussionGuideModal };

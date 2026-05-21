/**
 * Research Plan Modal v6.0
 *
 * Plan = execution doc. Consumes scope from brief via cascade.
 * Only asks for operational details the brief doesn't cover.
 *
 * v6.1: Lead researcher changed from plain_text_input to users_select.
 * Captures Slack user ID; handler resolves display name at generation time.
 *
 * v6.0: Conversational copy per modal design principles. Study name
 * moved to non-editable context block (set by planModalOpener).
 * Removed section header for single-field group. Lead researcher
 * and operational risks are the only inputs.
 *
 * v5.0: Removed recruitment_source_block (now cascade from brief),
 * note_taker_block and observer_block (dead fields — plan v7.0
 * doesn't render a team section; observers managed via /qori-fieldwork).
 */

/** Block ID for the study name context display. Used by planModalOpener to inject the study name. */
export const STUDY_DISPLAY_BLOCK_ID = 'study_display_block';

export const researchPlanGeneratorModal = {
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
    // Study name — non-editable display, set by planModalOpener
    {
      type: "context",
      block_id: STUDY_DISPLAY_BLOCK_ID,
      elements: [
        {
          type: "mrkdwn",
          text: ":clipboard: *{{study_name}}*\nGenerating an execution plan from your approved brief.",
        },
      ],
    },
    {
      type: "divider",
    },
    // Lead researcher (users_select — defaults to opener, workspace-wide)
    {
      type: "input",
      block_id: "lead_researcher_block",
      label: {
        type: "plain_text",
        text: "Who's leading this study?",
      },
      hint: {
        type: "plain_text",
        text: "Auto-filled with you — change if someone else is leading",
      },
      element: {
        type: "users_select",
        action_id: "lead_researcher_select",
        placeholder: {
          type: "plain_text",
          text: "Select a researcher...",
        },
      },
    },
    {
      type: "divider",
    },
    // Operational risks (optional)
    {
      type: "input",
      block_id: "operational_risks_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Anything that could go wrong?",
      },
      hint: {
        type: "plain_text",
        text: "Operational risks you know about — scope risks are already captured in the brief",
      },
      element: {
        type: "plain_text_input",
        action_id: "operational_risks_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., AT users take 2x longer to recruit, key team member out in June",
        },
        multiline: true,
      },
    },
  ],
};

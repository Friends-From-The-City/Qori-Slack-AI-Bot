/**
 * Research Plan Modal v5.0
 *
 * Plan = execution doc. Consumes scope from brief via cascade.
 * Only asks for operational details the brief doesn't cover.
 *
 * v5.0: Removed recruitment_source_block (now cascade from brief),
 * note_taker_block and observer_block (dead fields — plan v7.0
 * doesn't render a team section; observers managed via /qori-fieldwork).
 */
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
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Execution plan for an approved brief. Scope, method, participants, recruitment, and timeline come from the cascade.",
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
    {
      type: "divider",
    },
    // Lead researcher (auto-filled)
    {
      type: "input",
      block_id: "lead_researcher_block",
      label: {
        type: "plain_text",
        text: "Lead researcher",
      },
      hint: {
        type: "plain_text",
        text: "Auto-filled from your profile",
      },
      element: {
        type: "plain_text_input",
        action_id: "lead_researcher_input",
        initial_value: "{{lead_researcher}}",
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Execution Risks*",
      },
    },
    // Operational risks
    {
      type: "input",
      block_id: "operational_risks_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Operational risks",
      },
      hint: {
        type: "plain_text",
        text: "Execution-specific risks (not scope risks — those are in the brief)",
      },
      element: {
        type: "plain_text_input",
        action_id: "operational_risks_input",
        placeholder: {
          type: "plain_text",
          text: "e.g., AT user recruitment takes 2x longer, need backup participants",
        },
        multiline: true,
      },
    },
  ],
};

/**
 * Discovery hub modal — entry point for /qori-discover.
 *
 * Sections-with-accessories pattern (matches /qori-plan hub).
 * No input blocks → no submit button required.
 * Artifact list is injected dynamically by the command handler.
 */

/** Block IDs used by the command handler to inject dynamic content. */
export const DISCOVERY_ARTIFACTS_BLOCK_ID = 'discovery_artifacts_block';

export const discoverHubModal = {
  type: "modal",
  callback_id: "discover_hub_modal",
  title: {
    type: "plain_text",
    text: "Discovery research",
  },
  close: {
    type: "plain_text",
    text: "Close",
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Pre-study research that informs your brief. Upload documents and Qori synthesizes themes, barriers, and recommendations.",
        },
      ],
    },
    {
      type: "divider",
    },
    // Discovery type actions
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":page_facing_up: *Desk research*\nReports, competitive analysis, background docs",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open",
        },
        action_id: "discover_desk_research",
        value: "desk_research",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":studio_microphone: *Stakeholder synthesis*\nInterview transcripts and stakeholder notes",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open",
        },
        action_id: "discover_stakeholder_synthesis",
        value: "stakeholder_synthesis",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":bar_chart: *Survey synthesis*\nSurvey exports (CSV, Excel)",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open",
        },
        action_id: "discover_survey_synthesis",
        value: "survey_synthesis",
      },
    },
    {
      type: "divider",
    },
    // Discovery visibility — replaced dynamically by command handler
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Your team's discovery so far*",
      },
    },
    {
      type: "context",
      block_id: DISCOVERY_ARTIFACTS_BLOCK_ID,
      elements: [
        {
          type: "mrkdwn",
          text: "_No discovery research yet. Start with desk research to build your team's knowledge base._",
        },
      ],
    },
  ],
};

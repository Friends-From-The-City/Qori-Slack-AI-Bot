/* eslint-disable max-len */
/* eslint-disable quotes */

// Modal builder for /qori-plan command
function studySetupModalPlanStudy(studies, channelId) {
  const studyOptions = studies && studies.length > 0
    ? studies.map((s) => ({
        text: { type: "plain_text", text: s.name.substring(0, 75) },
        value: String(s.id),
      }))
    : [{ text: { type: "plain_text", text: "No studies yet — use /qori-brief" }, value: "none" }];

  return {
    type: "modal",
    callback_id: "plan_study_modal",
    private_metadata: JSON.stringify({ channel_id: channelId }),
    title: {
      type: "plain_text",
      text: "Plan your study",
    },
    submit: {
      type: "plain_text",
      text: "Done",
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
            text: "Select a study, then create documents or upload files. Start a new study with `/qori-brief`.",
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "study_selection",
        label: {
          type: "plain_text",
          text: "Study",
        },
        element: {
          type: "static_select",
          action_id: "study_select",
          placeholder: {
            type: "plain_text",
            text: "Select a study...",
          },
          options: studyOptions,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Create Documents*",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Research plan*\nTimeline, logistics, and session design",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Create",
          },
          action_id: "create_research_plan",
          value: "research_plan",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Discussion guide*\nConversation guide for user research sessions",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Create",
          },
          action_id: "create_discussion_guide",
          value: "discussion_guide",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Stakeholder interview guide*\nQuestions for PMs, engineers, policy SMEs",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Create",
          },
          action_id: "create_stakeholder_guide",
          value: "stakeholder_guide",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Upload Files*",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Desk research*\nReports, competitive analysis, background docs",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Upload",
          },
          action_id: "upload_desk_research",
          value: "desk_research",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Stakeholder notes*\nTranscripts from internal interviews",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Upload",
          },
          action_id: "upload_stakeholder_notes",
          value: "stakeholder_notes",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Survey data*\nSurvey exports (CSV, Excel) for synthesis",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Upload",
          },
          action_id: "upload_survey_data",
          value: "survey_data",
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Upload stakeholder notes to unlock Service Blueprint analysis.",
          },
        ],
      },
    ],
  };
}

// Aliases for backward compatibility
const studySetupModalStartResearch = studySetupModalPlanStudy;
const studySetupModal = studySetupModalStartResearch;

module.exports = { studySetupModal, studySetupModalPlanStudy, studySetupModalStartResearch };

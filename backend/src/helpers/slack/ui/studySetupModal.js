/* eslint-disable max-len */
/* eslint-disable quotes */

// Modal for /plan-study command
const studySetupModalPlanStudy = {
  type: "modal",
  callback_id: "plan_study_modal",
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
    // ─── START A NEW STUDY ───
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Start a new study*",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "The brief is the first step. It defines scope for stakeholder approval and creates the study folder automatically.",
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Research brief*\nDefine scope, objectives, and methodology for approval",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Create",
        },
        style: "primary",
        action_id: "create_research_brief",
        value: "research_brief",
      },
    },
    {
      type: "divider",
    },

    // ─── CONTINUE AN EXISTING STUDY ───
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Continue an existing study*",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Select a study to create planning documents or upload files.",
        },
      ],
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
        options: [
          {
            text: {
              type: "plain_text",
              text: "Loading studies...",
            },
            value: "loading",
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

// Modal for /start-research command (post-study-creation)
const studySetupModalStartResearch = studySetupModalPlanStudy;

// Keep the original for backward compatibility
const studySetupModal = studySetupModalStartResearch;

module.exports = { studySetupModal, studySetupModalPlanStudy, studySetupModalStartResearch };

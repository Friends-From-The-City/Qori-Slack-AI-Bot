/* eslint-disable max-len */
/* eslint-disable quotes */

/**
 * Discovery modal for /qori-discover command.
 * Single modal with discovery type selector — no study scope.
 * Discovery is pre-study work that informs briefs and accumulates
 * as organizational memory across studies.
 */
const discoverModal = {
  type: "modal",
  callback_id: "discover_modal",
  title: {
    type: "plain_text",
    text: "Discovery research",
  },
  submit: {
    type: "plain_text",
    text: "Analyze",
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
          text: "Pre-study discovery research. Upload documents for analysis — results are stored in the _discovery/ workspace, not tied to a specific study.",
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
        text: "*Discovery type*",
      },
    },
    {
      type: "input",
      block_id: "discovery_type_block",
      label: {
        type: "plain_text",
        text: "What kind of discovery?",
      },
      element: {
        type: "static_select",
        action_id: "discovery_type",
        placeholder: {
          type: "plain_text",
          text: "Select discovery type...",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "Desk research",
            },
            value: "desk_research",
          },
          {
            text: {
              type: "plain_text",
              text: "Stakeholder interviews",
            },
            value: "stakeholder_synthesis",
          },
          {
            text: {
              type: "plain_text",
              text: "Survey synthesis",
            },
            value: "survey_synthesis",
          },
        ],
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "topic_block",
      label: {
        type: "plain_text",
        text: "Topic",
      },
      hint: {
        type: "plain_text",
        text: "Used as the artifact name and filename slug (e.g., \"veteran telehealth barriers\")",
      },
      element: {
        type: "plain_text_input",
        action_id: "topic",
        placeholder: {
          type: "plain_text",
          text: "e.g., Veteran telehealth adoption barriers",
        },
      },
    },
    {
      type: "input",
      block_id: "description_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Description",
      },
      element: {
        type: "plain_text_input",
        action_id: "description",
        placeholder: {
          type: "plain_text",
          text: "Optional context about the uploaded documents",
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
        text: "*Documents*",
      },
    },
    {
      type: "input",
      block_id: "file_upload_block",
      label: {
        type: "plain_text",
        text: "Upload files",
      },
      hint: {
        type: "plain_text",
        text: "Desk research: PDF, DOCX, TXT, MD. Stakeholder: PDF, DOCX, TXT, MD. Survey: CSV, XLSX, XLS.",
      },
      element: {
        type: "file_input",
        action_id: "file_upload",
        filetypes: ["pdf", "docx", "doc", "txt", "md", "csv", "xlsx", "xls"],
        max_files: 10,
      },
    },
    {
      type: "input",
      block_id: "survey_name_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Survey name (survey only, required)",
      },
      element: {
        type: "plain_text_input",
        action_id: "survey_name",
        placeholder: {
          type: "plain_text",
          text: "e.g., Post-launch satisfaction survey",
        },
      },
    },
    {
      type: "input",
      block_id: "question_focus_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Questions to focus on (survey only)",
      },
      element: {
        type: "plain_text_input",
        action_id: "question_focus",
        placeholder: {
          type: "plain_text",
          text: "e.g., Q5: What was most frustrating? Q8: Any other feedback?",
        },
        multiline: true,
      },
    },
  ],
};

module.exports = { discoverModal };

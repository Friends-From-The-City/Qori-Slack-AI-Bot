/* eslint-disable max-len */
/* eslint-disable quotes */

export const uploadDeskResearchModal = {
  type: "modal",
  callback_id: "upload_desk_research_modal",
  title: {
    type: "plain_text",
    text: "Desk research",
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
          text: "Upload PDFs, Word docs, or reports for analysis. Qori will extract key insights and generate a synthesis with themes and recommendations.",
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
        text: "*📂 Study*",
      },
    },
    {
      type: "input",
      block_id: "study_select_block",
      label: {
        type: "plain_text",
        text: "Select a study:",
      },
      element: {
        type: "static_select",
        action_id: "selected_study",
        placeholder: {
          type: "plain_text",
          text: "Select a study...",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "{{study_1_name}}",
            },
            value: "{{study_1_id}}",
          },
          {
            text: {
              type: "plain_text",
              text: "{{study_2_name}}",
            },
            value: "{{study_2_id}}",
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
        text: "*📎 Documents*",
      },
    },
    {
      type: "input",
      block_id: "file_upload_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Upload files",
      },
      element: {
        type: "file_input",
        action_id: "file_upload",
        filetypes: ["pdf", "docx", "doc", "txt", "md"],
        max_files: 10,
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
          text: "e.g., Competitive analysis from Q3, industry reports on telehealth",
        },
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "research_focus_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Research focus",
      },
      hint: {
        type: "plain_text",
        text: "Optional — helps tailor the analysis. Defaults to study context.",
      },
      element: {
        type: "plain_text_input",
        action_id: "research_topic",
        placeholder: {
          type: "plain_text",
          text: "e.g., Veteran telehealth adoption barriers",
        },
      },
    },
  ],
};

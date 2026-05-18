/* eslint-disable max-len */
/* eslint-disable quotes */

export const uploadSurveyDataModal = {
  type: "modal",
  callback_id: "upload_survey_data_modal",
  title: {
    type: "plain_text",
    text: "Survey data",
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
          text: "Upload survey exports for analysis. Qori will identify themes, count frequency, and generate actionable insights.",
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
      type: "actions",
      block_id: "study_select_block",
      elements: [
        {
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
      ],
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📊 Survey info*",
      },
    },
    {
      type: "input",
      block_id: "survey_name_block",
      label: {
        type: "plain_text",
        text: "Survey name *",
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
        text: "Questions to focus on",
      },
      hint: {
        type: "plain_text",
        text: "Specify open-ended questions to prioritize. Leave blank to analyze all text responses.",
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
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📎 Survey files*",
      },
    },
    {
      type: "input",
      block_id: "file_upload_block",
      label: {
        type: "plain_text",
        text: "Upload files *",
      },
      hint: {
        type: "plain_text",
        text: "Supported formats: CSV, XLSX, XLS",
      },
      element: {
        type: "file_input",
        action_id: "file_upload",
        filetypes: ["csv", "xlsx", "xls"],
        max_files: 5,
      },
    },
  ],
};

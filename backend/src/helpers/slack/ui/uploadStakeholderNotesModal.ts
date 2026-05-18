/* eslint-disable max-len */
/* eslint-disable quotes */

export const uploadStakeholderNotesModal = {
  type: "modal",
  callback_id: "upload_stakeholder_notes_modal",
  title: {
    type: "plain_text",
    text: "Stakeholder notes",
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
          text: "Upload stakeholder interview transcripts or notes. Qori will synthesize themes, constraints, and backstage processes for service blueprint analysis.",
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
        text: "*📎 Interview transcripts or notes*",
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
        text: "Supported: PDF, DOCX, TXT, MD, VTT (Otter, Fireflies, etc.)",
      },
      element: {
        type: "file_input",
        action_id: "file_upload",
        filetypes: ["pdf", "docx", "doc", "txt", "md"],
        max_files: 10,
      },
    },
  ],
};

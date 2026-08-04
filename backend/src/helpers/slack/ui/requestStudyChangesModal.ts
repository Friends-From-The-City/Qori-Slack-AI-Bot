import { generateFileCheckboxOptions } from "../../generateFileCheckboxOptions";

interface FileOption {
  label: string;
  key: string;
}

export const requestStudyChangesModal = (fileOptionsArray: FileOption[]) => ({
  type: "modal",
  callback_id: "request_changes_plan_modal",
  title: {
    type: "plain_text",
    text: "Request Study Changes",
  },
  submit: {
    type: "plain_text",
    text: "Submit Request",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Request Changes*\nPlease provide specific feedback about what needs to be changed.",
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "change_feedback_block",
      element: {
        type: "plain_text_input",
        multiline: true,
        action_id: "change_feedback",
        placeholder: {
          type: "plain_text",
          text: "e.g., The hypothesis section is too vague – please clarify the user goals and expected outcomes...",
        },
      },
      label: {
        type: "plain_text",
        text: "What needs to be changed?",
      },
    },
    {
      type: "input",
      optional: true,
      block_id: "files_to_update_block",
      element: {
        type: "checkboxes",
        action_id: "files_to_update",
        options: generateFileCheckboxOptions(fileOptionsArray),
      },
      label: {
        type: "plain_text",
        text: "Which files need updates?",
      },
    },
    {
      type: "input",
      block_id: "priority_level_block",
      element: {
        type: "radio_buttons",
        action_id: "priority_level",
        options: [
          {
            text: {
              type: "mrkdwn",
              text: "🔴 *Blocking* – Must fix before approval",
            },
            value: "blocking",
          },
          {
            text: {
              type: "mrkdwn",
              text: "🟡 *Important* – Should fix for better quality",
            },
            value: "important",
          },
          {
            text: {
              type: "mrkdwn",
              text: "🟢 *Suggestion* – Nice to have improvement",
            },
            value: "suggestion",
          },
        ],
      },
      label: {
        type: "plain_text",
        text: "Priority level",
      },
    },
    {
      type: "input",
      optional: true,
      block_id: "deadline_block",
      element: {
        type: "datepicker",
        action_id: "deadline",
        placeholder: {
          type: "plain_text",
          text: "mm/dd/yyyy",
        },
      },
      label: {
        type: "plain_text",
        text: "Deadline for changes",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "*Tip:* Be specific about what needs changing. The researcher will receive your feedback and can ask questions if needed.",
        },
      ],
    },
  ],
});

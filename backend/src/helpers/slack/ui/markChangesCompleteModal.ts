/* eslint-disable max-len */
/* eslint-disable quotes */

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the mark_changes_complete_modal. */
export interface MarkChangesCompleteMetadata {
  fileName: string;
  filePath: string;
  statusId: string | number;
}

const markChangesCompleteModal = (fileName: string, filePath: string, statusId: string | number, requestedBy: string | null = null) => ({
  type: "modal",
  callback_id: "mark_changes_complete_modal",
  private_metadata: JSON.stringify({ fileName, filePath, statusId } satisfies MarkChangesCompleteMetadata),
  title: {
    type: "plain_text",
    text: "✅ Mark Changes Complete",
  },
  submit: {
    type: "plain_text",
    text: "Send Notification",
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
        text: "*What changes did you make?*",
      },
    },
    {
      type: "input",
      block_id: "changes_made_block",
      element: {
        type: "plain_text_input",
        multiline: true,
        action_id: "changes_made",
        placeholder: {
          type: "plain_text",
          text: "e.g., Updated hypothesis section with specific user goals: 1) Veterans can find benefits within 3 clicks, 2) 25% completion rate...",
        },
      },
      label: {
        type: "plain_text",
        text: "Describe the changes you made",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🐛 *GitHub:* ${fileName}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${filePath}|:github: View on GitHub>`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: requestedBy ? `☑️ Notify ${requestedBy} changes are complete` : '☑️ Notify the user who requested changes',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '☑️ Include link to view updated files',
      },
    },
    {
      type: "divider",
    },
  ],
});

export { markChangesCompleteModal };

import type { View } from '@slack/types';

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the email-preview modal. */
export interface EmailPreviewModalMetadata {
  messageBody: string;
}

interface EmailModalParams {
  participantName?: string;
  researcherName?: string;
  researcherEmail?: string;
  studyName?: string;
  tone?: string;
  subject?: string;
  messageBody?: string;
  filePath?: string;
  fileUrl?: string;
}

export const emailModal = (params: EmailModalParams = {}) => {
  const {
    participantName = "Participant",
    researcherName = "Jordan (UX Researcher)",
    researcherEmail = "jordan.researcher@va.gov",
    studyName = "VA Housing Application Research",
    tone = "Friendly",
    subject = `Research Opportunity: ${studyName} - Your Input Needed`,
    messageBody = "",
    filePath = "03-fieldwork/outreach/",
    fileUrl = "",
  } = params;

  return ({
    type: "modal",
    callback_id: "email-preview",
    title: {
      type: "plain_text",
      text: "Generated Email",
      emoji: true,
    },
    close: {
      type: "plain_text",
      text: "Close",
    },
    private_metadata: JSON.stringify({ messageBody } satisfies EmailPreviewModalMetadata),
    blocks: [
      // {
      //   type: "section",
      //   text: {
      //     type: "mrkdwn",
      //     text: `*Generated for:* ${participantName} · *Email - ${tone} tone*\n*Study:* ${studyName}\n*Saved to:* \`${filePath}\``,
      //   },
      // },
      // {
      //   type: "divider",
      // },
      // {
      //   type: "section",
      //   text: {
      //     type: "mrkdwn",
      //     text: `*${subject}*`,
      //   },
      // },
      // {
      //   type: "context",
      //   elements: [
      //     {
      //       type: "mrkdwn",
      //       text: `*To:* ${participantName} · *From:* ${researcherName} \`<${researcherEmail}>\``,
      //     },
      //   ],
      // },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: (messageBody || "_No message body provided._").replace(/\*\*(.+?)\*\*/g, '*$1*'),
        },
      },
      {
        type: "divider",
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Copy Email (Formatted)",
            },
            action_id: "copy_email_formatted",
            style: "primary",
          },
          // {
          //   type: "button",
          //   text: {
          //     type: "plain_text",
          //     text: "📋 Copy Subject Only",
          //   },
          //   action_id: "copy_subject",
          // },
          // {
          //   type: "button",
          //   text: {
          //     type: "plain_text",
          //     text: "🔗 View in GitHub",
          //   },
          //   action_id: "view_in_github",
          //   url: fileUrl, // Replace with actual repo
          // },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${fileUrl}|View on GitHub>`,
          },
        ],
      },
    ],
  }) as unknown as View;
};

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
    filePath = "02-participants/outreach/alex_m_initial_recruitment_2025-07-16.md",
    fileUrl = "https://github.com/your-org/your-repo/blob/main/02-participants/outreach/alex_m_initial_recruitment_2025-07-16.md",
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
              text: "📄 Copy Email (Formatted)",
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
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${fileUrl}|:github: View on GitHub>`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Generate for Another Participant*",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Saved to \`${filePath}\``,
          },
        ],
      },
      {
        type: "section",
        block_id: "message_type_buttons",
        text: {
          type: "mrkdwn",
          text: "*Generate other message types:*",
        },
        accessory: {
          type: "overflow",
          action_id: "generate_other_message_type",
          options: [
            {
              text: {
                type: "plain_text",
                text: "Session Confirmation",
              },
              value: "session_confirmation",
            },
            {
              text: {
                type: "plain_text",
                text: "Session Reminder",
              },
              value: "session_reminder",
            },
            {
              text: {
                type: "plain_text",
                text: "Rescheduling Request",
              },
              value: "rescheduling_request",
            },
            {
              text: {
                type: "plain_text",
                text: "Follow-up",
              },
              value: "follow_up",
            },
            {
              text: {
                type: "plain_text",
                text: "Thank You",
              },
              value: "thank_you",
            },
          ],
        },
      },
    ],
  }) as unknown as View;
};

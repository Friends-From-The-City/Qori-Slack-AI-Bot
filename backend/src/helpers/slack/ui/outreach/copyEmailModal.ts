interface CopyEmailParams {
  messageBody?: string;
}

export const copyEmailModal = (params: CopyEmailParams = {}) => {
  const {
    messageBody = "",
  } = params;

  return {
    type: "modal",
    callback_id: "copy-email-modal",
    title: {
      type: "plain_text",
      text: "Copy Email Content",
      emoji: true,
    },
    close: {
      type: "plain_text",
      text: "Close",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Email Message Body*\nClick the text below and press Ctrl+A (or Cmd+A) to select all, then Ctrl+C (or Cmd+C) to copy.",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "```\n" + (messageBody || "_No message body provided._") + "\n```",
        },
      },
    ],
  };
};

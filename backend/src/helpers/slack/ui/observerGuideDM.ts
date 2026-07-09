/**
 * Shared observer guide DM — sent to observers regardless of how they were added
 * (curated by researcher, self-join via channel CTA, or legacy approval flow).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackClient = { chat: { postMessage: (args: any) => Promise<any> } };

// Observer guidelines now live in qori-studies/_content/ (Phase B-0.5)
const OBSERVER_GUIDELINES_URL = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/blob/main/_content/observer-guidelines.md`;

/**
 * Send the observer guide DM to a user.
 */
export const sendObserverGuideDM = async (
  client: SlackClient,
  userId: string,
  studyName: string,
  githubUrl?: string,
) => {
  const headerText = `You've been added as an observer for *${studyName}*.`;

  const blocks: Record<string, unknown>[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headerText,
      },
    },
  ];

  if (githubUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${githubUrl}|View Participant Tracker on GitHub>`,
      },
    });
  }

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${OBSERVER_GUIDELINES_URL}|:book: View Observer Guidelines>`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*To upload notes during the session, use:* `/qori-fieldnotes` → Upload notes',
      },
    },
  );

  await client.chat.postMessage({
    channel: userId,
    text: headerText,
    blocks,
  });
};

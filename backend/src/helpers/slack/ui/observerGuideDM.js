/**
 * Shared observer guide DM — sent to observers regardless of how they were added
 * (curated by researcher, self-join via channel CTA, or legacy approval flow).
 */

const OBSERVER_GUIDELINES_URL =
  'https://github.com/friends-innovation-lab/qori-slack/blob/main/config/templates/primary-research/03-fieldwork/observer_guidelines.md';

/**
 * Send the observer guide DM to a user.
 *
 * @param {object} client - Slack WebClient
 * @param {string} userId - Slack user ID to DM
 * @param {string} studyName - Display name of the study
 * @param {string} [githubUrl] - Optional link to participant tracker on GitHub
 */
const sendObserverGuideDM = async (client, userId, studyName, githubUrl) => {
  const headerText = `You've been added as an observer for *${studyName}*.`;

  const blocks = [
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
        text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
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
        text: '*To take notes during the session, use this command:* `/take-notes`',
      },
    },
  );

  await client.chat.postMessage({
    channel: userId,
    text: headerText,
    blocks,
  });
};

module.exports = { sendObserverGuideDM };

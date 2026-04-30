const { getResearchStudyWithRoles } = require('../../../services/research_study.service');

// Generic function to generate study result blocks with action buttons
const generateStudyResultBlocks = (studyName, study, url, channelId, documentType) => {
  const actionButtons = {
    plan: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve Plan' },
        style: 'primary',
        action_id: 'approve_plan',
        value: JSON.stringify({ studyName, channelId, url }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Request Plan Changes' },
        style: 'danger',
        action_id: 'request_changes_plan',
        value: JSON.stringify({ studyName, channelId, url }),
      },
    ],
    brief: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve' },
        style: 'primary',
        action_id: 'approve_brief',
        // Note: briefData removed from value to avoid exceeding Slack's 2000 char limit
        // The approval handler has fallback logic using studyName + url
        value: JSON.stringify({ studyName, channelId, url }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Request Changes' },
        style: 'danger',
        action_id: 'request_changes_brief',
        value: JSON.stringify({ studyName, channelId, url }),
      },
    ],
    // discussion: [
    //   {
    //     type: 'button',
    //     text: { type: 'plain_text', text: 'Approve' },
    //     style: 'primary',
    //     action_id: 'approve_discussion',
    //     value: JSON.stringify({ studyName, channelId, url }),
    //   },
    //   {
    //     type: 'button',
    //     text: { type: 'plain_text', text: 'Request Changes' },
    //     style: 'danger',
    //     action_id: 'request_changes_discussion',
    //     value: JSON.stringify({ studyName, channelId, url }),
    //   },
    // ],
  };

  const documentTypeLabels = {
    brief: 'Research Brief',
    plan: 'Research Plan',
    discussion: 'Discussion Guide',
    desk: 'Desk Research',
    stakeholder_guide: 'Stakeholder Interview Guide',
    stakeholder_notes: 'Stakeholder Notes',
    survey_data: 'Survey Data',
  };

  const documentTypeLabel = documentTypeLabels[documentType] || '';

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🗓️ ${studyName}${documentTypeLabel ? ` - ${documentTypeLabel}` : ''}`,
        emoji: true,
      },
    },
  ];

  // Only add user roles section if study exists and has userRoles
  if (study && study.userRoles && Array.isArray(study.userRoles) && study.userRoles.length > 0) {
    blocks.push(
      ...study.userRoles.map(({ user_id: userId, role }) => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <@${userId}> — *${role}*`,
        },
      }))
    );
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `<${url}|:github: View on GitHub>`,
    },
  });

  // Only add action buttons if documentType is not 'discussion', 'desk', or 'stakeholder-guide'survey
  if (documentType !== 'discussion' && documentType !== 'desk' && documentType !== 'stakeholder_guide' && documentType !== 'stakeholder_notes' && documentType !== 'survey_data') {
    blocks.push({
      type: 'actions',
      block_id: 'study_actions',
      elements: actionButtons[documentType] || actionButtons.brief,
    });
  }

  return blocks;
};

// Generate simplified blocks for channel message (without action buttons)
const generateChannelBlocks = (studyName, study, url, documentType) => {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🗓️ ${studyName} - ${documentType.charAt(0).toUpperCase() + documentType.slice(1)} Created`,
        emoji: true,
      },
    },
  ];

  // Only add user roles section if study exists and has userRoles
  if (study && study.userRoles && Array.isArray(study.userRoles) && study.userRoles.length > 0) {
    blocks.push(
      ...study.userRoles.map(({ user_id: userId, role }) => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <@${userId}> — *${role}*`,
        },
      }))
    );
  }

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${url}|:github: View on GitHub>`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `✅ ${documentType.charAt(0).toUpperCase() + documentType.slice(1)} has been created and sent to team members for review.`,
        },
      ],
    }
  );

  return blocks;
};

// Generic function to send study result message
const sendStudyResultMessage = async (client, channelId, studyName, blocks, documentType) => {
  console.log('🚀 ~ sendStudyResultMessage ~ blocks:', blocks);
  const fallbackText = `Here's your research ${documentType} for *${studyName}*`;

  try {
    // Get the study object first (may be null for briefs from requests)
    let study = null;
    try {
      study = await getResearchStudyWithRoles(studyName);
      console.log("🚀 ~ sendStudyResultMessage ~ study:", study);
    } catch (error) {
      console.log("⚠️ Study not found (may be from request):", error.message);
      // Study might not exist yet (e.g., brief from request)
    }

    // Extract URL from the blocks - find the section with GitHub URL
    const urlSection = blocks.find(block =>
      block.type === 'section' &&
      block.text &&
      block.text.text &&
      block.text.text.includes('github.com')
    );

    if (!urlSection) {
      throw new Error('Could not find GitHub URL in blocks');
    }

    const urlMatch = urlSection.text.text.match(/<(.*?)\|/);
    if (!urlMatch) {
      throw new Error('Could not extract URL from GitHub section');
    }

    const url = urlMatch[1];
    console.log("🚀 ~ sendStudyResultMessage ~ url:", url);

    // Send simplified message to channel (without action buttons)
    const channelBlocks = generateChannelBlocks(studyName, study, url, documentType);
    console.log("🚀 ~ sendStudyResultMessage ~ channelBlocks:", channelBlocks);

    // await client.chat.postMessage({
    //   channel: channelId,
    //   text: fallbackText,
    //   blocks: channelBlocks,
    // });

    // Send complete message with action buttons to each user in userRoles via DM
    // Only if study exists and has userRoles
    if (study && study.userRoles && Array.isArray(study.userRoles) && study.userRoles.length > 0) {
      // Use Promise.all to send DMs concurrently
      await Promise.all(
        study.userRoles.map(async ({ user_id: userId }) => {
          try {
            // Open DM with user
            const im = await client.conversations.open({
              users: userId,
            });

            // Send complete message with action buttons
            await client.chat.postMessage({
              channel: im.channel.id,
              text: `🔔 New ${documentType} for *${studyName}* - Please review and take action`,
              blocks,
            });
          } catch (error) {
            console.error(`Failed to send DM to user ${userId}:`, error);
          }
        }),
      );
    } else {
      // If no study or userRoles, send to channel instead
      console.log("⚠️ No study or userRoles found, sending to channel instead");
      await client.chat.postMessage({
        channel: channelId,
        text: fallbackText,
        blocks,
      });
    }
  } catch (err) {
    console.error(`❌ Failed to send ${documentType} message:`, err);
  }
};

module.exports = {
  generateStudyResultBlocks,
  sendStudyResultMessage,
}; 

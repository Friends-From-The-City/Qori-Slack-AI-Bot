const { requestStudyChangesModal } = require('./ui/requestStudyChangesModal');
const { addStudyStatus, getStudyStatusByStudyName } = require('../../services/study-status.service');
const { getResearchStudyWithRoles } = require('../../services/research_study.service');

// Generic function to handle approve for plan, brief, and discussion
const handleApprove = async (body, client, type) => {
  const { studyName, channelId, url, briefData } = JSON.parse(body.actions[0].value);

  const typeLabels = {
    plan: 'research plan',
    brief: 'research brief',
    discussion: 'discussion guide'
  };

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: `confirm_approve_${type}`,
      private_metadata: JSON.stringify({ studyName, channelId, url, type, briefData }),
      title: { type: 'plain_text', text: 'Confirm Approval' },
      close: { type: 'plain_text', text: 'Cancel' },
      submit: { type: 'plain_text', text: 'Approve' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Are you sure you want to *approve* the ${typeLabels[type]} for *${studyName}*?`
          }
        }
      ]
    }
  });
};

// Generic function to handle approve modal submission
const handleApproveSubmission = async (ack, view, body, client) => {
  await ack();
  const { studyName, channelId, url, type, briefData } = JSON.parse(view.private_metadata);
  const user = body.user.id;

  const typeLabels = {
    plan: 'plan',
    brief: 'brief',
    discussion: 'discussion guide'
  };

  await addStudyStatus({
    study_name: studyName,
    path: url,
    approved_by: user,
    status: 'approve',
  });

  // Special handling for research brief approval
  if (type === 'brief') {
    const researchTeamChannelId = process.env.RESEARCH_TEAM_CHANNEL_ID || channelId;

    // Check if study already exists — determines CTA
    const existingStudy = await getResearchStudyWithRoles(studyName);
    const studyExists = !!(existingStudy && existingStudy.path);

    // Build the CTA button based on whether study exists
    let ctaButton;
    if (studyExists) {
      // Study exists (normal /qori-plan flow) — next step is research plan
      ctaButton = {
        type: 'button',
        text: { type: 'plain_text', text: 'Create Research Plan', emoji: true },
        style: 'primary',
        action_id: 'create_research_plan_from_brief',
        value: JSON.stringify({ studyName, briefUrl: url, channelId: researchTeamChannelId }),
      };
    } else {
      // No study yet (from-request flow) — need to create study first
      const briefDataForStudy = briefData || { project_title: studyName, brief_url: url };
      ctaButton = {
        type: 'button',
        text: { type: 'plain_text', text: 'Create Research Study', emoji: true },
        style: 'primary',
        action_id: 'create_study_from_brief',
        value: JSON.stringify({ studyName, briefUrl: url, briefData: briefDataForStudy, channelId: researchTeamChannelId }),
      };
    }

    const nextStepText = studyExists
      ? 'The research brief has been approved. Next step: create the research plan.'
      : 'The research brief has been approved. Next step: create the research study.';

    try {
      await client.chat.postMessage({
        channel: researchTeamChannelId,
        text: `✅ *Research Brief Approved*\n\n*Study:* ${studyName}\n*Approved by:* <@${user}>`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `Research Brief Approved — ${studyName}`, emoji: true },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Approved by:* <@${user}>\n*Brief:* <${url}|View on GitHub>` },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: nextStepText },
          },
          {
            type: 'actions',
            elements: [ctaButton],
          },
        ],
      });
    } catch (error) {
      console.error('Failed to send approval message to research team:', error);
      await client.chat.postMessage({
        channel: channelId,
        text: `✅ *${studyName}* ${typeLabels[type]} approved by <@${user}>!`,
      });
    }

    // Notify the researcher who created the brief
    if (existingStudy && existingStudy.created_by) {
      try {
        const im = await client.conversations.open({ users: existingStudy.created_by });
        const dmText = studyExists
          ? `✅ *${studyName}* research brief approved by <@${user}>! You can now create the research plan.`
          : `✅ *${studyName}* research brief approved by <@${user}>! The research team has been notified to create the study.`;
        await client.chat.postMessage({ channel: im.channel.id, text: dmText });
      } catch (error) {
        console.error('Failed to send DM to study creator:', error);
      }
    }
  } else {
    // Original flow for plan and discussion guide
    // Get study details to find the creator
    const study = await getResearchStudyWithRoles(studyName);

    // Send DM to study creator
    if (study.created_by) {
      try {
        const im = await client.conversations.open({
          users: study.created_by
        });
        await client.chat.postMessage({
          channel: im.channel.id,
          text: `✅ *${studyName}* ${typeLabels[type]} approved by <@${user}>!`
        });
      } catch (error) {
        console.error('Failed to send DM to study creator:', error);
      }
    }
  }
};

// Generic function to handle request changes for both plan and brief
const handleRequestChanges = async (body, client, type) => {
  const { studyName, channelId, url } = JSON.parse(body.actions[0].value);

  // Fetch actual files for this study
  let fileOptions = [];
  try {
    const studyFiles = await getStudyStatusByStudyName(studyName);

    // Create file options from actual study files
    fileOptions = studyFiles.map(file => ({
      key: file.file_name,
      label: `📄 ${file.file_name}`,
    }));

    // If no files found, provide default options
    if (fileOptions.length === 0) {
      fileOptions = [
        { key: 'research_brief', label: '📄 research_brief.md' },
        { key: 'research_plan', label: '📝 research_plan.md' },
        { key: 'background_docs', label: '📚 Background documents' },
        { key: 'all_docs', label: '📊 All planning documents' },
      ];
    }
  } catch (error) {
    console.error('Error fetching study files:', error);
    // Fallback to default options if there's an error
    fileOptions = [
      { key: 'research_brief', label: '📄 research_brief.md' },
      { key: 'research_plan', label: '📝 research_plan.md' },
      { key: 'background_docs', label: '📚 Background documents' },
      { key: 'all_docs', label: '📊 All planning documents' },
    ];
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      ...requestStudyChangesModal(fileOptions),
      callback_id: `request_changes_${type}_modal`,
      private_metadata: JSON.stringify({ studyName, channelId, url, type }),
    },
  });
};

// Generic function to handle request changes modal submission
const handleRequestChangesSubmission = async (ack, view, body, client) => {
  await ack();
  const { studyName, channelId, url, type } = JSON.parse(view.private_metadata);
  const user = body.user.id;

  // Extract all values from the modal
  const { values } = view.state;

  // Helper function to safely extract values
  const extract = (blockId, actionId) => {
    const block = values[blockId];
    if (!block) return null;

    const action = block[actionId];
    if (!action) return null;

    // Handle different input types
    if (action.value !== undefined) return action.value;
    if (action.selected_option !== undefined) return action.selected_option.value;
    if (action.selected_options !== undefined) return action.selected_options.map((opt) => opt.value);
    if (action.selected_date !== undefined) return action.selected_date;

    return null;
  };

  // Extract all the form values
  const changeFeedback = extract('change_feedback_block', 'change_feedback');
  const filesToUpdate = extract('files_to_update_block', 'files_to_update') || [];
  const priorityLevel = extract('priority_level_block', 'priority_level');
  const deadline = extract('deadline_block', 'deadline');

  // Console log all the extracted values
  console.log(`📝 Request Study ${type.charAt(0).toUpperCase() + type.slice(1)} Changes Modal - All Values:`);
  console.log('Study Name:', studyName);
  console.log('Channel ID:', channelId);
  console.log('URL:', url);
  console.log('User:', user);
  console.log('Type:', type);
  console.log('Change Feedback:', changeFeedback);
  console.log('Files to Update:', filesToUpdate);
  console.log('Priority Level:', priorityLevel);
  console.log('Deadline:', deadline);
  console.log('Raw view.state.values:', JSON.stringify(values, null, 2));

  await addStudyStatus({
    study_name: studyName,
    requested_by: user,
    status: 'need_changes',
    reason: changeFeedback,
    path: url,
  });

  // Get study details to find the creator
  const study = await getResearchStudyWithRoles(studyName);

  // Send DM to study creator
  if (study.created_by) {
    try {
      const im = await client.conversations.open({
        users: study.created_by,
      });
      await client.chat.postMessage({
        channel: im.channel.id,
        text: `❗ Changes requested for *${studyName}* ${type} by <@${user}>`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❗ *Changes requested* for *${studyName}* ${type} by <@${user}>`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Feedback:*\n>${changeFeedback}` },
              { type: 'mrkdwn', text: `*Priority:* ${priorityLevel}` },
            ],
          },
          ...(filesToUpdate.length > 0 ? [{
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Files to Update:*\n${filesToUpdate.join(', ')}` }
            ]
          }] : []),
          ...(deadline ? [{
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Deadline:* ${deadline}` },
            ],
          }] : []),
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `<${url}|:github: View on GitHub>`,
            },
          },
        ],
      });
    } catch (error) {
      console.error('Failed to send DM to study creator:', error);
    }
  }
};

module.exports = {
  handleApprove,
  handleApproveSubmission,
  handleRequestChanges,
  handleRequestChangesSubmission
}; 

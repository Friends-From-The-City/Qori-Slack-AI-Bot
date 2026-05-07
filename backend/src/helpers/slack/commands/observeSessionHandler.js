const { requestObserveSessionModal } = require("../ui/requestObserveSessionModal");
const { getResearchStudyWithRoles, getStudiesByUser } = require("../../../services/research_study.service");
const sessionObserverService = require("../../../services/session_observer.service");
const studyParticipantService = require("../../../services/study_participant.service");
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo } = require("../../github");
const { processObserverYamlTemplate } = require("../../observerYamlProcessor");

const observeSessionHandler = async ({ ack, body, client, command }) => {
  try {
    console.log("🚀 ~ observeSessionHandler ~ body:", body);
    await ack();

    const channelId = command.channel_id;
    const userId = command.user_id;

    // Get user's display name
    const userName = body.user.real_name || body.user.name || body.user.username || "";

    // Fetch real studies for this user
    const studies = await getStudiesByUser(userId);
    if (!studies || studies.length === 0) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "❌ No studies found. Create a study first with `/qori-brief`.",
      });
      return;
    }

    // Collect participants from all user's studies
    const sessions = [];
    let studyName = '';
    let studyId = null;

    for (const study of studies) {
      const participants = await studyParticipantService.getParticipantsByStudy(study.id);
      if (participants && participants.length > 0) {
        studyName = study.name;
        studyId = study.id;
        for (const p of participants) {
          // Format participant ID: PT-XXX using padded DB id
          const ptId = `PT-${String(p.id).padStart(3, '0')}`;
          sessions.push({
            id: ptId,
            participantId: p.id,
            date: p.scheduled_date || 'TBD',
            time: p.scheduled_time || 'TBD',
            assignedObservers: [],
            maxObservers: 3,
            requiresApproval: true,
          });
        }
      }
    }

    if (sessions.length === 0) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "❌ No participants found in your studies. Add participants first with `/qori-participant`.",
      });
      return;
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        ...requestObserveSessionModal(sessions, studyName, "", userName),
        private_metadata: JSON.stringify({ channelId, userId, userName, studyName, studyId }),
      },
    });
  } catch (error) {
    console.error("🚀 ~ observeSessionHandler ~ error:", error.data || error.message);
  }
};

// Handler for modal submission
const handleObserveSessionSubmission = async ({ ack, body, client, view }) => {
  try {
    await ack();

    const values = view.state.values;
    const metadata = JSON.parse(view.private_metadata);
    const { channelId, userId, studyId, studyName, userName } = metadata;

    // Extract form values
    const observerRole = values.observer_role_block?.observer_role?.selected_option?.value;

    // Find the selected session from dropdown (static_select)
    const selectedSessionOption = values.session_selection_block?.selected_session?.selected_option?.value;

    // Parse the pipe-separated value to get sessionId and participantId
    let selectedSessionId, participantId;
    if (selectedSessionOption) {
      try {
        // Handle pipe-separated format: "pt029|29"
        if (selectedSessionOption.includes('|')) {
          const [sessionId, participantIdStr] = selectedSessionOption.split('|');
          selectedSessionId = sessionId;
          participantId = parseInt(participantIdStr, 10);
        } else {
          // Fallback to old format
          selectedSessionId = selectedSessionOption;
        }
      } catch (error) {
        console.error("Error parsing selected session option:", error);
        selectedSessionId = selectedSessionOption; // Fallback to old format
      }
    }

    const selectedSessions = selectedSessionId ? [selectedSessionId] : [];
    console.log("🚀 ~ handleObserveSessionSubmission ~ selectedSessions:", selectedSessions);
    console.log("🚀 ~ handleObserveSessionSubmission ~ participantId:", participantId);
    const observationReason = values.observation_reason_block?.observation_reason?.value;

    // Validate required fields
    // if (!observerRole || selectedSessions.length === 0 || !observationReason) {
    //   await client.chat.postEphemeral({
    //     channel: channelId,
    //     user: userId,
    //     text: "❌ Please fill in all required fields to request observation.",
    //   });
    //   return;
    // }

    // Get study information with user roles
    const study = await getResearchStudyWithRoles(studyName);
    if (!study) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "❌ Study not found. Please try again.",
      });
      return;
    }

    // Process the observation request
    const selectedSessionInfos = selectedSessions.join(', ');
    console.log("🚀 ~ handleObserveSessionSubmission ~ selectedSessionInfos:", selectedSessionInfos)

    // Store the observer request in database
    const observerRequest = await sessionObserverService.createObserverRequest({
      study_id: study.id,
      session_id: selectedSessions[0], // For now, handle single session
      participant_id: participantId, // Include the participant ID
      requester_id: userId,
      requester_name: userName, // We can get actual name later
      role: observerRole,
      reason: observationReason
    });

    // Send confirmation message to the requester
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `✅ Your observation request has been submitted!\n\n*Study:* ${studyName}\n*Sessions:* ${selectedSessionInfos}\n*Role:* ${observerRole}\n\nWe've sent approval requests to the study coordinators. You'll receive a notification once approved.`,
    });

    // Construct GitHub URL for the participant tracker file
    const githubUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/blob/main/${study.path}/primary-research/${study.name}_participant_tracker.md`;

    // Send approval requests to study users
    // if (study.userRoles && study.userRoles.length > 0) {
    //   for (const userRole of study.userRoles) {
    //     try {
    await client.chat.postMessage({
      channel: study.created_by, // DM to the user
      text: `:eye: *Observer Approval Request*\n\n*Study:* ${studyName}\n*Requester:* <@${userId}>\n*Sessions:* ${selectedSessionInfos}\n*Role:* ${observerRole}\n*Reason:* ${observationReason}\n\nPlease approve or deny this observation request.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:eye: *Observer Approval Request*\n\n*Study:* ${studyName}\n*Requester:* <@${userId}>\n*Sessions:* ${selectedSessionInfos}\n*Role:* ${observerRole}\n*Reason:* ${observationReason}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Approve",
                emoji: true
              },
              style: "primary",
              action_id: "approve_observer_request",
              value: JSON.stringify({
                requestId: observerRequest.id,
                requesterId: userId,
                studyName,
                sessions: selectedSessionInfos,
                role: observerRole,
                reason: observationReason,
                channelId
              })
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Deny",
                emoji: true
              },
              style: "danger",
              action_id: "deny_observer_request",
              value: JSON.stringify({
                requestId: observerRequest.id,
                requesterId: userId,
                studyName,
                sessions: selectedSessionInfos,
                role: observerRole,
                reason: observationReason,
                channelId
              })
            }
          ]
        }
      ]
    });
    //   } catch (error) {
    //     console.error(`Failed to send DM to user ${userRole.user_id}:`, error);
    //   }
    // }
    // } else {
    // If no study users found, post to the channel
    //   await client.chat.postMessage({
    //     channel: channelId,
    //     text: `:eye: *New Observation Request*\n\n*Study:* ${studyName}\n*User:* <@${userId}>\n*Sessions:* ${selectedSessions}\n*Role:* ${observerRole}\n*Reason:* ${observationReason}\n\n*Note:* No study coordinators found to approve this request.`,
    //     blocks: [
    //       {
    //         type: "section",
    //         text: {
    //           type: "mrkdwn",
    //           text: `:eye: *New Observation Request*\n\n*Study:* ${studyName}\n*User:* <@${userId}>\n*Sessions:* ${selectedSessions}\n*Role:* ${observerRole}\n*Reason:* ${observationReason}\n\n*Note:* No study coordinators found to approve this request.`
    //         }
    //       },
    //       {
    //         type: "section",
    //         text: {
    //           type: "mrkdwn",
    //           text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
    //         },
    //       }
    //     ]
    //   });
    // }

  } catch (error) {
    console.error("🚀 ~ handleObserveSessionSubmission ~ error:", error.data || error.message);
  }
};

// Handler for observer approval
const handleObserverApproval = async ({ ack, body, client }) => {
  await ack();

  try {
    const { value } = body.actions[0];
    const { requestId, requesterId, studyName, sessions, role, reason, channelId } = JSON.parse(value);

    // Update the request status in database
    const updatedRequest = await sessionObserverService.updateObserverStatus(requestId, 'approved', body.user.id);
    if (!updatedRequest) {
      console.error('Observer request not found:', requestId);
      return;
    }

    // Get study and participants for YAML processing
    const study = await getResearchStudyWithRoles(studyName);
    const participants = await studyParticipantService.getParticipantsByStudy(study.id);

    // Get all observer requests for this study from database
    const observerRequests = await sessionObserverService.getObserverRequestsByStudy(study.id);

    // Update the YAML file with observer data
    let githubUrl;

    try {
      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_tracker.yaml");

      const inputData = {
        study_id: study.id,
        study_name: study.name, // Use the actual study name from database
        current_date: new Date().toISOString().split('T')[0],
        added_by: body.user.id
      };

      const renderedYaml = await processObserverYamlTemplate(
        file.content,
        inputData,
        study.path,
        'primary-research',
        observerRequests,
        participants
      );

      console.log('✅ Observer YAML updated successfully:', renderedYaml);

      // Use the actual URL from the rendered result if available
      if (renderedYaml && renderedYaml.result && renderedYaml.result.url) {
        githubUrl = renderedYaml.result.url;
      }
    } catch (yamlError) {
      console.error('⚠️ Error updating observer YAML:', yamlError);
      // Keep the default URL if YAML processing fails
    }

    // Send approval notification to requester
    await client.chat.postMessage({
      channel: requesterId,
      text: `✅ *Observer Request Approved!*\n\n*Study:* ${studyName}\n*Sessions:* ${sessions}\n*Role:* ${role}\n\nYou're approved to observe these sessions. You'll receive role-specific guidelines and session prep materials shortly.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Observer Request Approved!*\n\n*Study:* ${studyName}\n*Sessions:* ${sessions}\n*Role:* ${role}\n\nYou're approved to observe these sessions. You'll receive role-specific guidelines and session prep materials shortly.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<https://github.com/friends-innovation-lab/qori-slack/blob/main/config/templates/primary-research/03-fieldwork/observer_guidelines.md|:book: View Observer Guidelines>`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*To take notes of the session, use this command:* \`/take-notes\``,
          },
        },
      ],
    });

    // Notify the channel
    // await client.chat.postMessage({
    //   channel: channelId,
    //   text: `✅ *Observer Request Approved*\n\n*Study:* ${studyName}\n*Approved by:* <@${body.user.id}>\n*Requester:* <@${requesterId}>\n*Sessions:* ${sessions}\n*Role:* ${role}`,
    //   blocks: [
    //     {
    //       type: 'section',
    //       text: {
    //         type: 'mrkdwn',
    //         text: `✅ *Observer Request Approved*\n\n*Study:* ${studyName}\n*Approved by:* <@${body.user.id}>\n*Requester:* <@${requesterId}>\n*Sessions:* ${sessions}\n*Role:* ${role}`,
    //       },
    //     },
    //     {
    //       type: 'section',
    //       text: {
    //         type: 'mrkdwn',
    //         text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
    //       },
    //     },
    //   ],
    // });

  } catch (error) {
    console.error("Error handling observer approval:", error);
  }
};

// Handler for observer denial
const handleObserverDenial = async ({ ack, body, client }) => {
  await ack();

  try {
    const { value } = body.actions[0];
    const { requestId, requesterId, studyName, sessions, role, reason, channelId } = JSON.parse(value);

    // Update the request status in database
    const updatedRequest = await sessionObserverService.updateObserverStatus(requestId, 'denied', body.user.id);
    if (!updatedRequest) {
      console.error('Observer request not found:', requestId);
      return;
    }

    // Get study and participants for YAML processing
    const study = await getResearchStudyWithRoles(studyName);
    const participants = await studyParticipantService.getParticipantsByStudy(study.id);

    // Get all observer requests for this study from database
    const observerRequests = await sessionObserverService.getObserverRequestsByStudy(study.id);

    // Update the YAML file with observer data
    let githubUrl;

    try {
      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "participant_tracker.yaml");

      const inputData = {
        study_id: study.id,
        study_name: study.name, // Use the actual study name from database
        current_date: new Date().toISOString().split('T')[0],
        added_by: body.user.id
      };

      const renderedYaml = await processObserverYamlTemplate(
        file.content,
        inputData,
        study.path,
        'primary-research',
        observerRequests,
        participants
      );

      console.log('✅ Observer YAML updated successfully after denial:', renderedYaml);

      // Use the actual URL from the rendered result if available
      if (renderedYaml && renderedYaml.result && renderedYaml.result.url) {
        githubUrl = renderedYaml.result.url;
      }
    } catch (yamlError) {
      console.error('⚠️ Error updating observer YAML after denial:', yamlError);
      // Keep the default URL if YAML processing fails
    }

    // Send denial notification to requester
    await client.chat.postMessage({
      channel: requesterId,
      text: `❌ *Observer Request Denied*\n\n*Study:* ${studyName}\n*Sessions:* ${sessions}\n*Role:* ${role}\n\nYour request to observe these sessions has been denied. Please contact the study coordinator for more information.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ *Observer Request Denied*\n\n*Study:* ${studyName}\n*Sessions:* ${sessions}\n*Role:* ${role}\n\nYour request to observe these sessions has been denied. Please contact the study coordinator for more information.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
          },
        },
      ],
    });

    // Notify the channel
    // await client.chat.postMessage({
    //   channel: channelId,
    //   text: `❌ *Observer Request Denied*\n\n*Study:* ${studyName}\n*Denied by:* <@${body.user.id}>\n*Requester:* <@${requesterId}>\n*Sessions:* ${sessions}\n*Role:* ${role}`,
    //   blocks: [
    //     {
    //       type: 'section',
    //       text: {
    //         type: 'mrkdwn',
    //         text: `❌ *Observer Request Denied*\n\n*Study:* ${studyName}\n*Denied by:* <@${body.user.id}>\n*Requester:* <@${requesterId}>\n*Sessions:* ${sessions}\n*Role:* ${role}`,
    //       },
    //     },
    //     {
    //       type: 'section',
    //       text: {
    //         type: 'mrkdwn',
    //         text: `<${githubUrl}|:github: View Participant Tracker on GitHub>`,
    //       },
    //     },
    //   ],
    // });

  } catch (error) {
    console.error("Error handling observer denial:", error);
  }
};

module.exports = {
  observeSessionHandler,
  handleObserveSessionSubmission,
  handleObserverApproval,
  handleObserverDenial,
}; 

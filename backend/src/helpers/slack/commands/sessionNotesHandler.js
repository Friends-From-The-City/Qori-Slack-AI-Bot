const { sessionNotesModal, buildSessionNotesView } = require("../ui/sessionNotesModal");
const sessionObserverService = require("../../../services/session_observer.service");
const sessionParticipantService = require("../../../services/study_participant.service");
const { getResearchStudyWithRoles } = require("../../../services/research_study.service");
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepo, createOrUpdateFileOnGitHub } = require("../../github");
const { processYamlTemplate } = require("../../yamlProcessor");
const { studyNotesService } = require("../../../services");
const { processSlackFiles } = require("../../pdfProcessor");
const path = require('path');
const uploadNotesModal = require("../ui/uploadNotesModal");

const uploadNotesHandler = async ({ ack, body, client, command }) => {
  console.log("🚀 ~ uploadNotesHandler ~ body:", body);

  try {
    // Acknowledge the command first
    await ack(); // < 3s

    // Fetch user's approved sessions
    const userId = command.user_id;
    const sessions = await sessionObserverService.getObserverByUser(userId);
    console.log("🚀 ~ uploadNotesHandler ~ sessions:", sessions)

    // Check if user has any approved sessions
    if (!sessions || sessions.length === 0) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `❌ You don't have any approved sessions to observe. Please contact your research coordinator to be assigned to sessions.`
      });
      return;
    }

    // Prepare initial session data
    let initialSession = null;
    if (sessions && sessions.length > 0) {
      const firstSession = sessions[0];
      initialSession = {
        id: firstSession.id,
        displayName: `${firstSession.study?.name || 'Unknown Study'} - ${firstSession.participant?.participant_name || 'Unknown Participant'} (${firstSession.session_id || 'Unknown Session'})`,
        study: firstSession.study,
        participant: firstSession.participant,
        session_id: firstSession.session_id
      };
    }

    const initialState = {
      tab: 'manual',               // default tab
      session: initialSession,     // include the first session if available
      sessions: sessions,          // include all sessions for reference
      origin: {
        team: command.team_id,
        channel: command.channel_id,
        user: command.user_id,
        ts: command.trigger_id     // not reusable; just for debugging context
      }
    };

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildSessionNotesView(initialState) // dynamic/two-tab modal
    });

  } catch (error) {
    console.error("Error opening upload notes modal:", error);

    // Try to send error message to user via chat
    try {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `❌ Failed to open upload notes modal: ${error.message}`,
        response_type: "ephemeral"
      });
    } catch (chatError) {
      console.error("Could not send error message to user:", chatError);
    }
  }
};

const handleTabManual = async ({ ack, body, client }) => {
  await ack();
  const metadata = JSON.parse(body.view.private_metadata || '{}');

  // Fetch sessions data when needed
  const sessions = await sessionObserverService.getObserverByUser(metadata.userId);

  // Rebuild state with sessions data
  const state = {
    tab: 'manual',
    method: metadata.method || 'files',
    sessions: sessions,
    origin: {
      team: metadata.teamId,
      channel: metadata.channelId,
      user: metadata.userId
    }
  };

  // If there was a selected session, find it and include it
  if (metadata.selectedSessionId) {
    const selectedSession = sessions.find(s => s.id.toString() === metadata.selectedSessionId.toString());
    if (selectedSession) {
      state.session = {
        id: selectedSession.id,
        displayName: `${selectedSession.study?.name || 'Unknown Study'} - ${selectedSession.participant?.participant_name || 'Unknown Participant'} (${selectedSession.session_id || 'Unknown Session'})`,
        study: selectedSession.study,
        participant: selectedSession.participant,
        session_id: selectedSession.session_id
      };
    }
  }

  await client.views.update({
    view_id: body.view.id,
    view: buildSessionNotesView(state)
  });
};

const handleTabUpload = async ({ ack, body, client }) => {
  await ack();
  const metadata = JSON.parse(body.view.private_metadata || '{}');

  // Fetch sessions data when needed
  const sessions = await sessionObserverService.getObserverByUser(metadata.userId);

  // Rebuild state with sessions data
  const state = {
    tab: 'upload',
    method: metadata.method || 'files',
    sessions: sessions,
    origin: {
      team: metadata.teamId,
      channel: metadata.channelId,
      user: metadata.userId
    }
  };

  // If there was a selected session, find it and include it
  if (metadata.selectedSessionId) {
    const selectedSession = sessions.find(s => s.id.toString() === metadata.selectedSessionId.toString());
    if (selectedSession) {
      state.session = {
        id: selectedSession.id,
        displayName: `${selectedSession.study?.name || 'Unknown Study'} - ${selectedSession.participant?.participant_name || 'Unknown Participant'} (${selectedSession.session_id || 'Unknown Session'})`,
        study: selectedSession.study,
        participant: selectedSession.participant,
        session_id: selectedSession.session_id
      };
    }
  }

  await client.views.update({
    view_id: body.view.id,
    view: buildSessionNotesView(state)
  });
};

const handleSessionSelectionChange = async ({ ack, body, client }) => {
  await ack();

  try {
    const selectedSessionId = body.actions[0].selected_option.value;
    const metadata = JSON.parse(body.view.private_metadata || '{}');

    // Fetch sessions data when needed
    const sessions = await sessionObserverService.getObserverByUser(metadata.userId);

    // Find the selected session from the sessions array
    const selectedSession = sessions.find(s => s.id.toString() === selectedSessionId);

    if (selectedSession) {
      // Update the modal with the selected session
      const updatedState = {
        tab: metadata.tab || 'upload',
        method: metadata.method || 'files',
        sessions: sessions,
        origin: {
          team: metadata.teamId,
          channel: metadata.channelId,
          user: metadata.userId
        },
        session: {
          id: selectedSession.id,
          displayName: `${selectedSession.study?.name || 'Unknown Study'} - ${selectedSession.participant?.participant_name || 'Unknown Participant'} (${selectedSession.session_id || 'Unknown Session'})`,
          study: selectedSession.study,
          participant: selectedSession.participant,
          session_id: selectedSession.session_id
        }
      };

      // Rebuild the modal view with updated state
      const updatedView = buildSessionNotesView(updatedState);

      await client.views.update({
        view_id: body.view.id,
        view: updatedView
      });
    }
  } catch (error) {
    console.error('Error handling session selection:', error);
  }
}

const handleSessionNotesSubmission = async ({ ack, body, view, client }) => {
  try {
    await ack();

    const values = view.state.values;
    console.log("🚀 ~ handleSessionNotesSubmission ~ values:", values)
    const metadata = JSON.parse(view.private_metadata || '{}');
    const isManual = metadata.tab === 'manual';

    // Extract session selection
    const selectedSessionId = values.session_select?.session_select_change?.selected_option?.value;

    // Fetch sessions data when needed
    const sessions = await sessionObserverService.getObserverByUser(metadata.userId);
    const selectedSession = sessions.find(s => s.id.toString() === selectedSessionId);

    if (!selectedSession || selectedSessionId === 'no_sessions') {
      await client.chat.postMessage({
        channel: body.user.id,
        text: `❌ Please select a valid session before submitting notes. No sessions are currently available.`,
        response_type: "ephemeral"
      });
      return;
    }

    let templateData = {
      session_id: selectedSession.session_id || 'Unknown Session',
      participant_name: selectedSession.participant?.participant_name || 'Unknown Participant',
      observer_name: body.user.username || 'Unknown User',
      session_date: selectedSession.participant?.scheduled_date || 'Unknown Date',
      session_time: selectedSession.participant?.scheduled_time || 'Unknown Time',
      researcher: selectedSession.study?.researcher_name || 'Unknown Researcher',
      slack_user_id: body.user.id || 'Unknown',
      study_name: selectedSession.study?.name || 'Unknown Study',
      participant_id: selectedSession.participant?.participant_name || 'Unknown Participant ID',
    };

    let renderedYaml;
    let yamlTemplateName;

    if (isManual) {
      // Extract single observations field
      const observations = values.observations?.observations_text?.value || '';

      if (!observations || observations.trim() === '') {
        await client.chat.postMessage({
          channel: body.user.id,
          text: `❌ Please enter your observations before submitting.`,
          response_type: "ephemeral"
        });
        return;
      }

      // Map to existing template structure for backward compatibility
      // The YAML template can use the combined observations field
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      
      templateData = {
        ...templateData,
        slack_ts: `${hours}:${minutes}`,
        structured_notes: observations,
      };

      // Use session-notes-template.yaml for manual flow
      yamlTemplateName = "session_notes.yaml";
    } else {
      // Handle file upload or paste
      const files = values.transcript_files?.files || [];
      console.log("🚀 ~ handleSessionNotesSubmission ~ files:", files)
      const pastedText = values.transcript_paste?.text?.value || '';

      let rawContent = ''; // Store raw content for GitHub storage

      if (files.files.length > 0) {
        // Process uploaded files to extract content
        const processedFiles = await processSlackFiles(files.files, process.env.SLACK_BOT_TOKEN);
        const fileContent = processedFiles.map(file => file.content).join('\n\n---\n\n');
        rawContent = fileContent; // Store for raw file storage

        templateData = {
          ...templateData,
          input_text: fileContent,
          transcript_files: files.files.map(f => f.name).join(', '),
          filename: files.files[0]?.name || 'transcript_upload.md',
          folder_context: templateData.study_name || '',
          upload_date_utc: new Date().toISOString(),
          transcript_source: 'file_upload',
          manual_notes_text_or_blank: '',
        };
      } else if (pastedText) {
        // Process pasted text
        rawContent = pastedText; // Store for raw file storage
        templateData = {
          ...templateData,
          input_text: pastedText,
          manual_notes_text_or_blank: pastedText
        };
      } else {
        await client.chat.postMessage({
          channel: body.user.id,
          text: `❌ Please either upload files or paste transcript content.`,
          response_type: "ephemeral"
        });
        return;
      }

    }

    let result;
    let fileName;

    if (isManual) {
      // Manual notes: process through session_notes.yaml for AI structuring
      const study = await getResearchStudyWithRoles(templateData.study_name);
      const file = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, yamlTemplateName);
      renderedYaml = await processYamlTemplate(file.content, templateData, study.path);
      console.log("🚀 ~ handleSessionNotesSubmission ~ renderedYaml:", renderedYaml);
      result = renderedYaml.result;
      const urlParts = result.path.split('/');
      fileName = urlParts[urlParts.length - 1];
    } else {
      // Transcript upload: save raw content directly to GitHub (no AI coding step)
      // The /qori-analyze command handles all analysis from the raw transcript
      const study = await getResearchStudyWithRoles(templateData.study_name);
      const baseFolder = decodeURIComponent(study.path);
      const transcriptFileName = `${templateData.participant_name}-transcript-${new Date().toISOString().split('T')[0]}.md`;
      const transcriptPath = `${baseFolder}/primary-research/03-fieldwork/transcripts/${transcriptFileName}`;

      const transcriptContent = `# Session Transcript: ${templateData.participant_name}

**Study:** ${templateData.study_name}
**Session date:** ${templateData.session_date}
**Session time:** ${templateData.session_time}
**Researcher:** ${templateData.researcher}
**Uploaded:** ${new Date().toISOString()}

---

${templateData.input_text}`;

      const githubResult = await createOrUpdateFileOnGitHub(transcriptPath, transcriptContent);
      result = githubResult;
      fileName = transcriptFileName;
      console.log("✅ Raw transcript saved to GitHub:", transcriptPath);
    }

    // Store the study note in the database
    const studyNoteData = {
      study_id: selectedSession.study?.id || null,
      study_name: templateData.study_name,
      filename: fileName,
      file_path: result.path,
      file_url: result.url,
      session_date: templateData.session_date,
      session_time: templateData.session_time,
      participant_name: templateData.participant_name,
      researcher: templateData.researcher,
      created_by: body.user.id,
      transcript: !isManual // true for file/text input, false for manual input
    };

    console.log("Study note data to be stored:", studyNoteData);

    try {
      const createdNote = await studyNotesService.createStudyNote(studyNoteData);
      console.log("Study note stored in database:", createdNote);
      studyNoteData.id = createdNote.id;
    } catch (dbError) {
      console.error("Error storing study note in database:", dbError);
      studyNoteData.id = 'Failed to store';
    }

    const sessionInfo = `${selectedSession.session_id} - ${selectedSession.study?.name}`;

    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ Session notes submitted successfully`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ Session notes submitted successfully for session: ${sessionInfo}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${result.url}|:github: View on GitHub>`,
          },
        },
      ],
    });

  } catch (error) {
    console.error("Error handling session notes submission:", error);

    await client.chat.postMessage({
      channel: body.user.id,
      text: `❌ Error submitting session notes: ${error.message}`,
      response_type: "ephemeral"
    });
  }
};


// // Handler for selecting session notes button
// const handleSelectSessionNotes = async ({ ack, body, client }) => {
//   console.log("🚀 ~ handleSelectSessionNotes ~ body:", body)
//   try {
//     await ack();

//     const userId = body.user.id;
//     const sessions = await sessionObserverService.getObserverByUser(userId);

//     console.log("🚀 ~ handleSelectSessionNotes ~ sessions:", sessions);

//     // Check if user has any approved sessions
//     if (!sessions || sessions.length === 0) {
//       await client.chat.postEphemeral({
//         channel: body.channel.id,
//         user: userId,
//         text: "❌ You don't have any approved observation sessions. Please request to observe a session first using the `/observe` command.",
//         response_type: "ephemeral"
//       });
//       return;
//     }

//     // Update the current modal to show session notes content and hide file upload
//     await client.views.update({
//       view_id: body.view.id,
//       view: {
//         ...sessionNotesModal(sessions),
//         blocks: sessionNotesModal(sessions).blocks.map(block => {
//           if (block.block_id === "file_input_block") {
//             // Hide the file input block when session notes is selected
//             return {
//               ...block,
//               optional: true
//             };
//           }
//           return block;
//         })
//       }
//     });

//     console.log("Session notes modal updated successfully");

//   } catch (error) {
//     console.error("Error updating session notes modal:", error);

//     // Try to send error message to user via chat
//     try {
//       await client.chat.postEphemeral({
//         channel: body.channel.id,
//         user: body.user.id,
//         text: `❌ Failed to update session notes modal: ${error.message}`,
//         response_type: "ephemeral"
//       });
//     } catch (chatError) {
//       console.error("Could not send error message to user:", chatError);
//     }
//   }
// };


module.exports = {
  uploadNotesHandler,
  handleTabManual,
  handleTabUpload,
  handleSessionSelectionChange,
  handleSessionNotesSubmission
};

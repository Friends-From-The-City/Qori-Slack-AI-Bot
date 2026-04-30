const { analyzeNotesModal } = require("../ui/analyzeNotesModal");
const { getStudiesByUser, getResearchStudyWithRoles } = require("../../../services/research_study.service");
const { studyNotesService } = require("../../../services");
const sessionSummaryService = require("../../../services/session-summary.service");
const sessionObserverService = require("../../../services/session_observer.service");
const { getConfigRepo, YAML_TEMPLATE_PATH, fetchFileFromRepoByPath, fetchFileFromRepo } = require("../../../helpers/github");
const { processYamlTemplate } = require("../../../helpers/yamlProcessor");

// Command handler to open the analyze notes modal
const analyzeNotesHandler = async ({ ack, body, client, command }) => {
  try {
    await ack();

    // Get research studies for the current user
    const studies = await getStudiesByUser(body.user_id);

    // Initial state: Show only study dropdown
    await client.views.open({
      trigger_id: body.trigger_id,
      view: analyzeNotesModal(studies, [], [], {
        showStudy: true,
        showSession: false,
        showNotes: false,
      })
    });

  } catch (error) {
    console.error("Error opening analyze notes modal:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user_id,
      user: body.user_id,
      text: `❌ Failed to open analyze notes modal: ${error.message}`,
    });
  }
};

// View submission handler for analyze notes modal
const handleAnalyzeNotesSubmission = async ({ ack, body, view, client }) => {
  // Extract form data
  const studyId = view.state.values.study_select_block?.study_select_test?.selected_option?.value;
  const sessionId = view.state.values.session_select_block?.analyze_notes_session_select?.selected_option?.value;
  const selectedTranscriptId = view.state.values.transcript_select_block?.transcript_select?.selected_option?.value;
  const selectedNotes = view.state.values.notes_select_block?.notes_select?.selected_options || [];

  // Transcript is required
  const transcriptBlock = view.state.values.transcript_select_block;
  if (!transcriptBlock || !selectedTranscriptId) {
    await ack({
      response_action: "errors",
      errors: {
        transcript_select_block: "Please select a session transcript to analyze."
      }
    });
    return;
  }

  try {
    await ack();

    if (!studyId || studyId === "no_studies") {
      throw new Error("No research study selected");
    }

    if (sessionId && sessionId !== "no_sessions") {
      console.log("Selected session ID:", sessionId);
    }

    // Get the selected study name and session info
    const studyName = view.state.values.study_select_block?.study_select_test?.selected_option?.text?.text || "Unknown Study";
    const sessionName = view.state.values.session_select_block?.analyze_notes_session_select?.selected_option?.text?.text || null;

    // Fetch the transcript (required)
    let noteDetails = [];
    try {
      const transcript = await studyNotesService.getStudyNoteById(parseInt(selectedTranscriptId));
      if (transcript) {
        noteDetails.push(transcript);
      }
    } catch (error) {
      console.warn("Warning: Could not fetch transcript:", error.message);
    }

    // Fetch optional observer notes
    const noteIds = selectedNotes.map(note => note.value);
    try {
      for (const noteId of noteIds) {
        const note = await studyNotesService.getStudyNoteById(parseInt(noteId));
        if (note) {
          noteDetails.push(note);
        }
      }
    } catch (error) {
      console.warn("Warning: Could not fetch some observer notes:", error.message);
    }

    // Get the study details
    const study = await getResearchStudyWithRoles(studyName);

    // Fetch GitHub content for each note file in parallel
    const noteContentPromises = noteDetails.map(async (note) => {
      try {
        // Extract the file path from the GitHub URL
        let filePath = note.file_path;

        if (filePath) {
          const githubFile = await fetchFileFromRepoByPath(process.env.GITHUB_REPO, filePath);
          return {
            ...note,
            githubContent: githubFile.content || '[Content not available]'
          };
        } else {
          return {
            ...note,
            githubContent: '[File path not available]'
          };
        }
      } catch (error) {
        console.warn(`Warning: Could not fetch GitHub content for note ${note.filename}:`, error.message);
        return {
          ...note,
          githubContent: '[Error fetching content]'
        };
      }
    });

    // Wait for all GitHub content to be fetched
    const notesWithContent = await Promise.all(noteContentPromises);

    // Extract note takers and participant IDs from filenames
    const noteTakers = notesWithContent.map(note => note.created_by).filter(Boolean);

    // Since we now filter notes by session_id (which becomes participant_name), 
    // all notes will have the same participant_name for a given session
    // So we just need one unique participant ID
    const participantIds = notesWithContent.map(note => {
      const participantName = note.participant_name || note.dataValues?.participant_name || note.get?.('participant_name');
      return participantName || 'unknown';
    });

    // Get unique participant IDs (remove duplicates since they're all the same)
    const uniqueParticipantIds = [...new Set(participantIds)];

    // Helper function to format note content
    const formatNoteContent = (note) => {
      const filename = note.filename || 'Unknown File';
      return `# ${filename}\n\n` +
        `**Participant:** ${note.participant_name || 'Unknown Participant'}\n` +
        `**Date:** ${note.session_date || 'Unknown Date'}\n` +
        `**Note Taker:** ${note.created_by || 'Unknown User'}\n\n` +
        `${note.githubContent || '[No content available]'}`
    };

    // Separate notes by transcript property
    const transcriptNotes = notesWithContent.filter(note => note.transcript === true);
    const regularNotes = notesWithContent.filter(note => note.transcript !== true);

    // Create coded_transcript_content for transcript notes
    const coded_transcript_content = transcriptNotes.length > 0
      ? transcriptNotes.map(formatNoteContent).join('\n\n---\n\n')
      : '';

    // Create notes_content for regular notes
    const notes_content = regularNotes.length > 0
      ? regularNotes.map(formatNoteContent).join('\n\n---\n\n')
      : '';

    // Create template data object with all required keys
    const templateData = {
      study_folder: studyName,
      study_name: studyName,
      session_name: sessionName || 'No specific session selected',
      session_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      selected_note_files: notesWithContent.map(note => note.filename || 'Unknown File'),
      coded_transcript_content: coded_transcript_content,
      notes_content: notes_content,
      note_takers: noteTakers.join(', '),
      participant_id: uniqueParticipantIds[0] || 'Unknown Participant ID',
      researcher_contact: study?.researcher_name || study?.researcher_email || '',
      analyzer: body.user.username || body.user.name || body.user.id
    };
    console.log("🚀 ~ handleAnalyzeNotesSubmission ~ templateData:", templateData)

    // Process the YAML template
    const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), YAML_TEMPLATE_PATH, "session_summary.yaml");

    const renderedYaml = await processYamlTemplate(yamlTemplateFile.content, templateData, study?.path);

    const { result } = renderedYaml;
    const urlParts = result.path.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // Save the session summary to the database
    if (renderedYaml && renderedYaml.result) {
      try {
        const summaryData = {
          study_id: parseInt(studyId),
          study_name: studyName,
          filename: fileName || 'session_summary.md',
          file_path: result.path || null,
          file_url: result.url || null,
          created_by: body.user.id
        };

        const savedSummary = await sessionSummaryService.createOrUpdateSessionSummary(summaryData);
        console.log('✅ Session summary saved to database:', savedSummary.id);
      } catch (error) {
        console.error('⚠️ Warning: Could not save session summary to database:', error);
        // Continue even if saving fails - don't block the user
      }
    }

    // Create note summary from noteDetails array
    const noteSummary = noteDetails.map(note =>
      `• ${note.filename || 'Unknown File'} - Note taker: <@${note.created_by}>`
    ).join('\n');

    // Send the main confirmation message
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `✅ *Note Analysis Completed!*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Note Analysis Completed!*\n\n*Study:* ${studyName}\n${sessionName ? `*Session:* ${sessionName}\n` : ''}*Notes Processed:* ${noteDetails.length} files\n\n*Selected Notes:*\n${noteSummary}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${result.url}|:github: View Session Summary on GitHub>`,
          },
        },
      ],
    });

    // Send the formatted template content in a separate message
    // if (formattedTemplate) {
    //   await client.chat.postEphemeral({
    //     channel: body.user.id,
    //     user: body.user.id,
    //     text: `📋 *Session Summary Report*`,
    //     blocks: [
    //       {
    //         type: 'section',
    //         text: {
    //           type: 'mrkdwn',
    //           text: `📋 *Session Summary Report*\n\n${formattedTemplate}`,
    //         },
    //       },
    //       {
    //         type: 'section',
    //         text: {
    //           type: 'mrkdwn',
    //           text: `<${result.url}|:github: View on GitHub>`,
    //         },
    //       },
    //     ],
    //   });
    // } else {
    //   await client.chat.postEphemeral({
    //     channel: body.user.id,
    //     user: body.user.id,
    //     text: `⚠️ *Template Processing Issue*\n\nThe YAML template was processed but the output format is unexpected. Please check the logs for details.`,
    //   });
    // }

  } catch (error) {
    console.error("Error handling analyze notes submission:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error processing note analysis: ${error.message}`,
    });
  }
};


// Handler for when study selection changes - loads sessions for that study
const handleStudySelectionChange = async ({ ack, body, client }) => {
  try {
    await ack();
    console.log("🎯 Study selection change handler triggered!");

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_test?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      // No study selected, reset to initial state
      console.log("🚀 ~ No study selected, resetting to initial state");
      const studies = await getStudiesByUser(body.user.id);
      await client.views.update({
        view_id: view.id,
        view: analyzeNotesModal(studies, [], [], {
          showStudy: true,
          showSession: false,
          showNotes: false,
        })
      });
      return;
    }

    const studyId = parseInt(selectedStudyOption.value);
    const studyName = selectedStudyOption.text.text;

    // Fetch sessions for the selected study
    let sessions = [];
    try {
      sessions = await sessionObserverService.getObserverRequestsByStudy(studyId);
      console.log(`✅ Loaded ${sessions.length} sessions for study "${studyName}"`);
    } catch (error) {
      console.warn("Warning: Could not fetch sessions:", error.message);
    }

    // Get the studies list to pass back to the modal
    const studies = await getStudiesByUser(body.user.id);

    // Update modal: Show Study (pre-selected) + Session dropdown with dispatch_action
    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      view: analyzeNotesModal(studies, [], sessions, {
        showStudy: true,
        showSession: true,
        showNotes: false,
        selectedStudy: studyId,
      })
    });

  } catch (error) {
    console.error("Error handling study selection change:", error);
  }
};

// Handler for when session selection changes - loads notes for that session
const handleSessionSelectionChange = async ({ ack, body, client }) => {
  try {
    await ack();
    console.log("🎯 Session selection change handler triggered!");

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_test?.selected_option;
    const selectedSessionOption = view.state.values.session_select_block?.analyze_notes_session_select?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      console.log("🚀 ~ No study selected");
      return;
    }

    const studyId = parseInt(selectedStudyOption.value);
    const studyName = selectedStudyOption.text.text;

    // Get the studies list and sessions to pass back to the modal
    const studies = await getStudiesByUser(body.user.id);

    let sessions = [];
    try {
      sessions = await sessionObserverService.getObserverRequestsByStudy(studyId);
    } catch (error) {
      console.warn("Warning: Could not fetch sessions:", error.message);
    }

    if (!selectedSessionOption || selectedSessionOption.value === "no_sessions") {
      // No session selected, show study + session but no notes
      console.log("🚀 ~ No session selected, showing sessions only");
      await client.views.update({
        view_id: view.id,
        hash: view.hash,
        view: analyzeNotesModal(studies, [], sessions, {
          showStudy: true,
          showSession: true,
          showNotes: false,
          selectedStudy: studyId,
        })
      });
      return;
    }

    const sessionId = parseInt(selectedSessionOption.value);
    const sessionName = selectedSessionOption.text.text;

    // Get the session object to extract session_id
    let sessionObject = null;
    try {
      const allSessions = await sessionObserverService.getObserverRequestsByStudy(studyId);
      sessionObject = allSessions.find(s => s.id.toString() === selectedSessionOption.value);
    } catch (error) {
      console.warn("Warning: Could not fetch session details:", error.message);
    }

    // Fetch notes for the specific session using session_id as participant_name
    let studyNotes = [];
    try {
      if (sessionObject && sessionObject.session_id) {
        // Use session_id to filter notes by participant_name
        studyNotes = await studyNotesService.getStudyNotesByParticipantName(sessionObject.session_id);
        console.log(`✅ Loaded ${studyNotes.length} notes for session_id "${sessionObject.session_id}" (session: "${sessionName}")`);
      } else {
        // Fallback: if no session_id found, get all notes for the study
        console.warn("No session_id found in session object, falling back to all study notes");
        const transcriptNotes = await studyNotesService.getStudyNotesByStudyName(studyName, true);
        const nonTranscriptNotes = await studyNotesService.getStudyNotesByStudyName(studyName, false);

        const allNotes = [...transcriptNotes, ...nonTranscriptNotes];
        studyNotes = allNotes.filter((note, index, self) =>
          index === self.findIndex(n => n.id === note.id)
        );
        console.log(`✅ Loaded ${studyNotes.length} notes for study "${studyName}" (fallback)`);
      }
    } catch (error) {
      console.warn("Warning: Could not fetch study notes:", error.message);
    }

    // Transform notes to the format expected by the modal
    const noteFiles = studyNotes.map(note => ({
      id: note.id.toString(),
      filename: note.filename,
      transcript: note.transcript || false,
      author: note.created_by,
      participant_name: note.participant_name,
      session_date: note.session_date,
      session_time: note.session_time,
      study_name: note.study_name,
      file_url: note.file_url
    }));

    // Update modal: Show Study (pre-selected) + Session (pre-selected) + Notes checkboxes
    await client.views.update({
      view_id: view.id,
      hash: view.hash,
      view: analyzeNotesModal(studies, noteFiles, sessions, {
        showStudy: true,
        showSession: true,
        showNotes: true,
        selectedStudy: studyId,
        selectedSession: sessionId,
      })
    });

  } catch (error) {
    console.error("Error handling session selection change:", error);
  }
};

module.exports = {
  analyzeNotesHandler,
  handleAnalyzeNotesSubmission,
  handleStudySelectionChange,
  handleSessionSelectionChange,
};

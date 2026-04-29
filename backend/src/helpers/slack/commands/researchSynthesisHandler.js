const { researchSynthesisModal } = require("../ui/researchSynthesisModal");
const { getStudiesByUser, getResearchStudyWithRoles } = require("../../../services/research_study.service");
const { studyNotesService } = require("../../../services");
const sessionSummaryService = require("../../../services/session-summary.service");
const { getStudyStakeholderGuide } = require("../../../services/study-status.service");
const { getConfigRepo, fetchFileFromRepoByPath, fetchFileFromRepo } = require("../../../helpers/github");
const { processYamlTemplate, extractAiResponsesFromYaml } = require("../../../helpers/yamlProcessor");

// Command handler to open the research synthesis modal
const researchSynthesisHandler = async ({ ack, body, client, command }) => {
  try {
    await ack();

    // Get research studies for the current user
    const studies = await getStudiesByUser(body.user_id);

    // Open the research synthesis modal (empty state - files load when study is selected)
    await client.views.open({
      trigger_id: body.trigger_id,
      view: researchSynthesisModal(studies, null, [], [], null, [])
    });

  } catch (error) {
    console.error("Error opening research synthesis modal:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user_id,
      user: body.user_id,
      text: `❌ Failed to open research synthesis modal: ${error.message}`,
    });
  }
};

// Handler for when study selection changes
const handleStudySelectionChange = async ({ ack, body, client }) => {
  try {
    console.log("🚀 ~ handleStudySelectionChange called");
    await ack();

    const view = body.view;
    console.log("🚀 ~ View state:", JSON.stringify(view.state, null, 2));
    
    if (!view || !view.state || !view.state.values) {
      console.error("🚨 No view state available");
      return;
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;
    console.log("🚀 ~ Selected study option:", selectedStudyOption);

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      // No study selected, update modal to show no files
      console.log("🚀 ~ No study selected, clearing files");
      const studies = await getStudiesByUser(body.user.id);
      await client.views.update({
        view_id: view.id,
        view: researchSynthesisModal(studies, null, [], [], null, [])
      });
      return;
    }

    const studyId = selectedStudyOption.value;
    const studyName = selectedStudyOption.text.text;

    console.log(`🚀 ~ Study selected: ${studyName} (ID: ${studyId}, type: ${typeof studyId})`);

    // Get the selected analysis method from the current view
    const currentAnalysisMethod = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || null;

    // Get the studies list first
    const studies = await getStudiesByUser(body.user.id);

    // Initially update modal with button visible but no files (will trigger button to show)
    console.log("🚀 ~ Updating modal with study selection (button should appear)");
    let updatedModal = researchSynthesisModal(studies, studyId, [], [], currentAnalysisMethod, []);
    
    // Preserve existing private_metadata if any
    if (view.private_metadata) {
      updatedModal.private_metadata = view.private_metadata;
    }

    // First, update modal immediately to show the button
    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

    console.log("✅ Modal updated with Load Files button");

    // Then fetch files in the background and update again
    let sessionSummaries = [];
    try {
      sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(studyId));
      console.log(`✅ Fetched ${sessionSummaries.length} session summaries`);
    } catch (error) {
      console.error("❌ Error fetching session summaries:", error);
    }

    // Fetch only actual transcripts (transcript=true) from study notes
    let transcripts = [];
    try {
      const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(studyId));
      console.log(`✅ Fetched ${allStudyNotes.length} study notes`);

      // Only include notes flagged as transcripts — session notes already
      // appear in the Session Summaries section via sessionSummaryService
      transcripts = allStudyNotes
        .filter(note => note.transcript === true)
        .map(note => ({
          id: note.id,
          filename: note.filename,
          transcript: true,
          file_path: note.file_path,
          file_url: note.file_url,
        }));
      console.log(`✅ Formatted ${transcripts.length} transcripts (filtered from ${allStudyNotes.length} total notes)`);
    } catch (error) {
      console.error("❌ Error fetching transcripts:", error);
    }

    // Fetch stakeholder interview guides
    let stakeholderGuides = [];
    try {
      const selectedStudy = studies.find(s => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        stakeholderGuides = await getStudyStakeholderGuide(selectedStudy.name);
        console.log(`✅ Fetched ${stakeholderGuides.length} stakeholder interview guides`);
      }
    } catch (error) {
      console.error("❌ Error fetching stakeholder guides:", error);
    }

    // Update modal again with loaded files (button will still be visible)
    updatedModal = researchSynthesisModal(studies, studyId, sessionSummaries, transcripts, currentAnalysisMethod, stakeholderGuides);
    
    // Preserve existing private_metadata if any
    if (view.private_metadata) {
      updatedModal.private_metadata = view.private_metadata;
    }

    // Validate the modal structure before updating
    if (!updatedModal.blocks || updatedModal.blocks.length === 0) {
      throw new Error("Generated modal has no blocks");
    }

    // Check for duplicate block_ids
    const blockIds = updatedModal.blocks.map(block => block.block_id).filter(Boolean);
    const uniqueBlockIds = new Set(blockIds);
    if (blockIds.length !== uniqueBlockIds.size) {
      throw new Error("Modal has duplicate block_ids");
    }

    console.log(`🚀 ~ Updating modal with ${sessionSummaries.length} summaries and ${transcripts.length} transcripts`);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

    console.log("✅ Modal updated successfully with files");

  } catch (error) {
    console.error("🚨 Error in handleStudySelectionChange:", error);
    
    // Send error message to user
    try {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Error loading files for selected study: ${error.message}`,
      });
    } catch (ephemeralError) {
      console.error("Failed to send error message:", ephemeralError);
    }
  }
};

// Handler for individual file checkbox changes
const handleFileCheckboxChange = async ({ ack, body, client }) => {
  try {
    await ack();

    const view = body.view;
    if (!view || !view.private_metadata) {
      return;
    }

    // Parse the current metadata to get selected files
    let metadata = {};
    try {
      metadata = JSON.parse(view.private_metadata);
    } catch (error) {
      throw error;
    }

    // Find which file was changed and update its selection status
    const actionId = body.actions[0].action_id;
    const fileId = actionId.replace('file_checkbox_', '');

    if (metadata.selectedFiles) {
      const file = metadata.selectedFiles.find(f => (f.id || f.filename) === fileId);
      if (file) {
        // Toggle the selection status
        file.selected = !file.selected;
      }
    }

    // Update the modal with the new selection
    const studies = await getStudiesByUser(body.user.id);
    const updatedModal = researchSynthesisModal(studies, metadata.selectedFiles || []);
    updatedModal.private_metadata = JSON.stringify(metadata);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

  } catch (error) {
    throw error;
  }
};

// Handler for Load Files button in synthesis modal
const handleLoadSynthesisFiles = async ({ ack, body, client }) => {
  try {
    await ack();

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      console.error("🚨 No view state available");
      return;
    }

    // Get study ID from dropdown selection (priority) or from button value
    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;
    const studyId = selectedStudyOption?.value || 
                    body.actions[0].value;
    
    console.log(`🚀 ~ Load Files - studyId from dropdown: ${selectedStudyOption?.value}, from button: ${body.actions[0].value}`);

    if (!studyId || studyId === "no_studies") {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: "❌ Please select a study first before loading files.",
      });
      return;
    }

    console.log(`🚀 ~ Load Files button clicked for study ID: ${studyId}`);

    // Get the selected analysis method from the current view
    const currentAnalysisMethod = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || null;

    // Fetch session summaries for the selected study
    let sessionSummaries = [];
    try {
      sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(studyId));
      console.log(`✅ Fetched ${sessionSummaries.length} session summaries`);
    } catch (error) {
      console.error("❌ Error fetching session summaries:", error);
    }

    // Fetch transcripts (both transcript=true and transcript=false) from study notes
    let transcripts = [];
    try {
      const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(studyId));
      console.log(`✅ Fetched ${allStudyNotes.length} study notes`);
      
      transcripts = allStudyNotes.map(note => ({
        id: note.id,
        filename: note.filename,
        transcript: note.transcript || false,
        file_path: note.file_path,
        file_url: note.file_url,
      }));
      console.log(`✅ Formatted ${transcripts.length} transcripts`);
    } catch (error) {
      console.error("❌ Error fetching transcripts:", error);
    }

    // Fetch stakeholder interview guides
    let stakeholderGuides = [];
    try {
      const studies = await getStudiesByUser(body.user.id);
      const selectedStudy = studies.find(s => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        stakeholderGuides = await getStudyStakeholderGuide(selectedStudy.name);
        console.log(`✅ Fetched ${stakeholderGuides.length} stakeholder interview guides`);
      }
    } catch (error) {
      console.error("❌ Error fetching stakeholder guides:", error);
    }

    // Get the studies list to pass back to the modal
    const studies = await getStudiesByUser(body.user.id);

    // Update the modal with session summaries, transcripts, and stakeholder guides
    const updatedModal = researchSynthesisModal(studies, studyId, sessionSummaries, transcripts, currentAnalysisMethod, stakeholderGuides);

    // Preserve existing private_metadata if any
    if (view.private_metadata) {
      updatedModal.private_metadata = view.private_metadata;
    }

    console.log(`🚀 ~ Updating modal with ${sessionSummaries.length} summaries and ${transcripts.length} transcripts`);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

    console.log("✅ Files loaded and modal updated successfully");

  } catch (error) {
    console.error("🚨 Error in handleLoadSynthesisFiles:", error);
    
    // Send error message to user
    try {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Error loading files: ${error.message}`,
      });
    } catch (ephemeralError) {
      console.error("Failed to send error message:", ephemeralError);
    }
  }
};

// Handler for Load Study Notes button
const handleLoadStudyNotes = async ({ ack, body, client }) => {
  try {
    await ack();

    const view = body.view;
    if (!view || !view.state || !view.state.values) {
      throw new Error("No view state available");
    }

    const selectedStudyOption = view.state.values.study_select_block?.study_select_synthesize?.selected_option;

    if (!selectedStudyOption || selectedStudyOption.value === "no_studies") {
      // No study selected, show error
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `❌ Please select a study first before loading notes.`,
      });
      return;
    }

    const studyId = selectedStudyOption.value;
    const studyName = selectedStudyOption.text.text;

    // Get the selected analysis method from the current view
    const currentAnalysisMethod = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value || null;

    // Fetch session summaries for the selected study
    let sessionSummaries = [];
    try {
      sessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(studyId));
    } catch (error) {
      console.error("Error fetching session summaries:", error);
    }

    // Fetch transcripts (both transcript=true and transcript=false) from study notes
    let transcripts = [];
    try {
      const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(studyId));
      transcripts = allStudyNotes.map(note => ({
        id: note.id,
        filename: note.filename,
        transcript: note.transcript || false,
        file_path: note.file_path,
        file_url: note.file_url,
      }));
    } catch (error) {
      console.error("Error fetching transcripts:", error);
    }

    // Get the studies list first
    const studies = await getStudiesByUser(body.user.id);

    // Fetch stakeholder interview guides
    let stakeholderGuides = [];
    try {
      const selectedStudy = studies.find(s => s.id.toString() === studyId.toString());
      if (selectedStudy) {
        stakeholderGuides = await getStudyStakeholderGuide(selectedStudy.name);
      }
    } catch (error) {
      console.error("Error fetching stakeholder guides:", error);
    }

    // Update the modal with session summaries, transcripts, and stakeholder guides
    const updatedModal = researchSynthesisModal(studies, studyId, sessionSummaries, transcripts, currentAnalysisMethod, stakeholderGuides);

    await client.views.update({
      view_id: view.id,
      view: updatedModal
    });

  } catch (error) {
    throw error;
  }
};

// View submission handler for research synthesis modal
const handleResearchSynthesisSubmission = async ({ ack, body, view, client }) => {
  try {
    await ack();

    // Extract form data
    const selectedStudyName = view.state.values.study_select_block?.study_select_synthesize?.selected_option?.text?.text;
    const selectedStudyId = view.state.values.study_select_block?.study_select_synthesize?.selected_option?.value;
    const analysisMethod = view.state.values.analysis_method_selection?.analysis_method?.selected_option?.value;

    // Extract selected session summaries from all checkbox blocks (may be split across multiple blocks)
    let selectedSessionSummaries = [];
    Object.keys(view.state.values).forEach(key => {
      if (key.startsWith('session_summaries_list_')) {
        const blockValues = view.state.values[key]?.session_summaries_checkboxes?.selected_options || [];
        selectedSessionSummaries = selectedSessionSummaries.concat(blockValues);
      }
    });
    // Fallback to single block format
    if (selectedSessionSummaries.length === 0) {
      selectedSessionSummaries = view.state.values.session_summaries_list?.session_summaries_checkboxes?.selected_options || [];
    }
    const selectedSummaryIds = selectedSessionSummaries.map(opt => opt.value.replace('summary_', ''));

    // Extract selected transcripts from all checkbox blocks (may be split across multiple blocks)
    let selectedTranscripts = [];
    Object.keys(view.state.values).forEach(key => {
      if (key.startsWith('transcripts_list_')) {
        const blockValues = view.state.values[key]?.transcripts_checkboxes?.selected_options || [];
        selectedTranscripts = selectedTranscripts.concat(blockValues);
      }
    });
    // Fallback to single block format
    if (selectedTranscripts.length === 0) {
      selectedTranscripts = view.state.values.transcripts_list?.transcripts_checkboxes?.selected_options || [];
    }
    const selectedTranscriptIds = selectedTranscripts.map(opt => opt.value.replace('transcript_', ''));

    // Extract selected stakeholder guides from all checkbox blocks
    let selectedStakeholderGuides = [];
    Object.keys(view.state.values).forEach(key => {
      if (key.startsWith('stakeholder_guides_list_')) {
        const blockValues = view.state.values[key]?.stakeholder_guides_checkboxes?.selected_options || [];
        selectedStakeholderGuides = selectedStakeholderGuides.concat(blockValues);
      }
    });
    // Fallback to single block format
    if (selectedStakeholderGuides.length === 0) {
      selectedStakeholderGuides = view.state.values.stakeholder_guides_list?.stakeholder_guides_checkboxes?.selected_options || [];
    }
    const selectedStakeholderGuideIds = selectedStakeholderGuides.map(opt => opt.value.replace('guide_', ''));

    // Extract context data checkboxes
    const contextDataCheckboxes = view.state.values.context_data_list?.context_data_checkboxes?.selected_options || [];
    const includeParticipantTracker = contextDataCheckboxes.some(option => option.value === 'participant_tracker');
    const includeResearchPlan = contextDataCheckboxes.some(option => option.value === 'research_plan');

    // Validate required fields
    if (!selectedStudyId || selectedStudyId === "no_studies") {
      throw new Error("Please select a valid research study");
    }

    if (!analysisMethod) {
      throw new Error("Please select an analysis method");
    }

    // At least one file must be selected
    if (selectedSummaryIds.length === 0 && selectedTranscriptIds.length === 0 && selectedStakeholderGuideIds.length === 0 && !includeParticipantTracker && !includeResearchPlan) {
      throw new Error("Please select at least one file or data source for analysis.");
    }

    const study = await getResearchStudyWithRoles(selectedStudyName);

    // Fetch files based on selected checkboxes
    let allFiles = [];

    // Fetch selected session summaries
    if (selectedSummaryIds.length > 0) {
      try {
        const allSessionSummaries = await sessionSummaryService.getSessionSummariesByStudyId(parseInt(selectedStudyId));
        const selectedSummaries = allSessionSummaries.filter(summary => 
          selectedSummaryIds.includes(summary.id.toString())
        );
        allFiles = allFiles.concat(selectedSummaries.map(summary => ({
          ...summary,
          file_type: 'session_summary',
          file_path: summary.file_path
        })));
      } catch (error) {
        console.error("Error fetching session summaries:", error);
      }
    }

    // Fetch selected transcripts
    if (selectedTranscriptIds.length > 0) {
      try {
        const allStudyNotes = await studyNotesService.getStudyNotesByStudyId(parseInt(selectedStudyId));
        const selectedNotes = allStudyNotes.filter(note => 
          selectedTranscriptIds.includes(note.id.toString())
        );
        allFiles = allFiles.concat(selectedNotes.map(note => ({
          ...note,
          file_type: note.transcript ? 'transcript' : 'study_note',
          file_path: note.file_path || note.path
        })));
      } catch (error) {
        console.error("Error fetching transcripts:", error);
      }
    }

    // Fetch selected stakeholder guides
    if (selectedStakeholderGuideIds.length > 0) {
      try {
        const allStakeholderGuides = await getStudyStakeholderGuide(selectedStudyName);
        const selectedGuides = allStakeholderGuides.filter(guide => 
          selectedStakeholderGuideIds.includes(guide.id.toString())
        );
        allFiles = allFiles.concat(selectedGuides.map(guide => {
          // Extract file path from GitHub URL if needed
          let filePath = guide.path;
          if (filePath && filePath.includes('github.com')) {
            // Extract path from GitHub URL: 
            // https://github.com/org/repo/blob/branch/path/to/file.md
            // https://github.com/org/repo/tree/branch/path/to/file.md
            // Convert to: path/to/file.md
            const urlMatch = filePath.match(/github\.com\/[^/]+\/[^/]+\/(?:blob|tree)\/[^/]+\/(.+)$/);
            if (urlMatch) {
              filePath = decodeURIComponent(urlMatch[1]);
            } else {
              console.warn(`⚠️ Could not extract file path from URL: ${filePath}`);
              filePath = null;
            }
          }
          return {
            ...guide,
            file_type: 'stakeholder_guide',
            file_path: filePath,
            filename: guide.file_name || filePath?.split('/').pop() || 'Unknown'
          };
        }));
      } catch (error) {
        console.error("Error fetching stakeholder guides:", error);
      }
    }

    // TODO: Fetch participant tracker if selected
    if (includeParticipantTracker) {
      // Implementation needed
      console.log("Participant tracker selected - implementation needed");
    }

    // TODO: Fetch research plan if selected
    if (includeResearchPlan) {
      // Implementation needed
      console.log("Research plan selected - implementation needed");
    }

    if (allFiles.length === 0) {
      throw new Error("No files found for the selected study. Please check if files exist for the selected study.");
    }

    // Fetch file contents from GitHub in parallel for better performance
    console.log(`🚀 ~ Fetching content for ${allFiles.length} files in parallel...`);

    const fileContentPromises = allFiles.map(async (file) => {
      try {
        if (!file.file_path) {
          console.warn(`🚀 ~ No file path available for file: ${file.filename}`);
          return {
            ...file,
            content: '[No file path available]',
            githubPath: null
          };
        }

        const githubFile = await fetchFileFromRepoByPath(process.env.GITHUB_REPO, file.file_path);
        return {
          ...file,
          content: githubFile.content || '[Content not available]',
          githubPath: file.file_path
        };
      } catch (error) {
        console.error(`🚀 ~ Error fetching file ${file.filename}:`, error.message);
        return {
          ...file,
          content: `[Error fetching content: ${error.message}]`,
          githubPath: file.file_path || 'unknown'
        };
      }
    });

    // Wait for all file content to be fetched in parallel
    const filesWithContent = await Promise.all(fileContentPromises);
    console.log(`🚀 ~ Successfully fetched content for ${filesWithContent.length} files`);

    // Create simplified data object structure
    const analysisData = {
      // Core required fields
      selected_study: selectedStudyName,
      selected_session_summaries: selectedSummaryIds,
      selected_transcripts: selectedTranscriptIds,
      selected_stakeholder_guides: selectedStakeholderGuideIds,
      include_participant_tracker: includeParticipantTracker,
      include_research_plan: includeResearchPlan,

      // Default for service_blueprint.yaml (no modal UI element for this yet)
      blueprint_scope: 'end_to_end',

      // Combined content of all files
      combined_file_content: filesWithContent.map(f => f.content).join('\n\n---\n\n')
    };


    // Map analysis methods to their corresponding YAML files
    const analysisYamlMapping = {
      'affinity_mapping': 'affinity_mapping.yaml',
      'journey_mapping': 'journey_mapping.yaml',
      'persona_generation': 'persona_generator.yaml',
      'jobs_to_be_done': 'jobs_to_be_done.yaml',
      'usability_issues': 'usability_issues_extractor.yaml',
      'design_opportunities': 'design_opportunity_generator.yaml',
      'service_blueprint': 'service_blueprint.yaml'
    };

    // Fetch the appropriate YAML file based on the selected analysis method
    const yamlFileName = analysisYamlMapping[analysisMethod];
    if (!yamlFileName) {
      throw new Error(`Unknown analysis method: ${analysisMethod}`);
    }

    try {
      const yamlTemplateFile = await fetchFileFromRepo(getConfigRepo(), "beta-test/YAML Templates", yamlFileName);

      // Process the specific analysis YAML with the simplified data
      const renderedAnalysis = await processYamlTemplate(yamlTemplateFile.content, analysisData, study?.path);
      console.log("🚀 ~ handleResearchSynthesisSubmission ~ renderedAnalysis:", renderedAnalysis)

      // Extract first two lines from outputTemplate for channel message
      const outputLines = renderedAnalysis.outputTemplate.split('\n').filter(line => line.trim());
      const firstTwoLines = outputLines.slice(0, 2).join('\n');

      // Send confirmation message with GitHub link using blocks (DM)
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `🎯 *Research Synthesis Complete!*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎯 *Research Synthesis Complete!*\n\n*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod}\n*Files Analyzed:* ${filesWithContent.length} files\n• Session Summaries: ${filesWithContent.filter(f => f.file_type === 'session_summary').length}\n• Transcripts: ${filesWithContent.filter(f => f.file_type === 'transcript' || f.file_type === 'study_note').length}\n• Stakeholder Guides: ${filesWithContent.filter(f => f.file_type === 'stakeholder_guide').length}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `<${renderedAnalysis.result.url}|:github: View on GitHub>`,
            },
          },
        ],
      });

      // Send channel message with synthesis preview and GitHub link
      if (study?.channel_name) {
        await client.chat.postMessage({
          channel: study.channel_name,
          text: `🎯 *Research Synthesis Complete!*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: firstTwoLines,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod}\n*Files Analyzed:* ${filesWithContent.length} files`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `📊 *To see the complete synthesis and detailed insights, please visit:*\n<${renderedAnalysis.result.url}|:github: View Full Analysis on GitHub>`,
              },
            },
          ],
        });
      }

    } catch (error) {
      console.error(`🚀 ~ Error processing analysis YAML ${yamlFileName}:`, error.message);
      // Continue with basic processing if analysis YAML fails

      // Send confirmation message without GitHub link if processing failed
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `🎯 *Research Synthesis Started!*\n\n*Study:* ${selectedStudyName}\n*Method:* ${analysisMethod}\n*Files:* ${filesWithContent.length} files selected\n\nAnalysis is being processed...`,
      });
    }

  } catch (error) {
    console.error("Error handling research synthesis submission:", error);

    // Send error message to user
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `❌ Error: ${error.message}`,
    });
  }
};

module.exports = {
  researchSynthesisHandler,
  handleResearchSynthesisSubmission,
  handleStudySelectionChange,
  handleFileCheckboxChange,
  handleLoadStudyNotes,
  handleLoadSynthesisFiles
};

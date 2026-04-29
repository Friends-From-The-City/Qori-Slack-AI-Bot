// Simple helper to extract date string from Date object or string
const getDateString = (dateValue) => {
  if (!dateValue) return '';
  if (dateValue instanceof Date) return dateValue.toISOString().split('T')[0];
  if (typeof dateValue === 'string') return dateValue.split(/[T ]/)[0];
  return '';
};

const researchSynthesisModal = (
  researchStudies = [],
  selectedStudyId = null,
  sessionSummaries = [],
  transcripts = [],
  selectedAnalysisMethod = null,
  stakeholderGuides = []
) => {
  // Helper function to get analysis method display name
  const getAnalysisMethodName = (method) => {
    const methodMap = {
      'affinity_mapping': 'Affinity Mapping',
      'journey_mapping': 'Journey Mapping',
      'persona_generation': 'Persona Generation',
      'jobs_to_be_done': 'Jobs to Be Done',
      'usability_issues': 'Usability Issues',
      'design_opportunities': 'Design Opportunities',
      'survey_synthesis': 'Survey Synthesis',
    };
    return methodMap[method] || 'Affinity Mapping';
  };
  // Build research study options
  const studyOptions = researchStudies.slice(0, 10).map((study) => ({
    text: {
      type: "plain_text",
      text: study.name,
    },
    value: study.id.toString(),
  }));

  // Find selected study
  const selectedStudy = researchStudies.find(s => s.id.toString() === selectedStudyId?.toString());

  // Debug logging
  console.log(`🔍 Modal - selectedStudyId: ${selectedStudyId}, type: ${typeof selectedStudyId}`);
  console.log(`🔍 Modal - Will show button: ${selectedStudyId && selectedStudyId !== "no_studies" && selectedStudyId !== null}`);

  // Format session summaries as checkboxes
  const sessionSummaryOptions = sessionSummaries.map((summary, index) => {
    const displayName = summary.participant_name || 
                       summary.participant_id || 
                       summary.session_id || 
                       `Session ${index + 1}`;
    const displayDate = getDateString(summary.created_at) || '';
    const fileName = summary.filename || summary.file_name || '';
    const displayText = fileName || `${displayName}${displayDate ? ` - ${displayDate}` : ''}`;
    
    return {
      text: {
        type: "plain_text",
        text: displayText.length > 75 ? displayText.substring(0, 72) + '...' : displayText,
      },
      value: `summary_${summary.id}`,
    };
  });

  // Format transcripts as checkboxes (both transcript=true and transcript=false)
  const transcriptOptions = transcripts.map((transcript, index) => {
    const fileName = transcript.filename;
    
    return {
      text: {
        type: "plain_text",
        text: fileName.length > 75 ? fileName.substring(0, 72) + '...' : fileName,
      },
      value: `transcript_${transcript.id}`,
    };
  });

  // Format stakeholder notes & synthesis as checkboxes
  const stakeholderGuideOptions = stakeholderGuides.map((guide, index) => {
    const fileName = guide.file_name || guide.path?.split('/').pop() || `Stakeholder File ${index + 1}`;
    
    return {
      text: {
        type: "plain_text",
        text: fileName.length > 75 ? fileName.substring(0, 72) + '...' : fileName,
      },
      value: `guide_${guide.id}`,
    };
  });

  // Count selected files
  const summariesCount = sessionSummaryOptions.length;
  const transcriptsCount = transcriptOptions.length;
  const stakeholderGuidesCount = stakeholderGuideOptions.length;
  const totalFiles = summariesCount + transcriptsCount + stakeholderGuidesCount;

  // Store metadata
  const privateMetadata = JSON.stringify({
    selectedStudyId,
    sessionSummaries,
    transcripts,
    stakeholderGuides,
    selectedAnalysisMethod,
  });

  return {
    type: "modal",
    callback_id: "research-synthesis-modal",
    title: {
      type: "plain_text",
      text: "Synthesize Study",
    },
    submit: {
      type: "plain_text",
      text: "Run Analysis",
    },
    close: {
      type: "plain_text",
      text: "Cancel",
    },
    private_metadata: privateMetadata,
    blocks: [
      // Study Selection Section
      { type: "section", text: { type: "mrkdwn", text: "📁 *Study*" } },
      {
        type: "input",
        block_id: "study_select_block",
        label: { type: "plain_text", text: "Study *" },
        element: {
          type: "static_select",
          action_id: "study_select_synthesize",
          placeholder: { type: "plain_text", text: "Select a study..." },
          options: studyOptions.length > 0 ? studyOptions : [
            { text: { type: "plain_text", text: "No research studies found" }, value: "no_studies" },
          ],
          initial_option: selectedStudy ? {
            text: { type: "plain_text", text: selectedStudy.name },
            value: selectedStudy.id.toString(),
          } : undefined,
        },
        hint: { type: "plain_text", text: "Select the study folder" },
      },
      

      { type: "divider" },

      // Analysis Type Section
      { type: "section", text: { type: "mrkdwn", text: "🎯 *Analysis Type*" } },
      { type: "context", elements: [ { type: "mrkdwn", text: "Choose the type of synthesis" } ] },
      (() => {
        const analysisMethodOptions = [
          {
            text: { type: "plain_text", text: "🗂️ Affinity Mapping • Group findings" },
            value: "affinity_mapping",
          },
          {
            text: { type: "plain_text", text: "🗺️ Journey Mapping • Map experiences" },
            value: "journey_mapping",
          },
          {
            text: { type: "plain_text", text: "👤 Persona Generation • Create personas" },
            value: "persona_generation",
          },
          {
            text: { type: "plain_text", text: "🎯 Jobs to Be Done • Extract user jobs" },
            value: "jobs_to_be_done",
          },
          {
            text: { type: "plain_text", text: "⚠️ Usability Issues • Prioritize problems" },
            value: "usability_issues",
          },
          {
            text: { type: "plain_text", text: "💡 Design Opportunities • Generate HMWs" },
            value: "design_opportunities",
          },
          {
            text: { type: "plain_text", text: "🔧 Service Blueprint • Map backstage" },
            value: "service_blueprint",
          },
        ];

        const methodValue = selectedAnalysisMethod || "affinity_mapping";
        const matchingOption = analysisMethodOptions.find(opt => opt.value === methodValue);
        const initialOption = matchingOption || analysisMethodOptions[0];

        return {
          type: "input",
          block_id: "analysis_method_selection",
          label: { type: "plain_text", text: "Analysis method *" },
          element: {
            type: "radio_buttons",
            action_id: "analysis_method",
            options: analysisMethodOptions,
            initial_option: initialOption,
          },
        };
      })(),

      { type: "divider" },

       // Data Sources Section
       { type: "section", text: { type: "mrkdwn", text: "📄 *Data Sources*" } },
       { type: "context", elements: [ { type: "mrkdwn", text: "Select files to include" } ] },

      // Load Files Button (always show when studies are available)
      ...(studyOptions.length > 0 && studyOptions[0].value !== "no_studies" ? [
        {
          type: "actions",
          block_id: "load_files_button_block",
          elements: [
            {
              type: "button",
              text: { 
                type: "plain_text", 
                text: sessionSummaries.length === 0 && transcripts.length === 0 
                  ? "📁 Load Files" 
                  : "🔄 Refresh Files",
                emoji: true 
              },
              action_id: "load_synthesis_files",
              style: "primary",
              // Use first study ID as fallback if no study is selected yet
              value: selectedStudyId ? String(selectedStudyId) : (selectedStudy ? String(selectedStudy.id) : (studyOptions[0]?.value || "default")),
            },
          ],
        },
      ] : []),


      // Session Summaries
      {
        type: "section",
        block_id: "session_summaries_header",
        text: {
          type: "mrkdwn",
          text: `*Session Summaries*\n${summariesCount} ${summariesCount === 1 ? 'file' : 'files'} available`,
        },
      },
      ...(sessionSummaryOptions.length > 0 ? (() => {
        // Split into chunks of 10 (Slack limit)
        const chunks = [];
        for (let i = 0; i < sessionSummaryOptions.length; i += 10) {
          chunks.push(sessionSummaryOptions.slice(i, i + 10));
        }
        return chunks.map((chunk, chunkIndex) => ({
          type: "section",
          block_id: `session_summaries_list_${chunkIndex}`,
          text: { 
            type: "mrkdwn", 
            text: chunkIndex === 0 ? "Select session summaries:" : `_Additional summaries (${chunkIndex + 1}/${chunks.length}):_` 
          },
          accessory: {
            type: "checkboxes",
            action_id: "session_summaries_checkboxes",
            options: chunk,
          },
        }));
      })() : [
        {
          type: "context",
          elements: [ { type: "mrkdwn", text: "No session summaries available for this study." } ],
        },
      ]),

      // Transcripts
      {
        type: "section",
        block_id: "transcripts_header",
        text: {
          type: "mrkdwn",
          text: `*Transcripts*\n${transcriptsCount} ${transcriptsCount === 1 ? 'file' : 'files'} available`,
        },
      },
      ...(transcriptOptions.length > 0 ? (() => {
        // Split into chunks of 10 (Slack limit)
        const chunks = [];
        for (let i = 0; i < transcriptOptions.length; i += 10) {
          chunks.push(transcriptOptions.slice(i, i + 10));
        }
        return chunks.map((chunk, chunkIndex) => ({
          type: "section",
          block_id: `transcripts_list_${chunkIndex}`,
          text: { 
            type: "mrkdwn", 
            text: chunkIndex === 0 ? "Select transcripts:" : `_Additional transcripts (${chunkIndex + 1}/${chunks.length}):_` 
          },
          accessory: {
            type: "checkboxes",
            action_id: "transcripts_checkboxes",
            options: chunk,
          },
        }));
      })() : [
        {
          type: "context",
          elements: [ { type: "mrkdwn", text: "No transcripts available for this study." } ],
        },
      ]),

      // Stakeholder Notes & Synthesis
      {
        type: "section",
        block_id: "stakeholder_guides_header",
        text: {
          type: "mrkdwn",
          text: `*Stakeholder Notes & Synthesis*\n${stakeholderGuidesCount} ${stakeholderGuidesCount === 1 ? 'file' : 'files'} available`,
        },
      },
      ...(stakeholderGuideOptions.length > 0 ? (() => {
        // Split into chunks of 10 (Slack limit)
        const chunks = [];
        for (let i = 0; i < stakeholderGuideOptions.length; i += 10) {
          chunks.push(stakeholderGuideOptions.slice(i, i + 10));
        }
        return chunks.map((chunk, chunkIndex) => ({
          type: "section",
          block_id: `stakeholder_guides_list_${chunkIndex}`,
          text: { 
            type: "mrkdwn", 
            text: chunkIndex === 0 ? "Select stakeholder files:" : `_Additional files (${chunkIndex + 1}/${chunks.length}):_` 
          },
          accessory: {
            type: "checkboxes",
            action_id: "stakeholder_guides_checkboxes",
            options: chunk,
          },
        }));
      })() : [
        {
          type: "context",
          elements: [ { type: "mrkdwn", text: "No stakeholder notes or synthesis available for this study." } ],
        },
      ]),

      // Context Data
      // {
      //   type: "section",
      //   block_id: "context_data_header",
      //   text: {
      //     type: "mrkdwn",
      //     text: "👥 *Context Data*",
      //   },
      // },
      // {
      //   type: "section",
      //   block_id: "context_data_list",
      //   text: { type: "mrkdwn", text: "Select context files:" },
      //   accessory: {
      //     type: "checkboxes",
      //     action_id: "context_data_checkboxes",
      //     options: [
      //       {
      //         text: { type: "plain_text", text: "Participant Tracker" },
      //         value: "participant_tracker",
      //       },
      //       {
      //         text: { type: "plain_text", text: "Research Plan" },
      //         value: "research_plan",
      //       },
      //     ],
      //   },
      // },

      // Selection Summary
      // {
      //   type: "section",
      //   block_id: "selection_summary",
      //   fields: [
      //     { type: "mrkdwn", text: `*Total files:*\n${totalFiles}` },
      //     { type: "mrkdwn", text: `*Analysis:*\n${getAnalysisMethodName(selectedAnalysisMethod || 'affinity_mapping')}` },
      //   ],
      // },

    ],
  };
};

module.exports = { researchSynthesisModal };

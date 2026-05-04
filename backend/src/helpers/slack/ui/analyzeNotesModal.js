const { generateFileCheckboxOptions } = require("../../generateFileCheckboxOptions");

const analyzeNotesModal = (researchStudies = [], noteFiles = [], sessions = [], options = {}) => {
  const {
    showStudy = true,
    showSession = false,
    showNotes = false,
    selectedStudy = null,
    selectedSession = null,
    cascadeContext = null,
  } = options;

  // Build research study options dynamically (limit to 10 to avoid Slack's limit)
  const studyOptions = researchStudies.slice(0, 10).map((study) => ({
    text: {
      type: "plain_text",
      text: study.name,
      emoji: true,
    },
    value: study.id.toString(),
  }));

  // Find selected study option for initial_option
  const selectedStudyOption = selectedStudy
    ? studyOptions.find(opt => opt.value === selectedStudy.toString())
    : null;

  // Build session options dynamically (limit to 10 to avoid Slack's limit)
  const sessionOptions = sessions.slice(0, 10).map((session) => ({
    text: {
      type: "plain_text",
      text: `${session.participant?.participant_name || 'Unknown Participant'} - ${session.participant?.scheduled_date || 'No Date'} ${session.participant?.scheduled_time || ''}`.trim(),
      emoji: true,
    },
    value: session.id.toString(),
  }));

  // Find selected session option for initial_option
  const selectedSessionOption = selectedSession
    ? sessionOptions.find(opt => opt.value === selectedSession.toString())
    : null;

  // Split note files into transcripts and observer notes
  const transcriptFiles = noteFiles.filter(f => f.transcript === true);
  const observerNoteFiles = noteFiles.filter(f => f.transcript !== true);

  // Build transcript options (radio — select one)
  const transcriptOptions = transcriptFiles.slice(0, 10).map((file) => ({
    text: {
      type: "plain_text",
      text: (file.filename || 'Unknown').length > 75
        ? file.filename.substring(0, 72) + '...'
        : file.filename || 'Unknown',
    },
    value: file.id.toString(),
  }));

  // Build observer note options (checkboxes — select many, optional)
  const observerNoteOptions = observerNoteFiles.slice(0, 10).map((file) => ({
    key: file.id || file.filename,
    label: `${file.filename}\n${file.participant_name || ''} • ${file.session_date || ''} • ${file.session_time || ''}`,
  }));

  const blocks = [];

  // Section 1: Select Research Study (always shown if showStudy is true)
  if (showStudy) {
    blocks.push({
      type: "section",
      block_id: "research_study_header",
      text: {
        type: "mrkdwn",
        text: "*Research Study*",
      },
    });

    const studySelectElement = {
      type: "static_select",
      action_id: "study_select_test",
      placeholder: {
        type: "plain_text",
        text: "Choose a research study...",
      },
      options: studyOptions.length > 0 ? studyOptions : [
        {
          text: {
            type: "plain_text",
            text: "No research studies found",
          },
          value: "no_studies",
        },
      ],
    };

    // Preserve selection if study was already selected
    if (selectedStudyOption) {
      studySelectElement.initial_option = selectedStudyOption;
    }

    blocks.push({
      type: "input",
      block_id: "study_select_block",
      dispatch_action: true,
      label: {
        type: "plain_text",
        text: "Study *",
        emoji: false,
      },
      element: studySelectElement,
    });

    if (researchStudies.length > 10) {
      blocks.push({
        type: "context",
        block_id: "studies_limit_warning",
        elements: [
          {
            type: "mrkdwn",
            text: `*Note:* Showing first 10 of ${researchStudies.length} available studies.`,
          },
        ],
      });
    }
  }

  // Cascade Context: Show upstream brief variables when available
  if (cascadeContext && showSession) {
    blocks.push({
      type: "divider",
    });

    const contextLines = [];
    if (cascadeContext.barrierCount > 0) {
      contextLines.push(`*${cascadeContext.barrierCount}* target barrier${cascadeContext.barrierCount !== 1 ? 's' : ''} to validate`);
    }
    if (cascadeContext.questionCount > 0) {
      contextLines.push(`*${cascadeContext.questionCount}* research question${cascadeContext.questionCount !== 1 ? 's' : ''} to address`);
    }
    if (cascadeContext.methodology) {
      contextLines.push(`Method: ${cascadeContext.methodology}`);
    }

    blocks.push({
      type: "section",
      block_id: "cascade_context_section",
      text: {
        type: "mrkdwn",
        text: `*Cascade Context*\n\nBrief approved — analyzing against:\n${contextLines.map(l => `  •  ${l}`).join('\n')}\n\nSession summary will reference these upstream inputs.`,
      },
    });
  }

  // Section 2: Select Session (shown when showSession is true)
  if (showSession) {
    blocks.push({
      type: "divider",
    });

    blocks.push({
      type: "section",
      block_id: "session_header",
      text: {
        type: "mrkdwn",
        text: "*Session*",
      },
    });

    const sessionSelectElement = {
      type: "static_select",
      action_id: "analyze_notes_session_select",
      placeholder: {
        type: "plain_text",
        text: sessions.length > 0 ? "Choose a session..." : "No sessions available",
      },
      options: sessionOptions.length > 0 ? sessionOptions : [
        {
          text: {
            type: "plain_text",
            text: "No sessions available",
          },
          value: "no_sessions",
        },
      ],
    };

    if (selectedSessionOption) {
      sessionSelectElement.initial_option = selectedSessionOption;
    }

    blocks.push({
      type: "input",
      block_id: "session_select_block",
      dispatch_action: true,
      label: {
        type: "plain_text",
        text: "Session *",
        emoji: false,
      },
      element: sessionSelectElement,
    });

    if (sessions.length > 10) {
      blocks.push({
        type: "context",
        block_id: "sessions_limit_warning",
        elements: [
          {
            type: "mrkdwn",
            text: `*Note:* Showing first 10 of ${sessions.length} available sessions.`,
          },
        ],
      });
    }
  }

  // Section 3: Session Transcript (required) + Observer Notes (optional)
  if (showNotes) {
    blocks.push({
      type: "divider",
    });

    // Section 3a: Session Transcript (required)
    blocks.push({
      type: "section",
      block_id: "transcript_selection_header",
      text: {
        type: "mrkdwn",
        text: `*Session Transcript*\n${transcriptFiles.length > 0 ? 'Select the session transcript to analyze. This is the primary source for the summary.' : 'No transcripts available for this session.'}`,
      },
    });

    if (transcriptOptions.length > 0) {
      blocks.push({
        type: "input",
        block_id: "transcript_select_block",
        label: {
          type: "plain_text",
          text: "Transcript *",
          emoji: false,
        },
        element: {
          type: "static_select",
          action_id: "transcript_select",
          placeholder: {
            type: "plain_text",
            text: "Choose transcript...",
          },
          options: transcriptOptions,
        },
      });
    } else {
      blocks.push({
        type: "context",
        block_id: "no_transcripts_warning",
        elements: [
          {
            type: "mrkdwn",
            text: "No transcripts available. Upload a session transcript first via `/qori-notes`.",
          },
        ],
      });
    }

    // Section 3b: Observer Notes (optional)
    blocks.push({
      type: "divider",
    });

    blocks.push({
      type: "section",
      block_id: "notes_selection_header",
      text: {
        type: "mrkdwn",
        text: `*Observer Notes (optional)*\n${observerNoteFiles.length > 0 ? 'Select observer notes to include as supporting context.' : 'No observer notes available for this session.'}`,
      },
    });

    if (observerNoteOptions.length > 0) {
      blocks.push({
        type: "input",
        block_id: "notes_select_block",
        optional: true,
        label: {
          type: "plain_text",
          text: "Observer Notes",
          emoji: false,
        },
        element: {
          type: "checkboxes",
          action_id: "notes_select",
          options: generateFileCheckboxOptions(observerNoteOptions),
        },
      });
    } else {
      blocks.push({
        type: "context",
        block_id: "no_notes_info",
        elements: [
          {
            type: "mrkdwn",
            text: "No observer notes available. The summary will be generated from the transcript only.",
          },
        ],
      });
    }
  }

  // Submit button text based on state
  const submitButtonText = showNotes && (transcriptOptions.length > 0)
    ? "Analyze"
    : showSession
      ? "Continue"
      : "Continue";

  return {
    type: "modal",
    callback_id: "analyze_notes_submit",
    title: {
      type: "plain_text",
      text: "Analyze Session",
      emoji: false,
    },
    close: {
      type: "plain_text",
      text: "Cancel",
      emoji: false,
    },
    submit: {
      type: "plain_text",
      text: submitButtonText,
      emoji: false,
    },
    private_metadata: "{\"source\":\"slack\"}",
    blocks,
  };
};

module.exports = { analyzeNotesModal };

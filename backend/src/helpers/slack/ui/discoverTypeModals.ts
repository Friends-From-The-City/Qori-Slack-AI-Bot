/**
 * Type-specific discovery modals — one per discovery type.
 *
 * Each modal has type-appropriate fields, file types, and context copy.
 * Opened via views.update from the discovery hub when researcher
 * clicks a "Start" button.
 */

export const discoverDeskResearchModal = {
  type: "modal",
  callback_id: "discover_desk_research_modal",
  title: {
    type: "plain_text",
    text: "Desk Research",
  },
  submit: {
    type: "plain_text",
    text: "Analyze",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Upload reports, competitive analysis, or background docs. Qori extracts barriers, metrics, and knowledge gaps.",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "topic_block",
      label: {
        type: "plain_text",
        text: "What topic are you exploring?",
      },
      hint: {
        type: "plain_text",
        text: "Used as the artifact name",
      },
      element: {
        type: "plain_text_input",
        action_id: "topic",
        placeholder: {
          type: "plain_text",
          text: "e.g., Veteran telehealth adoption barriers",
        },
      },
    },
    {
      type: "input",
      block_id: "description_block",
      label: {
        type: "plain_text",
        text: "What do you need this source to tell you?",
      },
      hint: {
        type: "plain_text",
        text: "How this source relates to the project problem. Gaps are derived against this.",
      },
      element: {
        type: "plain_text_input",
        action_id: "description",
        placeholder: {
          type: "plain_text",
          text: "e.g., What barriers do Veterans face with claim status tracking?",
        },
        multiline: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "file_upload_block",
      label: {
        type: "plain_text",
        text: "Upload files",
      },
      hint: {
        type: "plain_text",
        text: "PDF, Word, text, or markdown — up to 10 files",
      },
      element: {
        type: "file_input",
        action_id: "file_upload",
        filetypes: ["pdf", "docx", "doc", "txt", "md"],
        max_files: 10,
      },
    },
  ],
};

export const discoverStakeholderModal = {
  type: "modal",
  callback_id: "discover_stakeholder_modal",
  title: {
    type: "plain_text",
    text: "Stakeholder Synthesis",
  },
  submit: {
    type: "plain_text",
    text: "Analyze",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Upload interview transcripts or stakeholder notes. Qori extracts constraints, priorities, and alignment gaps.",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "topic_block",
      label: {
        type: "plain_text",
        text: "What topic are you exploring?",
      },
      hint: {
        type: "plain_text",
        text: "Used as the artifact name",
      },
      element: {
        type: "plain_text_input",
        action_id: "topic",
        placeholder: {
          type: "plain_text",
          text: "e.g., Claims process stakeholder interviews",
        },
      },
    },
    {
      type: "input",
      block_id: "description_block",
      label: {
        type: "plain_text",
        text: "What do you need this source to tell you?",
      },
      hint: {
        type: "plain_text",
        text: "How this source relates to the project problem. Gaps are derived against this.",
      },
      element: {
        type: "plain_text_input",
        action_id: "description",
        placeholder: {
          type: "plain_text",
          text: "e.g., What constraints do internal teams face with claims processing?",
        },
        multiline: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "file_upload_block",
      label: {
        type: "plain_text",
        text: "Upload files",
      },
      hint: {
        type: "plain_text",
        text: "PDF, Word, text, or markdown — up to 10 files",
      },
      element: {
        type: "file_input",
        action_id: "file_upload",
        filetypes: ["pdf", "docx", "doc", "txt", "md"],
        max_files: 10,
      },
    },
  ],
};

export const discoverSurveyModal = {
  type: "modal",
  callback_id: "discover_survey_modal",
  title: {
    type: "plain_text",
    text: "Survey Synthesis",
  },
  submit: {
    type: "plain_text",
    text: "Analyze",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Upload survey exports. Qori identifies themes, findings, and demographic patterns.",
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "topic_block",
      label: {
        type: "plain_text",
        text: "What topic are you exploring?",
      },
      hint: {
        type: "plain_text",
        text: "Used as the artifact name",
      },
      element: {
        type: "plain_text_input",
        action_id: "topic",
        placeholder: {
          type: "plain_text",
          text: "e.g., Post-launch user satisfaction",
        },
      },
    },
    {
      type: "input",
      block_id: "description_block",
      label: {
        type: "plain_text",
        text: "What do you need this source to tell you?",
      },
      hint: {
        type: "plain_text",
        text: "How this source relates to the project problem. Gaps are derived against this.",
      },
      element: {
        type: "plain_text_input",
        action_id: "description",
        placeholder: {
          type: "plain_text",
          text: "e.g., What satisfaction levels exist post-launch?",
        },
        multiline: true,
      },
    },
    {
      type: "input",
      block_id: "survey_name_block",
      label: {
        type: "plain_text",
        text: "What's the survey called?",
      },
      element: {
        type: "plain_text_input",
        action_id: "survey_name",
        placeholder: {
          type: "plain_text",
          text: "e.g., Post-launch satisfaction survey",
        },
      },
    },
    {
      type: "input",
      block_id: "question_focus_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Which questions should Qori focus on?",
      },
      element: {
        type: "plain_text_input",
        action_id: "question_focus",
        placeholder: {
          type: "plain_text",
          text: "e.g., Q5: What was most frustrating? Q8: Any other feedback?",
        },
        multiline: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: "file_upload_block",
      label: {
        type: "plain_text",
        text: "Upload survey data",
      },
      hint: {
        type: "plain_text",
        text: "CSV or Excel — up to 10 files",
      },
      element: {
        type: "file_input",
        action_id: "file_upload",
        filetypes: ["csv", "xlsx", "xls"],
        max_files: 10,
      },
    },
  ],
};

/** Loose modal shape for type-specific discovery modals. */
interface DiscoverTypeModal {
  type: string;
  callback_id: string;
  title: { type: string; text: string };
  submit: { type: string; text: string };
  close: { type: string; text: string };
  blocks: Record<string, unknown>[];
}

/** Map discovery type key to its modal definition. */
export const DISCOVER_TYPE_MODALS: Record<string, DiscoverTypeModal> = {
  desk_research: discoverDeskResearchModal as unknown as DiscoverTypeModal,
  stakeholder_synthesis: discoverStakeholderModal as unknown as DiscoverTypeModal,
  survey_synthesis: discoverSurveyModal as unknown as DiscoverTypeModal,
};

interface RequestData {
  submittedBy?: string;
  briefUrl?: string;
  projectTitle?: string;
  timelineNeeded?: string;
  prepared_by?: string;
  requestedBy: string;
}

const createStudyFromRequestModal = (requestData: RequestData) => ({
  type: "modal",
  callback_id: "create_study_modal",
  title: {
    type: "plain_text",
    text: "Study from Request",
  },
  submit: {
    type: "plain_text",
    text: "Create Study",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  blocks: [
    // Research Brief Banner
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:envelope_with_arrow: *Creating study from research request*\nStudy details have been pre-filled from ${requestData.submittedBy}'s research request. The brief will be automatically attached to this study.`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: requestData.briefUrl
            ? `📄 <${requestData.briefUrl}|View original research brief on GitHub> →`
            : `📄 Research brief from ${requestData.submittedBy}`,
        },
      ],
    },
    {
      type: "divider",
    },

    // Study Information Section
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":pencil2: *Study Information*",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Basic details about your research study. Review and adjust as needed.",
        },
      ],
    },

    // Study Name (pre-filled)
    {
      type: "input",
      block_id: "study_name",
      label: {
        type: "plain_text",
        text: "Study Name *",
      },
      hint: {
        type: "plain_text",
        text: "✓ Pre-filled from research request. You can edit if needed. Max 80 characters.",
      },
      element: {
        type: "plain_text_input",
        action_id: "value",
        initial_value: requestData.projectTitle || "",
        max_length: 80,
        placeholder: {
          type: "plain_text",
          text: "e.g., Claims Status Navigation Study",
        },
      },
    },

    // Research Type
    {
      type: "input",
      block_id: "research_type",
      label: {
        type: "plain_text",
        text: "Research Type *",
      },
      hint: {
        type: "plain_text",
        text: "Select the primary research method for this study.",
      },
      element: {
        type: "static_select",
        action_id: "value",
        placeholder: {
          type: "plain_text",
          text: "Select research type",
        },
        options: [
          {
            text: { type: "plain_text", text: "User Interviews" },
            value: "user_interviews",
          },
          {
            text: { type: "plain_text", text: "Usability Testing" },
            value: "usability_testing",
          },
          {
            text: { type: "plain_text", text: "Surveys" },
            value: "surveys",
          },
          {
            text: { type: "plain_text", text: "Field Research" },
            value: "field_research",
          },
          {
            text: { type: "plain_text", text: "Diary Study" },
            value: "diary_study",
          },
          {
            text: { type: "plain_text", text: "Card Sorting" },
            value: "card_sorting",
          },
          {
            text: { type: "plain_text", text: "A/B Testing" },
            value: "ab_testing",
          },
          {
            text: { type: "plain_text", text: "Other" },
            value: "other",
          },
        ],
      },
    },

    // Start Date
    {
      type: "input",
      block_id: "start_date",
      label: {
        type: "plain_text",
        text: "Start Date *",
      },
      hint: {
        type: "plain_text",
        text: "When you'll begin recruiting or data collection.",
      },
      element: {
        type: "datepicker",
        action_id: "value",
        placeholder: {
          type: "plain_text",
          text: "Select start date",
        },
      },
    },

    // Expected End Date (pre-filled if available)
    {
      type: "input",
      block_id: "end_date",
      label: {
        type: "plain_text",
        text: "Expected End Date *",
      },
      hint: {
        type: "plain_text",
        text: requestData.timelineNeeded
          ? `✓ Pre-filled based on requested timeline (${requestData.timelineNeeded}). Adjust as needed.`
          : "When you expect to complete data collection and analysis.",
      },
      element: {
        type: "datepicker",
        action_id: "value",
        placeholder: {
          type: "plain_text",
          text: "Select end date",
        },
      },
    },

    {
      type: "divider",
    },

    // Team Access Section
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":busts_in_silhouette: *Team Access*",
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Add team members and stakeholders who need study access and approval.",
        },
      ],
    },

    // Warning Box
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":warning: *Team members cannot be changed after study creation.* Make sure to add everyone who needs access now.",
        },
      ],
    },

    // Pre-filled Stakeholder (Request Submitter)
    {
      type: "input",
      block_id: "user_0",
      label: {
        type: "plain_text",
        text: "User *",
      },
      hint: {
        type: "plain_text",
        text: "✓ Request submitter added automatically as a stakeholder.",
      },
      element: {
        type: "external_select",
        action_id: "user_select",
        initial_option: {
          text: {
            type: "plain_text",
            text: `${requestData.prepared_by || requestData.submittedBy || 'Request Submitter'} (Request Submitter)`,
          },
          value: requestData.requestedBy,
        },
        placeholder: {
          type: "plain_text",
          text: "Select a channel member",
        },
        min_query_length: 0,
      },
    },

    {
      type: "input",
      block_id: "role_0",
      label: {
        type: "plain_text",
        text: "Role *",
      },
      element: {
        type: "static_select",
        action_id: "role_select",
        initial_option: {
          text: { type: "plain_text", text: "Stakeholder" },
          value: "stakeholder",
        },
        options: [
          {
            text: { type: "plain_text", text: "Stakeholder" },
            value: "stakeholder",
          },
          {
            text: { type: "plain_text", text: "PM" },
            value: "pm",
          },
          {
            text: { type: "plain_text", text: "Tech Lead" },
            value: "tech_lead",
          },
          {
            text: { type: "plain_text", text: "Designer" },
            value: "designer",
          },
          {
            text: { type: "plain_text", text: "Researcher" },
            value: "researcher",
          },
        ],
      },
    },

    // Add another user button
    {
      type: "actions",
      block_id: "add_user",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "➕ Add Another Team Member",
          },
          action_id: "add_user",
        },
      ],
    },

    {
      type: "divider",
    },

    // Confirmation checkbox (using context as Slack doesn't have checkbox in modals)
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "⚠️ By submitting, you confirm that all necessary team members have been added. Team members cannot be changed after study creation.",
        },
      ],
    },
  ],
});

export { createStudyFromRequestModal };

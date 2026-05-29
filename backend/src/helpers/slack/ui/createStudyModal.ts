/**
 * Generic create study modal that can be used for:
 * 1. Creating a new study from scratch
 * 2. Creating a study from a research request (with pre-filled data)
 * 3. Creating a study from an approved brief (with pre-filled data)
 */

interface RequestData {
  project_title?: string;
  projectTitle?: string;
  prepared_by?: string;
  submittedBy?: string;
  requestedBy?: string;
  briefUrl?: string;
  timelineNeeded?: string;
}

interface BriefData {
  project_title?: string;
  studyName?: string;
  requestor_name?: string;
  requestedBy?: string;
  brief_url?: string;
  briefUrl?: string;
  userDisplayName?: string;
}

interface CreateStudyModalOptions {
  briefData?: BriefData;
}

const createStudyModal = (options: CreateStudyModalOptions = {}) => {
  const { briefData } = options;
  const isFromBrief = !!briefData;

  // Map briefData to prefill format for consistency
  const prefillData: RequestData | undefined = briefData ? {
    project_title: briefData.project_title || briefData.studyName,
    prepared_by: briefData.requestor_name,
    requestedBy: briefData.requestedBy, // Use the user ID from briefData
    briefUrl: briefData.brief_url || briefData.briefUrl,
  } : undefined;

  const hasPrefillData = !!prefillData;

  const blocks: Record<string, unknown>[] = [];

  // Study Information Section
  blocks.push(
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
          text: hasPrefillData
            ? "Basic details about your research study. Review and adjust as needed."
            : "Provide basic details about your research study.",
        },
      ],
    },
    // Study Name
    {
      type: "input",
      block_id: "study_name",
      label: {
        type: "plain_text",
        text: "Study Name *",
      },
      hint: {
        type: "plain_text",
        text: hasPrefillData
          ? "✓ Pre-filled from research brief. You can edit if needed. Max 80 characters."
          : "Choose a clear, descriptive name for your study. Max 80 characters.",
      },
      element: {
        type: "plain_text_input",
        action_id: "value",
        ...(hasPrefillData && prefillData!.project_title && { initial_value: prefillData!.project_title }),
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
    // Expected End Date
    {
      type: "input",
      block_id: "end_date",
      label: {
        type: "plain_text",
        text: "Expected End Date *",
      },
      hint: {
        type: "plain_text",
        text: hasPrefillData && prefillData!.timelineNeeded
          ? `✓ Pre-filled based on requested timeline (${prefillData!.timelineNeeded}). Adjust as needed.`
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
    }
  );

  // Team Access Section
  blocks.push(
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
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":warning: *Team members cannot be changed after study creation.* Make sure to add everyone who needs access now.",
        },
      ],
    }
  );

  // First user-role pair (pre-filled with requester if from brief)
  if (isFromBrief && prefillData!.requestedBy) {
    const userDisplayName = briefData!.userDisplayName || prefillData!.prepared_by || briefData!.requestor_name;
    const userId = prefillData!.requestedBy;

    blocks.push(
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
          ...(userId && {
            initial_option: {
              text: {
                type: "plain_text",
                text: userDisplayName, // Must match exactly what options handler returns (just the name, no suffix)
              },
              value: userId,
            },
          }),
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
      }
    );
  } else {
    // Empty user-role pair for new study
    blocks.push(
      {
        type: "input",
        block_id: "user_0",
        label: {
          type: "plain_text",
          text: "User *",
        },
        element: {
          type: "external_select",
          action_id: "user_select",
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
          placeholder: {
            type: "plain_text",
            text: "Select role",
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
      }
    );
  }

  // Add another user button
  blocks.push(
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
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "⚠️ By submitting, you confirm that all necessary team members have been added. Team members cannot be changed after study creation.",
        },
      ],
    }
  );

  return {
    type: "modal",
    callback_id: "create_study_modal",
    title: {
      type: "plain_text",
      text: "Create Research Study",
    },
    submit: {
      type: "plain_text",
      text: "Create Study",
    },
    close: {
      type: "plain_text",
      text: "Cancel",
    },
    blocks,
  };
};

export { createStudyModal };

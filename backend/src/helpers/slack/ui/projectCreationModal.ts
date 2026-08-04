/**
 * Project creation modal — /qori-start entry point
 *
 * Collects project name, optional description, and channel creation preference.
 * The handler generates the slug from the name and creates the project.
 */

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the project_create_modal. */
export interface ProjectCreationModalMetadata {
  channelId: string;
}

/**
 * Build the project creation modal.
 */
export function projectCreationModal(channelId: string) {
  return {
    type: "modal",
    callback_id: "project_create_modal",
    private_metadata: JSON.stringify({ channelId } satisfies ProjectCreationModalMetadata),
    title: {
      type: "plain_text",
      text: "Start a Project",
    },
    submit: {
      type: "plain_text",
      text: "Create project",
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
            text: "Projects group related research — a product area, initiative, or team focus. Studies, discovery, and artifacts live inside a project.",
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "project_name",
        label: {
          type: "plain_text",
          text: "Project name",
        },
        hint: {
          type: "plain_text",
          text: "A short, descriptive name. This becomes the folder name in GitHub.",
        },
        element: {
          type: "plain_text_input",
          action_id: "value",
          placeholder: {
            type: "plain_text",
            text: "e.g., Mobile Scheduling Experience",
          },
          max_length: 80,
        },
      },
      {
        type: "input",
        block_id: "project_description",
        optional: true,
        label: {
          type: "plain_text",
          text: "Description",
        },
        hint: {
          type: "plain_text",
          text: "Optional context for the team. What is this project about?",
        },
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Research supporting the mobile scheduling redesign initiative...",
          },
          max_length: 500,
        },
      },
      {
        type: "input",
        block_id: "project_stakeholder",
        optional: true,
        label: {
          type: "plain_text",
          text: "Who approves research briefs for this team?",
        },
        hint: {
          type: "plain_text",
          text: "The stakeholder who reviews and approves briefs before research begins. Leave blank if you (the owner) will approve.",
        },
        element: {
          type: "users_select",
          action_id: "stakeholder_select",
          placeholder: {
            type: "plain_text",
            text: "Select a stakeholder",
          },
        },
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "create_channel",
        optional: true,
        label: {
          type: "plain_text",
          text: "Create dedicated channel",
        },
        element: {
          type: "checkboxes",
          action_id: "value",
          initial_options: [
            {
              text: {
                type: "plain_text",
                text: "Create a private channel for this project",
              },
              description: {
                type: "plain_text",
                text: "Research workflows for this project will surface here.",
              },
              value: "create_channel",
            },
          ],
          options: [
            {
              text: {
                type: "plain_text",
                text: "Create a private channel for this project",
              },
              description: {
                type: "plain_text",
                text: "Research workflows for this project will surface here.",
              },
              value: "create_channel",
            },
          ],
        },
      },
    ],
  };
}

/**
 * Project created — next steps modal
 *
 * Shown after successful project creation. All action buttons route
 * to placeholder handlers until Phase 2D wires them up.
 *
 * Copy is written to convey "intentionally staged" rather than
 * "incomplete" — this modal is the alpha entry point, and the
 * workflow expands from here.
 */

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the project_next_steps_modal. */
export interface ProjectNextStepsModalMetadata {
  projectId: number;
  projectName: string;
  projectSlug: string;
  channelId: string;
  createdChannelId?: string;
  createdChannelName?: string;
}

interface ProjectNextStepsModalOptions {
  projectId: number;
  projectName: string;
  projectSlug: string;
  channelId: string;
  /** The ID of the dedicated channel created for this project (if any) */
  createdChannelId?: string;
  /** The name of the dedicated channel created (e.g., "project-mobile-nav") */
  createdChannelName?: string;
}

/**
 * Build the "what's next" modal shown after project creation.
 *
 * All buttons are present but route to placeholder handlers. This is
 * intentional — the modal shows the workflow shape while we wire up
 * each capability in subsequent phases.
 */
export function projectCreatedNextStepsModal(options: ProjectNextStepsModalOptions) {
  const { projectId, projectName, projectSlug, channelId, createdChannelId, createdChannelName } = options;

  const metadata: ProjectNextStepsModalMetadata = {
    projectId,
    projectName,
    projectSlug,
    channelId,
    createdChannelId,
    createdChannelName,
  };

  // Build header text based on whether channel was created
  const channelLine = createdChannelName
    ? `Channel <#${createdChannelId}> created. `
    : '';
  const headerText = `:white_check_mark: *${projectName}* is ready.\n\n${channelLine}Your project folder is set up in GitHub. Here's what you can do next — these workflows are being rolled out progressively.`;

  return {
    type: "modal",
    callback_id: "project_next_steps_modal",
    private_metadata: JSON.stringify(metadata),
    title: {
      type: "plain_text",
      text: "Project created",
    },
    close: {
      type: "plain_text",
      text: "Done",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: headerText,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":mag: *Run discovery*\nDesk research, stakeholder interviews, and survey synthesis — builds the foundation for your studies.",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Run discovery",
          },
          action_id: "project_action_discovery",
          value: projectSlug,
          style: "primary",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":memo: *Create a research brief*\nKick off a new study within this project.",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Create brief",
          },
          action_id: "project_action_brief",
          value: projectSlug,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":books: *Import from library*\nPull in promoted discovery from past projects to inform this one.",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Coming soon",
          },
          action_id: "project_action_library",
          value: projectSlug,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "_Library import coming in Phase 2F._",
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
            text: `Project: \`${projectSlug}\``,
          },
        ],
      },
    ],
  };
}

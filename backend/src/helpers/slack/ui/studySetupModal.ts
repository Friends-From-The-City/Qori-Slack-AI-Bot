/* eslint-disable max-len */
/* eslint-disable quotes */

// ─── Modal metadata contract ─────────────────────────────────────

/**
 * The shape of private_metadata for the plan_study_modal / study-setup-modal-start-research.
 *
 * Phase 2D: studyId and projectId are populated by the modal openers (planModalOpener,
 * discussionGuideHandler) after the user selects a study. The initial modal only sets channelId.
 */
export interface StudySetupModalMetadata {
  channelId: string;
  studyId?: number;
  studyName?: string;
  projectId?: number;
  userId?: string;
}

interface StudyOption {
  id: number | string;
  name: string;
}

/**
 * Study setup modal v2.0 — launcher for /qori-plan
 *
 * v2.0: Removed upload sections (desk research, stakeholder notes, survey data)
 * — those live in /qori-discover now. Removed "Done" submit (modal is a launcher,
 * not a form). Conversational copy per modal design principles.
 */
export function studySetupModalPlanStudy(studies: StudyOption[] | null, channelId: string) {
  const studyOptions = studies && studies.length > 0
    ? studies.map((s) => ({
        text: { type: "plain_text", text: s.name.substring(0, 75) },
        value: String(s.id),
      }))
    : [{ text: { type: "plain_text", text: "No studies yet — use /qori-brief" }, value: "none" }];

  return {
    type: "modal",
    callback_id: "plan_study_modal",
    private_metadata: JSON.stringify({ channelId } satisfies StudySetupModalMetadata),
    title: {
      type: "plain_text",
      text: "Plan Your Study",
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
            text: "Pick a study, then choose what to create. New study? Start with `/qori-brief`.",
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "section",
        block_id: "study_selection",
        text: {
          type: "mrkdwn",
          text: "*Which study?*",
        },
        accessory: {
          type: "static_select",
          action_id: "study_select",
          placeholder: {
            type: "plain_text",
            text: "Select a study...",
          },
          options: studyOptions,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Research plan*\nTurns your brief into a stakeholder-ready plan",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Open",
          },
          action_id: "create_research_plan",
          value: "research_plan",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Discussion guide*\nSession script grounded in your objectives",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Open",
          },
          action_id: "create_discussion_guide",
          value: "discussion_guide",
        },
      },
    ],
  };
}

// Aliases for backward compatibility
export const studySetupModalStartResearch = studySetupModalPlanStudy;
export const studySetupModal = studySetupModalStartResearch;

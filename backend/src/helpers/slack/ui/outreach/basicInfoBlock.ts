interface BasicInfoInitialValues {
  participant_name?: string;
  study_name?: string;
  researcher_user_id?: string;
}

/**
 * Basic info blocks for outreach modals.
 *
 * Researcher is a users_select — handler resolves name and email from
 * client.users.info() or falls back to the study record. This replaces
 * the previous researcher_name + researcher_email text inputs (which
 * the handler was already ignoring in favor of the study DB record).
 */
export const createBasicInfoBlocks = (initialValues: BasicInfoInitialValues = {}) => [
  {
    type: "input",
    block_id: "participant_name",
    label: { type: "plain_text", text: "Participant Name *", emoji: true },
    element: {
      type: "plain_text_input",
      action_id: "value",
      placeholder: { type: "plain_text", text: "e.g. David T." },
      initial_value: initialValues.participant_name || "",
    },
    optional: false,
  },
  {
    type: "input",
    block_id: "study_name",
    label: { type: "plain_text", text: "Study Name *", emoji: true },
    element: {
      type: "plain_text_input",
      action_id: "value",
      placeholder: { type: "plain_text", text: "e.g. VA Housing Application Research" },
      initial_value: initialValues.study_name || "",
    },
    optional: false,
  },
  {
    type: "input",
    block_id: "researcher_block",
    label: { type: "plain_text", text: "Researcher *", emoji: true },
    element: {
      type: "users_select",
      action_id: "researcher_select",
      placeholder: { type: "plain_text", text: "Select researcher..." },
      ...(initialValues.researcher_user_id ? { initial_user: initialValues.researcher_user_id } : {}),
    },
    optional: false,
  },
];

// For backward compatibility
export const basinInfoBlocks = createBasicInfoBlocks();

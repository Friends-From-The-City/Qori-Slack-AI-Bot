interface BasicInfoInitialValues {
  participant_name?: string;
  study_name?: string;
  researcher_name?: string;
  researcher_email?: string;
}

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
    block_id: "researcher_name",
    label: { type: "plain_text", text: "Researcher Name *", emoji: true },
    element: {
      type: "plain_text_input",
      action_id: "value",
      placeholder: { type: "plain_text", text: "e.g. Jordan (UX Researcher)" },
      initial_value: initialValues.researcher_name || "",
    },
    optional: false,
  },
  {
    type: "input",
    block_id: "researcher_email",
    label: { type: "plain_text", text: "Researcher Email *", emoji: true },
    element: {
      type: "plain_text_input",
      action_id: "value",
      placeholder: { type: "plain_text", text: "e.g. jordan.researcher@va.gov" },
      initial_value: initialValues.researcher_email || "",
    },
    optional: false,
  },
  // {
  //   type: "input",
  //   block_id: "contact_method",
  //   label: { type: "plain_text", text: "Contact Method *", emoji: true },
  //   element: {
  //     type: "static_select",
  //     action_id: "value",
  //     options: [
  //       { text: { type: "plain_text", text: "📧 Email", emoji: true }, value: "Email" },
  //       { text: { type: "plain_text", text: "Recruitment Agency", emoji: true }, value: "Recruitment Agency" },
  //       // { text: { type: "plain_text", text: "📞 Phone Call", emoji: true }, value: "Phone Call" },
  //     ],
  //   },
  //   optional: false,
  // },
  // {
  //   type: "input",
  //   block_id: "tone",
  //   label: { type: "plain_text", text: "Tone *", emoji: true },
  //   element: {
  //     type: "static_select",
  //     action_id: "value",
  //     options: [
  //       { text: { type: "plain_text", text: "😊 Friendly", emoji: true }, value: "Friendly" },
  //       { text: { type: "plain_text", text: "📝 Formal", emoji: true }, value: "Formal" },
  //       { text: { type: "plain_text", text: "💬 Casual", emoji: true }, value: "Casual" },
  //     ],
  //   },
  //   optional: false,
  // },
];

// For backward compatibility
export const basinInfoBlocks = createBasicInfoBlocks();

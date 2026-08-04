import { PARTICIPANT_STATUS_VALUES, PARTICIPANT_STATUS_LABELS } from '../../../constants/participantStatus';

const statusOptions = PARTICIPANT_STATUS_VALUES.map((value) => ({
  text: { type: 'plain_text' as const, text: PARTICIPANT_STATUS_LABELS[value] },
  value,
}));

const addParticipantModal = {
  type: "modal",
  callback_id: "add-participant-modal",
  title: {
    type: "plain_text",
    text: "Add Participant",
  },
  close: {
    type: "plain_text",
    text: "Cancel",
  },
  submit: {
    type: "plain_text",
    text: "Add Participant",
  },
  blocks: [
    // Study Selection
    {
      type: "input",
      block_id: "study_select_block",
      label: { type: "plain_text", text: "Study" },
      element: {
        type: "static_select",
        action_id: "add_participant_study_select",
        placeholder: { type: "plain_text", text: "Select a study..." },
        options: [ { text: { type: "plain_text", text: "Loading studies..." }, value: "loading" } ],
      },
      dispatch_action: true,
    },

    // Code assignment preview (populated dynamically after study selection)
    {
      type: "context",
      block_id: "code_preview_block",
      elements: [
        {
          type: "mrkdwn",
          text: "_Select a study to see the code that will be assigned_"
        }
      ]
    },

    { type: "divider" },

    // Participant Information
    { type: "section", text: { type: "mrkdwn", text: "*Participant Information*" } },
    // Participant alias (optional memory aid)
    {
      type: "input",
      block_id: "participant_name_block",
      label: { type: "plain_text", text: "Private alias" },
      element: {
        type: "plain_text_input",
        action_id: "participant_name",
        max_length: 100,
        placeholder: { type: "plain_text", text: "e.g., 'screen-reader user', 'Veteran A'" },
      },
      hint: { type: "plain_text", text: "Private label to help you remember this participant. Do not enter real names — use the system code for identity." },
      optional: true,
    },
    // Recruitment method
    {
      type: "input",
      block_id: "recruitment_method_block",
      label: { type: "plain_text", text: "Recruitment method" },
      element: {
        type: "static_select",
        action_id: "recruitment_method",
        placeholder: { type: "plain_text", text: "Select recruitment source" },
        options: [
          { text: { type: "plain_text", text: "Internal panel" }, value: "internal_panel" },
          { text: { type: "plain_text", text: "Email outreach" }, value: "email_outreach" },
          { text: { type: "plain_text", text: "Recruitment agency" }, value: "recruitment_agency" },
          { text: { type: "plain_text", text: "Referral" }, value: "referral" },
          { text: { type: "plain_text", text: "Social/Website" }, value: "online" },
        ],
      },
    },

    { type: "divider" },

    // Session Details
    { type: "section", text: { type: "mrkdwn", text: "*Session Details*" } },
    // Scheduled date
    {
      type: "input",
      block_id: "session_date_block",
      label: { type: "plain_text", text: "Scheduled date" },
      element: {
        type: "datepicker",
        action_id: "session_date",
        placeholder: { type: "plain_text", text: "Select date" },
      },
    },
    // Scheduled time
    {
      type: "input",
      block_id: "session_time_block",
      label: { type: "plain_text", text: "Scheduled time" },
      element: {
        type: "timepicker",
        action_id: "session_time",
        placeholder: { type: "plain_text", text: "Select time" },
      },
    },
    // Current status
    {
      type: "input",
      block_id: "current_status_block",
      label: { type: "plain_text", text: "Current status" },
      element: {
        type: "static_select",
        action_id: "current_status",
        placeholder: { type: "plain_text", text: "Select status" },
        options: statusOptions,
        initial_option: statusOptions[0],
      },
    },

    { type: "divider" },

    // Demographics
    { type: "section", text: { type: "mrkdwn", text: "*Demographics*" } },
    // Race/Ethnicity
    {
      type: "input",
      block_id: "race_ethnicity_block",
      label: { type: "plain_text", text: "Race/ethnicity" },
      element: {
        type: "static_select",
        action_id: "race_ethnicity",
        placeholder: { type: "plain_text", text: "Select..." },
        options: [
          { text: { type: "plain_text", text: "American Indian or Alaska Native" }, value: "american_indian" },
          { text: { type: "plain_text", text: "Asian" }, value: "asian" },
          { text: { type: "plain_text", text: "Black or African American" }, value: "black" },
          { text: { type: "plain_text", text: "Hispanic or Latino" }, value: "hispanic_latino" },
          { text: { type: "plain_text", text: "Native Hawaiian or Pacific Islander" }, value: "native_hawaiian" },
          { text: { type: "plain_text", text: "White" }, value: "white" },
          { text: { type: "plain_text", text: "Two or More Races" }, value: "two_or_more" },
          { text: { type: "plain_text", text: "Prefer not to say" }, value: "prefer_not_to_say" },
        ],
      },
    },
    // Age Range
    {
      type: "input",
      block_id: "age_range_block",
      label: { type: "plain_text", text: "Age range" },
      element: {
        type: "static_select",
        action_id: "age_range",
        placeholder: { type: "plain_text", text: "Select..." },
        options: [
          { text: { type: "plain_text", text: "18-24" }, value: "18-24" },
          { text: { type: "plain_text", text: "25-34" }, value: "25-34" },
          { text: { type: "plain_text", text: "35-44" }, value: "35-44" },
          { text: { type: "plain_text", text: "45-54" }, value: "45-54" },
          { text: { type: "plain_text", text: "55-64" }, value: "55-64" },
          { text: { type: "plain_text", text: "65-74" }, value: "65-74" },
          { text: { type: "plain_text", text: "75+" }, value: "75+" },
          { text: { type: "plain_text", text: "Prefer not to say" }, value: "prefer_not_to_say" },
        ],
      },
    },
    // Education Level
    {
      type: "input",
      block_id: "education_level_block",
      label: { type: "plain_text", text: "Education level" },
      element: {
        type: "static_select",
        action_id: "education_level",
        placeholder: { type: "plain_text", text: "Select..." },
        options: [
          { text: { type: "plain_text", text: "Less than high school" }, value: "less_than_high_school" },
          { text: { type: "plain_text", text: "High school diploma/GED" }, value: "high_school" },
          { text: { type: "plain_text", text: "Some college" }, value: "some_college" },
          { text: { type: "plain_text", text: "Associate degree" }, value: "associate" },
          { text: { type: "plain_text", text: "Bachelor's degree" }, value: "bachelor" },
          { text: { type: "plain_text", text: "Master's degree" }, value: "master" },
          { text: { type: "plain_text", text: "Professional degree" }, value: "professional" },
          { text: { type: "plain_text", text: "Doctorate degree" }, value: "doctorate" },
          { text: { type: "plain_text", text: "Prefer not to say" }, value: "prefer_not_to_say" },
        ],
      },
    },
    // Location Type
    {
      type: "input",
      block_id: "location_type_block",
      label: { type: "plain_text", text: "Location type" },
      element: {
        type: "static_select",
        action_id: "location_type",
        placeholder: { type: "plain_text", text: "Select..." },
        options: [
          { text: { type: "plain_text", text: "Urban" }, value: "urban" },
          { text: { type: "plain_text", text: "Suburban" }, value: "suburban" },
          { text: { type: "plain_text", text: "Rural" }, value: "rural" },
          { text: { type: "plain_text", text: "Prefer not to say" }, value: "prefer_not_to_say" },
        ],
      },
    },

    { type: "divider" },

    // Notes & Accommodations
    { type: "section", text: { type: "mrkdwn", text: "*Additional Info*" } },
    {
      type: "input",
      block_id: "notes_accommodations_block",
      label: { type: "plain_text", text: "Notes & accommodations" },
      element: {
        type: "plain_text_input",
        action_id: "notes_accommodations",
        multiline: true,
        max_length: 500,
        placeholder: { type: "plain_text", text: "e.g., Prefers afternoon sessions, uses screen reader, limited data plan" },
      },
      optional: true,
    },

  ],
};

export { addParticipantModal };

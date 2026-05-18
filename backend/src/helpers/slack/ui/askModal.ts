/**
 * /qori-ask modal — Pattern A (single-affordance).
 * Free-text question input + scope radio (all studies vs. single study).
 */

interface StudyOption {
  text: { type: string; text: string };
  value: string;
}

function buildAskModal(studyOptions: StudyOption[], activeStudyId: string | null) {
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Ask Qori' },
    },
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'ask_question',
      label: { type: 'plain_text', text: 'What do you want to find?' },
      element: {
        type: 'plain_text_input',
        action_id: 'question_text',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: 'e.g., Quotes about navigation, findings related to accessibility',
        },
      },
    },
    {
      type: 'input',
      block_id: 'ask_scope',
      label: { type: 'plain_text', text: 'Search scope' },
      element: {
        type: 'radio_buttons',
        action_id: 'scope_choice',
        options: [
          {
            text: { type: 'plain_text', text: 'All studies in this workspace' },
            value: 'all',
          },
          {
            text: { type: 'plain_text', text: 'Just one study' },
            value: 'single',
          },
        ],
        initial_option: {
          text: { type: 'plain_text', text: 'All studies in this workspace' },
          value: 'all',
        },
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Searches quotes, findings, themes, and recommendations across your research. Anyone with Qori can run `/qori-ask`.',
        },
      ],
    },
  ];

  // Study picker block (conditionally shown — always include for now, scope handler
  // can't dynamically show/hide in initial render without an action handler).
  if (studyOptions.length > 0) {
    const activeOption = activeStudyId
      ? studyOptions.find(o => o.value === activeStudyId.toString())
      : null;

    blocks.splice(4, 0, {
      type: 'input',
      block_id: 'ask_study_select',
      label: { type: 'plain_text', text: 'Study (only used when scope is "Just one study")' },
      element: {
        type: 'static_select',
        action_id: 'ask_study_choice',
        placeholder: { type: 'plain_text', text: 'Choose a study...' },
        options: studyOptions,
        ...(activeOption ? { initial_option: activeOption } : {}),
      },
      optional: true,
    });
  }

  return {
    type: 'modal',
    callback_id: 'ask_qori_submit',
    title: { type: 'plain_text', text: 'Ask Qori' },
    submit: { type: 'plain_text', text: 'Ask' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  };
}

export { buildAskModal };

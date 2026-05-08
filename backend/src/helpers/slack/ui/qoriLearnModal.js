/**
 * /qori-learn — First-run ceremony (4-screen modal tour).
 *
 * Uses views.update() to swap screens. State stored in private_metadata.
 * Returning users see a condensed command map with "Take the tour again" button.
 */

// Placeholder URL for cascade diagram — replace with actual hosted asset
const CASCADE_DIAGRAM_URL = 'https://friends-innovation-lab.github.io/qori-slack/assets/cascade-diagram.gif';

// ── Screen builders ────────────────────────────────────────

function buildScreen1() {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Welcome to Qori' },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Qori turns scattered research into structured knowledge.\n\nEvery interview, every session, every finding — connected.\nEvery recommendation traceable to a real participant\'s words.',
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: 'learn_nav',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Show me how →' },
          style: 'primary',
          action_id: 'learn_next',
          value: '2',
        },
      ],
    },
  ];
}

function buildScreen2() {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'How Qori works' },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'A participant says:\n> _"Benefits sounds like a brochure, not my actual money."_',
      },
    },
    {
      type: 'image',
      image_url: CASCADE_DIAGRAM_URL,
      alt_text: 'Cascade diagram showing how a quote flows through Qori: quote → nugget → theme → finding → ticket',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '→ Becomes a structured nugget\n→ Joins a validated theme\n→ Informs a finding with severity\n→ Creates an engineering ticket\n\nEvery link traceable. Nothing fabricated. Real evidence.',
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: 'learn_nav',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '← Back' },
          action_id: 'learn_prev',
          value: '1',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Show me commands →' },
          style: 'primary',
          action_id: 'learn_next',
          value: '3',
        },
      ],
    },
  ];
}

function buildScreen3() {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '11 commands, organized by phase' },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*PLAN*\n`/qori-discover`  Pre-study discovery\n`/qori-brief`  Stakeholder-aligned brief\n`/qori-plan`  Execution planning',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*FIELDWORK*\n`/qori-fieldwork`  Track participants, observers, outreach',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*ANALYZE*\n`/qori-analyze`  Process session transcripts\n`/qori-synthesis`  Find themes across sessions',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*REPORT*\n`/qori-report`  Research readout\n`/qori-tickets`  Engineering issues from findings',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*KNOWLEDGE*\n`/qori-ask`  Query past research',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*UTILITY*\n`/qori-learn`  This tour\n`/qori-delete`  Clean up studies',
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Each command does one thing well. The system handles the rest.' }],
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: 'learn_nav',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '← Back' },
          action_id: 'learn_prev',
          value: '2',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Try it →' },
          style: 'primary',
          action_id: 'learn_next',
          value: '4',
        },
      ],
    },
  ];
}

function buildScreen4() {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'What brings you to Qori?' },
    },
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'learn_role_select',
      label: { type: 'plain_text', text: 'Choose your starting point' },
      element: {
        type: 'radio_buttons',
        action_id: 'learn_role_choice',
        options: [
          {
            text: { type: 'plain_text', text: "I'm starting a new study" },
            value: 'new_study',
          },
          {
            text: { type: 'plain_text', text: 'I have research to analyze' },
            value: 'analyze',
          },
          {
            text: { type: 'plain_text', text: 'I want to query past research' },
            value: 'ask',
          },
          {
            text: { type: 'plain_text', text: "I'm just exploring" },
            value: 'explore',
          },
        ],
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: 'learn_nav',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '← Back' },
          action_id: 'learn_prev',
          value: '3',
        },
      ],
    },
  ];
}

// ── Condensed view for returning users ─────────────────────

function buildCondensedView() {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Qori command map' },
    },
    { type: 'divider' },
    ...buildScreen3().filter(b => b.type === 'section'),
    { type: 'divider' },
    {
      type: 'actions',
      block_id: 'learn_nav',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Take the tour again' },
          action_id: 'learn_restart_tour',
        },
      ],
    },
  ];
}

// ── Modal builders ─────────────────────────────────────────

const SCREEN_BUILDERS = {
  1: buildScreen1,
  2: buildScreen2,
  3: buildScreen3,
  4: buildScreen4,
};

function buildLearnModal(screen, meta = {}) {
  const blocks = (SCREEN_BUILDERS[screen] || buildScreen1)();
  const isScreen4 = screen === 4;

  return {
    type: 'modal',
    callback_id: isScreen4 ? 'learn_ceremony_submit' : 'learn_ceremony_noop',
    title: { type: 'plain_text', text: 'Qori' },
    ...(isScreen4 ? { submit: { type: 'plain_text', text: 'Done' } } : {}),
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify({ ...meta, screen }),
    blocks,
  };
}

function buildCondensedModal(meta = {}) {
  return {
    type: 'modal',
    callback_id: 'learn_ceremony_noop',
    title: { type: 'plain_text', text: 'Qori' },
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify({ ...meta, screen: 'condensed' }),
    blocks: buildCondensedView(),
  };
}

module.exports = {
  buildLearnModal,
  buildCondensedModal,
  SCREEN_BUILDERS,
};

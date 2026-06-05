/**
 * /qori-learn — First-run ceremony (4-screen modal tour).
 *
 * Uses views.update() to swap screens. State stored in private_metadata.
 * Returning users see a condensed command map with "Take the tour again" button.
 */

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for learn modals. */
export interface LearnModalMetadata {
  userId: string;
  channelId: string;
  screen: number | 'condensed';
  [key: string]: unknown;
}

const CASCADE_DIAGRAM_URL = 'https://friends-innovation-lab.github.io/qori-slack/assets/cascade-diagram.png?v=2';

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
        text: '*Research that ships.*\n\n•  Synthesis in minutes, not days.\n•  From interview to engineering ticket.\n•  Every recommendation traces back to its source.',
      },
    },
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
        text: 'Qori turns interviews into engineering tickets. Every output traces back to the research that produced it.',
      },
    },
    {
      type: 'image',
      image_url: CASCADE_DIAGRAM_URL,
      alt_text: 'Diagram: a real participant quote ("Benefits sounds like a brochure, not my actual money.") connected by an arrow to an engineering ticket (qori-eng-12: Rewrite benefits page copy in plain financial terms.). Caption reads: Every link traceable to real evidence.',
    },
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

/**
 * Shared command map blocks — used by /qori-learn Screen 3 and condensed view.
 */
function buildCommandMapBlocks() {
  return [
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
        text: '*UTILITY*\n`/qori-learn`  This tour\n`/qori-admin`  Admin center',
      },
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
    ...buildCommandMapBlocks(),
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
    ...buildCommandMapBlocks(),
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

export const SCREEN_BUILDERS: Record<number, () => Record<string, unknown>[]> = {
  1: buildScreen1,
  2: buildScreen2,
  3: buildScreen3,
  4: buildScreen4,
};

export function buildLearnModal(screen: number, meta: Omit<LearnModalMetadata, 'screen'> = {} as Omit<LearnModalMetadata, 'screen'>) {
  const blocks = (SCREEN_BUILDERS[screen] || buildScreen1)();
  const isScreen4 = screen === 4;

  return {
    type: 'modal',
    callback_id: isScreen4 ? 'learn_ceremony_submit' : 'learn_ceremony_noop',
    title: { type: 'plain_text', text: 'Qori' },
    ...(isScreen4 ? { submit: { type: 'plain_text', text: 'Done' } } : {}),
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify({ ...meta, screen } as LearnModalMetadata),
    blocks,
  };
}

export function buildCondensedModal(meta: Omit<LearnModalMetadata, 'screen'> = {} as Omit<LearnModalMetadata, 'screen'>) {
  return {
    type: 'modal',
    callback_id: 'learn_ceremony_noop',
    title: { type: 'plain_text', text: 'Qori' },
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify({ ...meta, screen: 'condensed' } as LearnModalMetadata),
    blocks: buildCondensedView(),
  };
}

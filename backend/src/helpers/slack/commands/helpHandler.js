const { buildCommandMapBlocks } = require('../ui/qoriLearnModal');

async function handleQoriHelp({ command, ack, client }) {
  await ack();
  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      title: { type: 'plain_text', text: 'Qori commands' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '12 commands, organized by phase' },
        },
        { type: 'divider' },
        ...buildCommandMapBlocks(),
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'Each command does one thing well. The system handles the rest.' }],
        },
      ],
    },
  });
}

module.exports = { handleQoriHelp };

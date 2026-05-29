/**
 * qoriMainHandler.ts — /qori command handler
 *
 * Extracted from events.js. Posts the commands reference message listing
 * all available /qori-* commands. Also handles the study_select action
 * for the study dropdown in the plan modal.
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackActionMiddlewareArgs, BlockAction } from '@slack/bolt';

// ─── /qori command ─────────────────────────────────────────────────

async function qoriMainHandler({ ack, command, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();
  const channelId = command.channel_id;

  const commandBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📚 Qori Commands Reference'
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori`* → Show all commands'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-brief`* → Create research brief (starts a new study)'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-plan`* → Create plan, guide, or upload files for an existing study'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-participants`* → Add or update participants'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-outreach`* → Generate participant outreach messages'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-observe`* → Request to observe a session'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-notes`* → Observer documents session notes'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-analyze`* → Analyze session data'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-synthesis`* → Cross-session synthesis'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-report`* → Generate stakeholder report'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*`/qori-learn`* → Interactive tutorial'
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '💡 Need more details? Use `/qori-learn` for an interactive tutorial.'
        }
      ]
    }
  ];

  await client.chat.postMessage({
    channel: channelId,
    text: '📚 Qori Commands Reference',
    blocks: commandBlocks
  });
}

// ─── study_select action ───────────────────────────────────────────

async function handleStudySelect({ ack, body, client }: SlackActionMiddlewareArgs<BlockAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('study_select: no view in body'); return; }

  // Extract selected study
  const selected = (body.actions[0] as any).selected_option;
  const selectedStudyId = selected?.value;
  const selectedStudyName = selected?.text?.text || null;
  console.log('study_select ~ id:', selectedStudyId, 'name:', selectedStudyName);

  // Store the selected study name/id for downstream use
  const oldMeta = JSON.parse(body.view.private_metadata || '{}');
  const newMeta = JSON.stringify({
    ...oldMeta,
    studyId: selectedStudyId,
    studyName: selectedStudyName || oldMeta.studyName || null,
  });

  // Update the modal to include the selected study in metadata
  const validView = {
    type: body.view.type as 'modal',
    callback_id: body.view.callback_id,
    title: body.view.title,
    submit: body.view.submit ?? undefined,
    close: body.view.close ?? undefined,
    blocks: body.view.blocks as any[],
    private_metadata: newMeta,
  };

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: validView,
  });
}

export {
  qoriMainHandler,
  qoriMainHandler as qoriMainCommand,
  handleStudySelect,
};

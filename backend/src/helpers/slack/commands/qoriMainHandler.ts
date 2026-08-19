/**
 * qoriMainHandler.ts — study_select action handler
 *
 * GOV-1B: /qori command removed (deprecated — /qori-learn supersedes).
 * handleStudySelect remains — used by /qori-plan study picker modal.
 *
 * SLACK MANIFEST NOTE: The /qori slash command must also be removed from
 * the Slack app configuration dashboard (api.slack.com → App → Slash Commands).
 * Until removed there, Slack will still show the command autocomplete but
 * the bot will not respond.
 */

import type { AllMiddlewareArgs, SlackActionMiddlewareArgs, BlockAction } from '@slack/bolt';

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
  handleStudySelect,
};

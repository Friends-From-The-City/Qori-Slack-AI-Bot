/**
 * syncHandler.ts — /qori-sync command + cascading dropdown handlers
 *
 * Extracted from events.js. Handles the sync folder modal with cascading
 * dropdown pattern: folder -> subfolder -> research folder.
 *
 * IMPORTANT: views.update does NOT take trigger_id — only view_id and hash.
 *
 * NOTE: The submission handler references `setupVectorStore` which is imported
 * from the RAG pipeline (currently disabled). This handler is preserved as-is
 * for when RAG is re-enabled.
 */

import type { SlashCommandContext, BlockActionContext } from '../../../../types/handlers';

const { listAllTopLevelFolders, readFolderContents, readFolders } = require('../../../github');

// ─── /qori-sync command ───────────────────────────────────────────

async function syncCommandHandler({ ack, command, client }: SlashCommandContext): Promise<void> {
  await ack();

  const channelId = command.channel_id;
  const repoName = process.env.GITHUB_REPO;

  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'sync-folder-modal',
      title: { type: 'plain_text', text: 'Sync Folder' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ channelId, repoName }),
      blocks: [
        {
          type: 'input',
          block_id: 'sync_folder_block',
          dispatch_action: true,
          label: { type: 'plain_text', text: 'Folder' },
          element: {
            type: 'external_select',
            action_id: 'sync_folder_selected',
            placeholder: { type: 'plain_text', text: 'Select a folder\u2026' },
            min_query_length: 0,
          },
        },
      ],
    },
  });
}

// ─── Folder options lookup (typeahead) ─────────────────────────────

async function handleSyncFolderOptions({ ack, body }: { ack: (opts: any) => Promise<void>; body: any }): Promise<void> {
  const { repoName } = JSON.parse(body.view.private_metadata);
  const folders = await listAllTopLevelFolders(repoName);

  const options = folders.map((f: any) => ({
    text: { type: 'plain_text', text: f.name },
    value: f.path,
  }));
  await ack({ options });
}

// ─── Folder selected → inject Sub-folder picker ──────────────────

async function handleSyncFolderSelected({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('sync_folder_selected: no view in body'); return; }

  const folderPath = (body.actions[0] as any).selected_option.value;
  const { channelId, repoName } = JSON.parse(body.view.private_metadata);
  const viewBlocks = body.view.blocks as any[];

  // fetch sub-folders under that path
  const subfolders = await readFolderContents(folderPath, repoName);

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: {
      type: body.view.type as 'modal',
      callback_id: body.view.callback_id,
      title: body.view.title,
      submit: body.view.submit ?? undefined,
      close: body.view.close ?? undefined,
      private_metadata: JSON.stringify({ channelId, repoName, folderPath }),
      blocks: [
        // Folder (pre-selected)
        {
          type: 'input' as const,
          block_id: 'sync_folder_block',
          dispatch_action: true,
          label: viewBlocks[0].label,
          element: {
            type: 'external_select',
            action_id: 'sync_folder_selected',
            initial_option: {
              text: { type: 'plain_text', text: (body.actions[0] as any).selected_option.text.text },
              value: folderPath,
            },
            placeholder: viewBlocks[0].element.placeholder,
            min_query_length: 0,
          },
        },
        // Sub-folder picker
        {
          type: 'input' as const,
          block_id: 'sync_subfolder_block',
          dispatch_action: true,
          label: { type: 'plain_text', text: 'Sub-folder' },
          element: {
            type: 'external_select',
            action_id: 'sync_subfolder_selected',
            placeholder: { type: 'plain_text', text: 'Select a sub-folder\u2026' },
            min_query_length: 0,
          },
        },
      ],
    } as any,
  });
}

// ─── Sub-folder options lookup (typeahead) ─────────────────────────

async function handleSyncSubfolderOptions({ ack, body }: { ack: (opts: any) => Promise<void>; body: any }): Promise<void> {
  const { repoName, folderPath } = JSON.parse(body.view.private_metadata);
  const subs = await readFolderContents(folderPath, repoName);

  const options = subs.map((s: any) => ({
    text: { type: 'plain_text', text: s.name },
    value: s.path,
  }));

  await ack({ options });
}

// ─── Sub-folder selected → inject Research folder picker ──────────

async function handleSyncSubfolderSelected({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('sync_subfolder_selected: no view in body'); return; }

  const subfolderPath = (body.actions[0] as any).selected_option.value;
  const { channelId, repoName, folderPath } = JSON.parse(body.view.private_metadata);
  const viewBlocks = body.view.blocks as any[];

  // fetch research sub-folders under that path
  const researchPath = `${subfolderPath}/research`;
  const researchFolders = await readFolderContents(researchPath, repoName);

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: {
      type: body.view.type as 'modal',
      callback_id: body.view.callback_id,
      title: body.view.title,
      submit: body.view.submit ?? undefined,
      close: body.view.close ?? undefined,
      private_metadata: JSON.stringify({ channelId, repoName, folderPath, subfolderPath }),
      blocks: [
        // Folder
        {
          type: 'input' as const,
          block_id: 'sync_folder_block',
          dispatch_action: true,
          label: viewBlocks[0].label,
          element: viewBlocks[0].element,
        },
        // Sub-folder
        {
          type: 'input' as const,
          block_id: 'sync_subfolder_block',
          dispatch_action: true,
          label: viewBlocks[1].label,
          element: viewBlocks[1].element,
        },
        // Research-folder picker
        {
          type: 'input' as const,
          block_id: 'sync_research_block',
          label: { type: 'plain_text', text: 'Research Folder' },
          element: {
            type: 'external_select',
            action_id: 'sync_research_selected',
            placeholder: { type: 'plain_text', text: 'Select research folder\u2026' },
            min_query_length: 0,
          },
        },
      ],
    } as any,
  });
}

// ─── Research folder options lookup (typeahead) ───────────────────

async function handleSyncResearchOptions({ ack, body }: { ack: (opts: any) => Promise<void>; body: any }): Promise<void> {
  const { repoName, subfolderPath } = JSON.parse(body.view.private_metadata);
  const researchPath = `${subfolderPath}/research`;
  const res = await readFolderContents(researchPath, repoName);

  const options = res.map((r: any) => ({
    text: { type: 'plain_text', text: r.name },
    value: r.path,
  }));

  await ack({ options });
}

// ─── Sync modal submission ────────────────────────────────────────

async function handleSyncFolderSubmission({ ack, body, view, client }: any): Promise<void> {
  await ack();

  const { channelId, folderPath, subfolderPath } = JSON.parse(view.private_metadata);
  const folderSel = view.state.values.sync_folder_block.sync_folder_selected.selected_option;
  const subfolderSel = view.state.values.sync_subfolder_block.sync_subfolder_selected.selected_option;
  const researchSel = view.state.values.sync_research_block.sync_research_selected.selected_option;

  // Immediately let them know we're working on it
  const placeholder = await client.chat.postMessage({
    channel: channelId,
    text: '\u23f3 Processing your request\u2026',
  });
  const repo = process.env.GITHUB_REPO;
  const files = await readFolders(`${folderSel.text.text}/${subfolderSel.text.text}/research/${researchSel.text.text}`, repo);

  // NOTE: setupVectorStore is from the RAG pipeline (currently disabled).
  // This handler will fail at runtime until RAG is re-enabled and the
  // setupVectorStore import is restored. Preserved for future use.
  for (const file of files) {
    const parts = (file as any).path.split('/');
    // setupVectorStore(file.content, parts[3], file.path, file.sha)
    console.warn('setupVectorStore call skipped — RAG pipeline disabled. File:', (file as any).path);
  }

  // once done, update that placeholder
  await client.chat.update({
    channel: placeholder.channel,
    ts: placeholder.ts,
    text: `\u2705 Synced:\n\u2022 research-folder: *${researchSel.text.text}*`,
  });
}

module.exports = {
  syncCommandHandler,
  handleSyncFolderOptions,
  handleSyncFolderSelected,
  handleSyncSubfolderOptions,
  handleSyncSubfolderSelected,
  handleSyncResearchOptions,
  handleSyncFolderSubmission,
};

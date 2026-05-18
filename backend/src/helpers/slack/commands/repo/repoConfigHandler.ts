/**
 * repoConfigHandler.ts — /qori-repo command + cascading dropdown handlers
 *
 * Extracted from events.js. Handles the repo picker modal with cascading
 * dropdown pattern: repo -> folder -> subfolder. Includes typeahead options
 * handlers for external_select elements.
 *
 * IMPORTANT: views.update does NOT take trigger_id — only view_id and hash.
 */

import type { SlashCommandContext, BlockActionContext } from '../../../../types/handlers';
import type { WebClient } from '@slack/web-api';

import { listOrgRepos, listAllTopLevelFolders, readFolderContents } from '../../../github';
import { addChannelConfig } from '../../../../services/channel-config.service';

// ─── /qori-repo command ────────────────────────────────────────────

async function repoConfigCommandHandler({ ack, command, client }: SlashCommandContext): Promise<void> {
  await ack();

  const channelId = command.channel_id;

  // fetch org repos
  const repos = await listOrgRepos();
  const repoOptions = repos.map((r: any) => ({
    text: { type: 'plain_text', text: r.name },
    value: String(r.id),
  }));

  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'repo-folder-subfolder-modal',
      title: { type: 'plain_text', text: 'Pick repo' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ channelId }),
      blocks: [
        // @ts-expect-error — pre-existing type mismatch from require() → import migration
        {
          type: 'input',
          block_id: 'repo_block',
          dispatch_action: true,
          label: { type: 'plain_text', text: 'Repo' },
          element: {
            type: 'static_select',
            action_id: 'repo_selected',
            options: repoOptions,
          },
        },
      ],
    },
  });
}

// ─── Repo selected → inject Folder picker ──────────────────────────

async function handleRepoSelected({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('repo_selected: no view in body'); return; }

  const repoId = (body.actions[0] as any).selected_option.value;
  const repoName = (body.actions[0] as any).selected_option.text.text;
  const { channelId } = JSON.parse(body.view.private_metadata);
  const viewBlocks = body.view.blocks as any[];

  // fetch top-level folders in that repo
  const folders = await listAllTopLevelFolders(repoName);
  const folderOptions = folders.map((f: any) => ({
    text: { type: 'plain_text', text: f.name },
    value: f.path,
  }));

  const updatedView = {
    type: body.view.type as 'modal',
    callback_id: body.view.callback_id,
    title: body.view.title,
    submit: body.view.submit ?? undefined,
    close: body.view.close ?? undefined,
    private_metadata: JSON.stringify({ channelId, repoId, repoName }),
    clear_on_close: body.view.clear_on_close,
    notify_on_close: body.view.notify_on_close,
    blocks: [
      {
        type: 'input' as const,
        block_id: 'repo_block',
        dispatch_action: true,
        label: viewBlocks[0].label,
        element: {
          type: 'static_select',
          action_id: 'repo_selected',
          options: viewBlocks[0].element.options,
          initial_option: { text: { type: 'plain_text', text: repoName }, value: repoId },
        },
      },
      {
        type: 'input' as const,
        block_id: 'folder_block',
        dispatch_action: true,
        label: { type: 'plain_text', text: 'Folder' },
        element: {
          type: 'external_select',
          action_id: 'folder_selected',
          placeholder: { type: 'plain_text', text: 'Select a folder\u2026' },
          min_query_length: 0,
        },
      },
    ],
  };

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: updatedView as any,
  });
}

// ─── Folder options lookup (typeahead) ─────────────────────────────

async function handleFolderOptions({ ack, body }: { ack: (opts: any) => Promise<void>; body: any }): Promise<void> {
  const { repoName } = JSON.parse(body.view.private_metadata);
  const folders = await listAllTopLevelFolders(repoName);

  const options = folders.map((f: any) => ({
    text: { type: 'plain_text', text: f.name },
    value: f.path,
  }));

  await ack({ options });
}

// ─── Folder selected → inject Sub-folder picker ───────────────────

async function handleFolderSelected({ ack, body, client }: BlockActionContext): Promise<void> {
  await ack();
  if (!('view' in body) || !body.view) { console.warn('folder_selected: no view in body'); return; }

  const folderPath = (body.actions[0] as any).selected_option.value;
  const { channelId, repoId, repoName } = JSON.parse(body.view.private_metadata);
  const viewBlocks = body.view.blocks as any[];

  // fetch sub-folders under that path
  const subfolders = await readFolderContents(folderPath, repoName);
  console.log('folder_selected ~ subfolders:', subfolders);

  const updatedView = {
    type: body.view.type as 'modal',
    callback_id: body.view.callback_id,
    title: body.view.title,
    submit: body.view.submit ?? undefined,
    close: body.view.close ?? undefined,
    private_metadata: JSON.stringify({ channelId, repoId, repoName, folderPath }),
    clear_on_close: body.view.clear_on_close,
    notify_on_close: body.view.notify_on_close,
    blocks: [
      // Repo (pre-selected)
      {
        type: 'input' as const,
        block_id: 'repo_block',
        dispatch_action: true,
        label: viewBlocks[0].label,
        element: {
          type: 'static_select',
          action_id: 'repo_selected',
          options: viewBlocks[0].element.options,
          initial_option: {
            text: { type: 'plain_text', text: repoName },
            value: repoId,
          },
        },
      },
      // Folder (pre-selected)
      {
        type: 'input' as const,
        block_id: 'folder_block',
        dispatch_action: true,
        label: viewBlocks[1].label,
        element: {
          type: 'external_select',
          action_id: 'folder_selected',
          initial_option: {
            text: { type: 'plain_text', text: (body.actions[0] as any).selected_option.text.text },
            value: folderPath,
          },
          placeholder: viewBlocks[1].element.placeholder,
          min_query_length: 0,
        },
      },
      // Sub-folder (type-ahead)
      {
        type: 'input' as const,
        block_id: 'subfolder_block',
        label: { type: 'plain_text', text: 'Sub-folder' },
        element: {
          type: 'external_select',
          action_id: 'subfolder_selected',
          placeholder: { type: 'plain_text', text: 'Select a sub-folder\u2026' },
          min_query_length: 0,
        },
      },
    ],
  };

  await client.views.update({
    view_id: body.view.id,
    hash: body.view.hash,
    view: updatedView as any,
  });
}

// ─── Sub-folder options lookup (typeahead) ─────────────────────────

async function handleSubfolderOptions({ ack, body }: { ack: (opts: any) => Promise<void>; body: any }): Promise<void> {
  const { folderPath, repoName } = JSON.parse(body.view.private_metadata);
  const subs = await readFolderContents(folderPath, repoName);

  const options = subs.map((s: any) => ({
    text: { type: 'plain_text', text: s.name },
    value: s.path,
  }));

  await ack({ options });
}

// ─── Modal submission ──────────────────────────────────────────────

async function handleRepoFolderSubfolderSubmission({ ack, body, view, client }: any): Promise<void> {
  await ack();

  const { channelId, repoId, repoName, folderPath } = JSON.parse(view.private_metadata);

  console.log('repo-folder-subfolder-modal ~ private_metadata:', view.private_metadata);
  const repoSel = view.state.values.repo_block.repo_selected.selected_option;
  const folderSel = view.state.values.folder_block.folder_selected.selected_option;
  const subfolderSel = view.state.values.subfolder_block.subfolder_selected.selected_option;

  const folderId = folderSel.value;
  const folderName = folderSel.text.text;
  const subfolderId = subfolderSel.value;
  const subfolderName = subfolderSel.text.text;
  const fullPath = `${folderName}/${subfolderName}`;

  console.log('data of folders', folderId, folderName, subfolderName, subfolderId);
  const placeholder = await client.chat.postMessage({
    channel: channelId,
    text: '\u23f3 Processing your request\u2026',
  });

  // persist config
  await addChannelConfig({
    channel_id: channelId,
    repo_id: repoId,
    repo: repoName,
    product_folder_name: folderName,
    sub_folder_name: subfolderName,
  });

  // let the user know
  await client.chat.postMessage({
    channel: placeholder.channel,
    ts: placeholder.ts,
    text: `Config saved:\n\u2022 repo: *${repoName}*\n\u2022 folder: *${folderName}*\n\u2022 sub-folder: *${subfolderName}*`,
  });
}

export {
  repoConfigCommandHandler,
  repoConfigCommandHandler as repoCommand,
  handleRepoSelected,
  handleRepoSelected as repoSelected,
  handleFolderOptions,
  handleFolderOptions as folderOptions,
  handleFolderSelected,
  handleFolderSelected as folderSelected,
  handleSubfolderOptions,
  handleSubfolderOptions as subfolderOptions,
  handleRepoFolderSubfolderSubmission,
  handleRepoFolderSubfolderSubmission as handleRepoSubmission,
};

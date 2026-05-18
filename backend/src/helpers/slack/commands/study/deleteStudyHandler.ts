/**
 * deleteStudyHandler.ts — /qori-delete command + confirmation modal
 *
 * Extracted from events.js. Handles opening the delete study picker modal
 * and processing the deletion (GitHub folder + database records).
 */

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from '@slack/bolt';

import { deleteStudyFolderFromGitHub } from '../../../github';
import { getResearchStudyWithRoles, getStudiesByUser, deleteResearchStudy } from '../../../../services/research_study.service';
import { getActiveStudy as getActiveStudyState } from '../../../../services/slack-user-state.service';

// ─── /qori-delete command ─────────────────────────────────────────

async function deleteStudyCommandHandler({ ack, command, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();

  const userId = command.user_id;
  const channelId = command.channel_id;

  try {
    // Fetch studies created by the user
    const studies = await getStudiesByUser(userId);

    if (studies.length === 0) {
      await client.chat.postMessage({
        channel: channelId,
        text: '\u274c You have no studies to delete. Create a study first with `/qori-start`.',
      });
      return;
    }

    // Create study options for the dropdown
    const studyOptions = studies.map((study: any) => ({
      text: { type: 'plain_text', text: study.name },
      value: String(study.id),
    }));
    const activeStudyId = await getActiveStudyState(userId);
    const activeDeleteOption = activeStudyId ? studyOptions.find((o: any) => o.value === activeStudyId.toString()) : null;

    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'delete-study-modal',
        title: { type: 'plain_text', text: 'Delete Study' },
        submit: { type: 'plain_text', text: 'Delete' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify({ channelId, userId }),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '\u26a0\ufe0f *Warning: This action cannot be undone!*\n\nThis will permanently delete:\n\u2022 The study and all its data\n\u2022 All files and folders in GitHub\n\u2022 All associated roles, participants, notes, plans, and summaries',
            },
          },
          {
            type: 'divider',
          },
          // @ts-expect-error — pre-existing type mismatch from require() → import migration
          {
            type: 'input',
            block_id: 'study_select_block',
            label: { type: 'plain_text', text: 'Select study to delete:' },
            element: {
              type: 'static_select',
              action_id: 'study_selected',
              placeholder: { type: 'plain_text', text: 'Choose a study...' },
              options: studyOptions,
              ...(activeDeleteOption ? { initial_option: activeDeleteOption } : {}),
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '\ud83d\udca1 *Tip:* Only studies you created are shown here.',
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('Error opening delete study modal:', error);
    const message = error instanceof Error ? error.message : String(error);
    await client.chat.postMessage({
      channel: channelId,
      text: `\u274c Error: ${message}`,
    });
  }
}

// ─── Delete study modal submission ────────────────────────────────

async function handleDeleteStudySubmission({ ack, body, view, client }: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs): Promise<void> {
  await ack();

  const { channelId, userId } = JSON.parse(view.private_metadata || '{}');
  const selectedStudy = (view as any).state.values.study_select_block?.study_selected?.selected_option;

  if (!selectedStudy) {
    // Open DM channel with the user
    let dmChannelId: string;
    try {
      const im = await client.conversations.open({ users: userId });
      dmChannelId = (im as any).channel.id;
    } catch (dmError) {
      console.error('Failed to open DM channel, falling back to channel:', dmError);
      dmChannelId = channelId;
    }

    await client.chat.postMessage({
      channel: dmChannelId,
      text: '\u274c No study selected. Please try again.',
    });
    return;
  }

  const studyId = parseInt(selectedStudy.value);
  const studyName = selectedStudy.text.text;

  // Open DM channel with the user
  let dmChannelId: string;
  try {
    const im = await client.conversations.open({ users: userId });
    dmChannelId = (im as any).channel.id;
  } catch (dmError) {
    console.error('Failed to open DM channel, falling back to channel:', dmError);
    dmChannelId = channelId;
  }

  // Send processing message to DM
  const placeholder = await client.chat.postMessage({
    channel: dmChannelId,
    text: `\u23f3 Deleting study "${studyName}"... This may take a moment.`,
  });

  try {
    // 1. Get study details before deletion (to get the path)
    const study = await getResearchStudyWithRoles(studyName);

    if (!study) {
      await client.chat.update({
        channel: (placeholder as any).channel,
        ts: (placeholder as any).ts,
        text: `\u274c Study "${studyName}" not found.`,
      });
      return;
    }

    // 2. Delete from GitHub first (before database deletion)
    let githubResult: any = { deleted: 0, message: 'No GitHub folder found' };
    let githubError: string | null = null;
    if (study.path) {
      try {
        console.log(`\ud83d\uddd1\ufe0f Deleting GitHub folder: ${study.path}`);
        // @ts-expect-error — pre-existing type mismatch from require() → import migration
        githubResult = await deleteStudyFolderFromGitHub(study.path, process.env.GITHUB_REPO);
        console.log('\u2705 GitHub deletion result:', githubResult);
      } catch (err) {
        console.error('\u26a0\ufe0f Error deleting from GitHub (continuing with DB deletion):', err);
        githubError = err instanceof Error ? err.message : String(err);
      }
    }

    // 3. Delete from database (cascade will handle related records)
    const deleteResult = await deleteResearchStudy(studyId, userId);
    console.log('\u2705 Database deletion result:', deleteResult);

    // 4. Build status message with clear GitHub outcome
    let githubStatus: string;
    if (!study.path) {
      githubStatus = '\u26a0\ufe0f *GitHub:* No study path stored \u2014 GitHub files were NOT deleted. If files exist in the repo, delete them manually.';
    } else if (githubError) {
      githubStatus = `\u274c *GitHub:* Deletion failed \u2014 ${githubError}\nFiles may still exist at \`${study.path}\`. Delete manually from the repo.`;
    } else if (githubResult.deleted === 0) {
      githubStatus = `\u26a0\ufe0f *GitHub:* No files found at \`${study.path}\` \u2014 folder may have already been removed.`;
    } else {
      githubStatus = `\u2705 *GitHub:* Deleted ${githubResult.deleted}/${githubResult.total} file(s)` +
        (githubResult.errors ? ` (${githubResult.errors.length} failed \u2014 check repo manually)` : '');
    }

    const successMessage = '\u2705 *Study deleted from database*\n\n' +
      `*Study:* ${studyName}\n` +
      `${githubStatus}\n` +
      '*Database:* Study and all associated data removed\n\n' +
      '\u26a0\ufe0f This action cannot be undone.';

    await client.chat.update({
      channel: (placeholder as any).channel,
      ts: (placeholder as any).ts,
      text: successMessage,
    });
  } catch (error) {
    console.error('\u274c Error deleting study:', error);
    const message = error instanceof Error ? error.message : String(error);

    let errorMessage = '\u274c *Failed to delete study*\n\n';
    if (message.includes('permission')) {
      errorMessage += "You don't have permission to delete this study. Only the study creator can delete it.";
    } else if (message.includes('not found')) {
      errorMessage += 'Study not found or already deleted.';
    } else {
      errorMessage += `Error: ${message}\n\nPlease try again or contact support.`;
    }

    await client.chat.update({
      channel: (placeholder as any).channel,
      ts: (placeholder as any).ts,
      text: errorMessage,
    });
  }
}

export {
  deleteStudyCommandHandler,
  deleteStudyCommandHandler as deleteStudyCommand,
  handleDeleteStudySubmission,
};

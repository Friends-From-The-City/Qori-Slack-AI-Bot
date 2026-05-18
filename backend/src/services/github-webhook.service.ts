// src/services/github-webhook.service.ts

import type { StudyStatus } from '../database/models/study_status';

import crypto from 'crypto';
import { getStudyStatusByFileName } from './study-status.service';
import slackApiClient from '../helpers/slackApiClient';

interface GitCommit {
  id: string;
  message: string;
  added?: string[];
  removed?: string[];
  modified?: string[];
}

interface PushPayload {
  commits?: GitCommit[];
  [key: string]: unknown;
}

interface ChangedFiles {
  added: string[];
  removed: string[];
  modified: string[];
}

class GithubWebhookService {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  verifySignature(signature: string, payload: string): boolean {
    // payload is the raw body string
    const hmac = crypto.createHmac('sha256', this.secret);
    const digest = 'sha256=' + hmac.update(payload, 'utf8').digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const digestBuffer = Buffer.from(digest, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (digestBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
  }

  static extractFileName(filePath: string | null): string | null {
    if (!filePath) return null;
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  }

  async handleEvent(event: string, payload: PushPayload): Promise<void> {
    console.log("🚀 ~ GithubWebhookService ~ handleEvent ~ payload:", payload)
    switch (event) {
      case 'push': {
        const commits = payload.commits || [];
        const changedFiles: ChangedFiles = {
          added: [],
          removed: [],
          modified: []
        };
        commits.forEach((commit: GitCommit) => {
          if (Array.isArray(commit.added)) changedFiles.added.push(...commit.added);
          if (Array.isArray(commit.removed)) changedFiles.removed.push(...commit.removed);
          if (Array.isArray(commit.modified)) changedFiles.modified.push(...commit.modified);
        });
        console.log('Changed files:', changedFiles);

        // For each modified file, notify the user who created it
        for (const filePath of changedFiles.modified) {
          const fileName = GithubWebhookService.extractFileName(filePath);
          console.log("🚀 ~ GithubWebhookService ~ handleEvent ~ fileName:", fileName)
          // @ts-expect-error — pre-existing type mismatch from require() → import migration
          const statuses: StudyStatus[] = await getStudyStatusByFileName(fileName);
          console.log("🚀 ~ GithubWebhookService ~ handleEvent ~ statuses:", statuses)
          if (!statuses || statuses.length === 0) continue;
          const status = statuses[0]; // Most recent
          if (!status.created_by) continue;

          // Open DM channel with created_by
          const imRes = await slackApiClient.post('conversations.open', {
            users: status.created_by
          });
          const channelId = imRes.data.channel.id;

          // Find the most recent 'need_changes' status for this file
          const prevRequest = statuses.find((s: StudyStatus) => s.status === 'need_changes');
          const previousReason = prevRequest ? prevRequest.reason : 'No previous request.';
          const requestedBy = prevRequest ? prevRequest.requested_by : null;

          // Find the commit for this file
          const commit = commits.find((c: GitCommit) => c.modified && c.modified.includes(filePath));
          const commitMsg = commit ? `${commit.id.slice(0, 7)}: ${commit.message}` : 'Unknown commit';

          const path = status.path;

          // Compose Slack message blocks
          const blocks = [
            { type: 'section', text: { type: 'mrkdwn', text: `📝 *Change Request from* <@${requestedBy || 'unknown'}>` } },
            { type: 'section', text: { type: 'mrkdwn', text: previousReason } },
            { type: 'divider' },
            { type: 'section', text: { type: 'mrkdwn', text: '🔄 *GitHub Activity Detected:*' } },
            { type: 'section', text: { type: 'mrkdwn', text: `• ${commitMsg}` } },
            { type: 'divider' },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Mark Changes Complete' },
                  action_id: 'mark_changes_complete',
                  value: JSON.stringify({ fileName, filePath: path, statusId: status.id })
                }
              ]
            }
          ];
          console.log("🚀 ~ GithubWebhookService ~ handleEvent ~ blocks:", blocks)

          // Send DM
          await slackApiClient.post('chat.postMessage', {
            channel: channelId,
            text: 'GitHub Activity Detected',
            blocks
          });
        }
        break;
      }
      default:
        console.log('Unhandled event:', event);
    }
  }
}

export default GithubWebhookService;

// CJS compat — controller/route files still use require()
module.exports = GithubWebhookService;

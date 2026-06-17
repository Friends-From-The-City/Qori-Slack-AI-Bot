import type { View } from '@slack/types';

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the transcript_review modal. */
export interface TranscriptReviewModalMetadata {
  /** Database ID of the pending study_notes record */
  noteId: number;
  /** Participant code (e.g., "PT-001") */
  participantCode: string;
  /** Study name */
  studyName: string;
  /** GitHub file URL for full transcript review */
  fileUrl: string;
}

export interface ScrubStats {
  participantName: number;
  moderatorName: number;
  speakerLabels: number;
  phoneNumbers: number;
  emailAddresses: number;
}

interface TranscriptReviewParams {
  /** Preview of scrubbed transcript (truncated for display) */
  scrubbedPreview: string;
  /** Scrubbing statistics */
  stats: ScrubStats;
  /** Warnings for human review */
  warnings: string[];
  /** Participant code (e.g., "PT-001") */
  participantCode: string;
  /** Study name */
  studyName: string;
  /** GitHub URL to full transcript for review */
  fileUrl: string;
}

/**
 * Build the transcript review modal.
 *
 * The transcript is already saved to GitHub (PII-scrubbed but not approved).
 * Researcher must review the FULL transcript via the GitHub link before approving.
 * Slack's modal char limits prevent showing the full text here.
 */
export const buildTranscriptReviewModal = (params: TranscriptReviewParams): View => {
  const { scrubbedPreview, stats, warnings, participantCode, studyName, fileUrl } = params;

  // Build stats summary
  const totalScrubs = stats.participantName + stats.moderatorName +
    stats.speakerLabels + stats.phoneNumbers + stats.emailAddresses;

  const statLines: string[] = [];
  if (stats.participantName > 0) statLines.push(`• Participant name → ${participantCode}: ${stats.participantName}`);
  if (stats.moderatorName > 0) statLines.push(`• Moderator name → [Moderator]: ${stats.moderatorName}`);
  if (stats.speakerLabels > 0) statLines.push(`• Speaker labels: ${stats.speakerLabels}`);
  if (stats.phoneNumbers > 0) statLines.push(`• Phone numbers → [PHONE]: ${stats.phoneNumbers}`);
  if (stats.emailAddresses > 0) statLines.push(`• Email addresses → [EMAIL]: ${stats.emailAddresses}`);

  const statsText = totalScrubs > 0
    ? `✅ *${totalScrubs} PII items scrubbed:*\n${statLines.join('\n')}`
    : '⚠️ *No PII items were automatically scrubbed.* Please verify the transcript is already anonymized.';

  // Truncate preview for display (Slack has block limits)
  const maxPreviewLength = 1500;
  const isTruncated = scrubbedPreview.length > maxPreviewLength;
  const truncatedPreview = isTruncated
    ? scrubbedPreview.substring(0, maxPreviewLength) + '\n\n[... truncated ...]'
    : scrubbedPreview;

  return {
    type: 'modal',
    callback_id: 'transcript_review_approve',
    title: { type: 'plain_text', text: 'Review Transcript' },
    submit: { type: 'plain_text', text: 'Approve' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      // Header
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔍 PII Scrubbing Review', emoji: true }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `*Study:* ${studyName} · *Participant:* ${participantCode}` }
        ]
      },
      { type: 'divider' },

      // Scrubbing stats
      {
        type: 'section',
        text: { type: 'mrkdwn', text: statsText }
      },
      { type: 'divider' },

      // CRITICAL: Review full transcript link
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *IMPORTANT: Review the FULL transcript before approving*\n\n' +
            'The preview below is truncated. Auto-scrub may have missed incidental PII ' +
            '(names mentioned in conversation, locations, dates). ' +
            '*You must review the full transcript on GitHub* to catch anything the scrubber missed.'
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: '📄 Review Full Transcript', emoji: true },
          url: fileUrl,
          action_id: 'review_full_transcript_link'
        }
      },
      { type: 'divider' },

      // What to look for
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '*Look for:* Names in conversation ("my wife Sarah...") · Locations ("the Denver VA...") · ' +
              'Phone numbers · Email addresses · Dates with context ("my birthday is...")'
          }
        ]
      },
      { type: 'divider' },

      // Preview header
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Preview* ${isTruncated ? '(truncated — review full on GitHub)' : ''}:` }
      },

      // Preview content
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '```\n' + truncatedPreview + '\n```'
        }
      },

      // Footer
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '✅ *Approve* marks this transcript as PII-reviewed and eligible for analysis.\n' +
              '❌ *Cancel* keeps the transcript in draft state (re-upload with `/qori-notes` to try again).'
          }
        ]
      }
    ]
  } as unknown as View;
};

import type { View } from '@slack/types';

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the transcript_review modal. */
export interface TranscriptReviewModalMetadata {
  /** Scrubbed transcript content (ready to save) */
  scrubbedContent: string;
  /** Original template data for saving */
  templateData: {
    session_id: string;
    participant_name: string;
    study_name: string;
    session_date: string;
    session_time: string;
    researcher: string;
  };
  /** Session info for DB record */
  sessionInfo: {
    studyId: number | null;
    participantId: number | null;
  };
  /** User who uploaded */
  userId: string;
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
}

/**
 * Build the transcript review modal.
 *
 * Shows the scrubbed transcript for human review before saving.
 * The researcher must approve or go back to edit.
 */
export const buildTranscriptReviewModal = (params: TranscriptReviewParams): View => {
  const { scrubbedPreview, stats, warnings, participantCode, studyName } = params;

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
  const maxPreviewLength = 2500;
  const truncatedPreview = scrubbedPreview.length > maxPreviewLength
    ? scrubbedPreview.substring(0, maxPreviewLength) + '\n\n... [truncated for preview]'
    : scrubbedPreview;

  return {
    type: 'modal',
    callback_id: 'transcript_review_approve',
    title: { type: 'plain_text', text: 'Review Transcript' },
    submit: { type: 'plain_text', text: 'Approve & Save' },
    close: { type: 'plain_text', text: 'Go Back' },
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

      // Warnings
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *Please review for incidental PII:*\n' +
            '• Names mentioned in conversation ("my wife Sarah...")\n' +
            '• Locations ("the Denver VA...")\n' +
            '• Dates with context ("my birthday is...")\n' +
            '• Any other identifying information\n\n' +
            '_Auto-scrub handles known names and patterns. Human review catches what it misses._'
        }
      },
      { type: 'divider' },

      // Preview header
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*📄 Scrubbed Transcript Preview:*' }
      },

      // Preview content (in a context block for smaller text)
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
            text: '✅ *Approve & Save* commits this transcript to GitHub and marks it as PII-reviewed.\n' +
              '↩️ *Go Back* returns to the upload form to make changes.'
          }
        ]
      }
    ]
  } as unknown as View;
};

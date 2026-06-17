import type { View } from '@slack/types';

// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the transcript_review modal. */
export interface TranscriptReviewModalMetadata {
  /** Path to quarantined file (pending review) */
  quarantinePath: string;
  /** Final path (where file goes after approval) */
  finalPath: string;
  /** Filename for DB record */
  filename: string;
  /** Participant code (e.g., "PT-001") */
  participantCode: string;
  /** Study name */
  studyName: string;
  /** GitHub file URL for full transcript review (points to quarantine) */
  fileUrl: string;
  /** Study ID for DB record */
  studyId: number | null;
  /** Participant ID for DB record */
  participantId: number | null;
  /** Session date for DB record */
  sessionDate: string;
  /** Session time for DB record */
  sessionTime: string;
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
  /** Scrubbing statistics */
  stats: ScrubStats;
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
 * The transcript is saved to quarantine (.pending-review/).
 * Researcher MUST review the FULL transcript via the GitHub link.
 * NO preview is shown — preview invites skimming instead of reading.
 * Approval MOVES file from quarantine to final location.
 */
export const buildTranscriptReviewModal = (params: TranscriptReviewParams): View => {
  const { stats, participantCode, studyName, fileUrl } = params;

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
        text: { type: 'plain_text', text: '🔍 PII Review Required', emoji: true }
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

      // CRITICAL: Review full transcript link (the actual review happens on GitHub)
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *You MUST review the full transcript before approving.*\n\n' +
            'Auto-scrub handles known names and patterns, but may miss:\n' +
            '• Names mentioned in conversation ("my wife Sarah...")\n' +
            '• Locations ("the Denver VA...")\n' +
            '• Phone numbers or emails in conversation\n' +
            '• Dates with context ("my birthday is...")\n\n' +
            '*Click the button to review the full transcript on GitHub.*'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📄 Review Full Transcript on GitHub', emoji: true },
            url: fileUrl,
            action_id: 'review_full_transcript_link',
            style: 'primary'
          }
        ]
      },
      { type: 'divider' },

      // Footer
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '✅ *Approve* — moves transcript to final location, eligible for analysis.\n' +
              '❌ *Cancel* — keeps transcript in quarantine (re-upload to try again).'
          }
        ]
      }
    ]
  } as unknown as View;
};

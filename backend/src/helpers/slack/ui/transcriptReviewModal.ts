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
  /** Whether a participant name was provided at upload */
  nameProvided: boolean;
}

/**
 * Build the transcript review modal.
 *
 * PII redesign (2026-08-05): Honest status block (no success glyph),
 * rescrub loop field, attestation checkbox, clear action labels.
 * Per ADR 0026 §2.3: reviewer's job is the headline.
 */
export const buildTranscriptReviewModal = (params: TranscriptReviewParams): View => {
  const { stats, participantCode, studyName, fileUrl, nameProvided } = params;

  // ── Honest status block (item a) ──────────────────────────
  const autoScrubLines: string[] = [];
  if (stats.phoneNumbers > 0) autoScrubLines.push(`${stats.phoneNumbers} phone number${stats.phoneNumbers !== 1 ? 's' : ''} → [PHONE]`);
  if (stats.emailAddresses > 0) autoScrubLines.push(`${stats.emailAddresses} email${stats.emailAddresses !== 1 ? 's' : ''} → [EMAIL]`);
  if (stats.participantName > 0) autoScrubLines.push(`participant name → ${participantCode}: ${stats.participantName} replacement${stats.participantName !== 1 ? 's' : ''}`);
  if (stats.moderatorName > 0) autoScrubLines.push(`moderator name → [Moderator]: ${stats.moderatorName}`);
  if (stats.speakerLabels > 0) autoScrubLines.push(`speaker labels: ${stats.speakerLabels}`);

  const nameStatus = nameProvided
    ? `participant name → ${participantCode}`
    : 'no name provided at upload — names NOT scrubbed';

  const statusText = autoScrubLines.length > 0
    ? `Auto-scrub applied: ${autoScrubLines.join(' · ')}`
    : `Auto-scrub applied: ${nameStatus}`;

  return {
    type: 'modal',
    callback_id: 'transcript_review_approve',
    title: { type: 'plain_text', text: 'Review Transcript' },
    submit: { type: 'plain_text', text: 'Approve' },
    close: { type: 'plain_text', text: 'Reject — needs source fix' },
    blocks: [
      // Study/participant context
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `*Study:* ${studyName} · *Participant:* ${participantCode}` }
        ]
      },
      { type: 'divider' },

      // Honest status block — no success glyph
      {
        type: 'section',
        text: { type: 'mrkdwn', text: statusText }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Not covered by auto-scrub: names of other people, places, dates, or details mentioned in conversation. Finding these is your review.' }
        ]
      },
      { type: 'divider' },

      // Review link — the actual review happens on GitHub
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Review the full transcript before approving.'
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Open on GitHub' },
          url: fileUrl,
          action_id: 'review_full_transcript_link',
        }
      },
      { type: 'divider' },

      // Rescrub loop (item b) — additional terms to scrub
      {
        type: 'input',
        block_id: 'rescrub_terms_block',
        optional: true,
        label: { type: 'plain_text', text: 'Additional names or terms to scrub' },
        hint: { type: 'plain_text', text: 'Comma-separated. These are used for find/replace only — not stored.' },
        element: {
          type: 'plain_text_input',
          action_id: 'rescrub_terms',
          placeholder: { type: 'plain_text', text: 'e.g., Sarah, Denver VA, Dr. Martinez' },
        }
      },

      // Attestation checkbox (item c) — required for approval
      {
        type: 'input',
        block_id: 'attestation_block',
        label: { type: 'plain_text', text: 'Attestation' },
        element: {
          type: 'checkboxes',
          action_id: 'attestation_checkbox',
          options: [
            {
              text: { type: 'mrkdwn', text: '*I have reviewed the full transcript*' },
              value: 'attested',
            }
          ]
        }
      },

      // Action descriptions
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '*Approve* — moves transcript to final location, eligible for `/qori-analyze`.\n' +
              '*Reject* — keeps transcript in quarantine; re-upload to try again.'
          }
        ]
      }
    ]
  } as unknown as View;
};

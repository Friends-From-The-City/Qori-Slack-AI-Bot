import type { View } from '@slack/types';

// ─── Shared types ─────────────────────────────────────────────────

/** Metadata carried in DM button values and modal private_metadata. */
export interface TranscriptReviewMetadata {
  quarantinePath: string;
  finalPath: string;
  filename: string;
  participantCode: string;
  studyName: string;
  fileUrl: string;
  studyId: number | null;
  participantId: number | null;
  sessionDate: string;
  sessionTime: string;
  userId: string;
  dmChannelId: string;
  messageTs: string;
}

/** Legacy alias — old name referenced in existing handler code. */
export type TranscriptReviewModalMetadata = TranscriptReviewMetadata;

export interface ScrubStats {
  participantName: number;
  moderatorName: number;
  speakerLabels: number;
  phoneNumbers: number;
  emailAddresses: number;
  /** Count of [REDACTED] tokens from rescrub terms in the current file */
  redactedTerms?: number;
}

// ─── Review URL builder (single construction site) ────────────────

/**
 * Build the URL where the reviewer reads the full transcript.
 * Today: GitHub blob URL. Option 2: authenticated Qori web page.
 * ONE place produces this URL — the DM and all modals reference it.
 */
export function buildReviewUrl(quarantinePath: string): string {
  const owner = process.env.GITHUB_OWNER || '';
  const repo = process.env.GITHUB_REPO || '';
  return `https://github.com/${owner}/${repo}/blob/main/${quarantinePath}`;
}

// ─── Honest status block builder (single construction site) ───────

interface StatusBlockParams {
  stats: ScrubStats;
  participantCode: string;
  nameProvided: boolean;
  rescrubSummary?: string;
}

/**
 * Build the honest-status text. Used by the DM AND the rescrub modal
 * update — ONE construction site, no drift.
 *
 * Three attributed lines:
 * 1. "Auto-scrub applied:" — machine counts only
 * 2. "Your rescrub:" — reviewer's cumulative [REDACTED] count (omitted when zero)
 * 3. Per-term positional counts from this pass (omitted on first render)
 */
export function buildStatusText(params: StatusBlockParams): string {
  const { stats, participantCode, nameProvided, rescrubSummary } = params;

  const autoScrubLines: string[] = [];
  if (stats.phoneNumbers > 0) autoScrubLines.push(`${stats.phoneNumbers} phone number${stats.phoneNumbers !== 1 ? 's' : ''} → [PHONE]`);
  if (stats.emailAddresses > 0) autoScrubLines.push(`${stats.emailAddresses} email${stats.emailAddresses !== 1 ? 's' : ''} → [EMAIL]`);
  if (stats.participantName > 0) autoScrubLines.push(`participant name → ${participantCode}: ${stats.participantName} replacement${stats.participantName !== 1 ? 's' : ''}`);
  if (stats.moderatorName > 0) autoScrubLines.push(`moderator name → [Moderator]: ${stats.moderatorName}`);
  if (stats.speakerLabels > 0) autoScrubLines.push(`speaker labels: ${stats.speakerLabels}`);

  const nameStatus = nameProvided
    ? `participant name → ${participantCode}`
    : 'no name provided at upload — names NOT scrubbed';

  let statusText = autoScrubLines.length > 0
    ? `Auto-scrub applied: ${autoScrubLines.join(' · ')}`
    : `Auto-scrub applied: ${nameStatus}`;

  if (stats.redactedTerms && stats.redactedTerms > 0) {
    statusText += `\nYour rescrub: ${stats.redactedTerms} redaction${stats.redactedTerms !== 1 ? 's' : ''} → [REDACTED]`;
  }
  if (rescrubSummary) {
    statusText += rescrubSummary.startsWith('\n') ? rescrubSummary : `\n${rescrubSummary}`;
  }

  return statusText;
}

// ─── DM blocks builder ────────────────────────────────────────────

interface ReviewDmParams {
  stats: ScrubStats;
  participantCode: string;
  studyName: string;
  fileUrl: string;
  nameProvided: boolean;
  buttonMetadata: string; // JSON stringified TranscriptReviewMetadata
  rescrubSummary?: string;
}

/**
 * Build the Block Kit blocks for the transcript review DM.
 * This is the persistent review surface — replaces the pushed modal.
 */
export function buildTranscriptReviewDmBlocks(params: ReviewDmParams): any[] {
  const { stats, participantCode, studyName, fileUrl, nameProvided, buttonMetadata, rescrubSummary } = params;

  const statusText = buildStatusText({ stats, participantCode, nameProvided, rescrubSummary });

  return [
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*Study:* ${studyName} · *Participant:* ${participantCode}` }
      ]
    },
    { type: 'divider' },
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
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Review the full transcript before approving.' },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Open on GitHub' },
        url: fileUrl,
        action_id: 'review_full_transcript_link',
      }
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Rescrub' },
          action_id: 'transcript_rescrub',
          value: buttonMetadata,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          action_id: 'transcript_approve',
          style: 'primary' as const,
          value: buttonMetadata,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject' },
          action_id: 'transcript_reject',
          style: 'danger' as const,
          value: buttonMetadata,
        },
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '*Approve* — moves transcript to final location, eligible for `/qori-analyze`.\n' +
            '*Reject* — deletes quarantine file, notifies uploader.\n' +
            '*Rescrub* — apply additional find/replace terms before deciding.'
        }
      ]
    }
  ];
}

/**
 * Build terminal DM blocks (buttons removed) for approved state.
 */
export function buildApprovedDmBlocks(studyName: string, participantCode: string, finalUrl: string, actor: string): any[] {
  return [
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*Study:* ${studyName} · *Participant:* ${participantCode}` }
      ]
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `Transcript approved by <@${actor}> and saved.` }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `<${finalUrl}|View on GitHub>` }
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: 'This transcript is now eligible for `/qori-analyze`.' }
      ]
    }
  ];
}

/**
 * Build terminal DM blocks (buttons removed) for rejected state.
 */
export function buildRejectedDmBlocks(studyName: string, participantCode: string, actor: string): any[] {
  return [
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*Study:* ${studyName} · *Participant:* ${participantCode}` }
      ]
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `Transcript rejected by <@${actor}>. The quarantine file has been deleted. Re-uploading this session will create a new quarantine file at the same location.` }
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: 'Git history retains the quarantine version per ADR 0026 §6.' }
      ]
    }
  ];
}

/**
 * Build failure-state DM blocks when quarantine commit fails after DM was posted.
 */
export function buildCommitFailureDmBlocks(studyName: string, participantCode: string): any[] {
  return [
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*Study:* ${studyName} · *Participant:* ${participantCode}` }
      ]
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Transcript could not be saved to quarantine. No file was created. Please re-upload via `/qori-notes`.' }
    }
  ];
}

// ─── Purpose-built sub-modals ─────────────────────────────────────

/**
 * Rescrub modal — opened from DM button click. Terms field only.
 */
export function buildRescrubModal(metadata: string): View {
  return {
    type: 'modal',
    callback_id: 'transcript_rescrub_submit',
    private_metadata: metadata,
    title: { type: 'plain_text', text: 'Rescrub Transcript' },
    submit: { type: 'plain_text', text: 'Rescrub' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'rescrub_terms_block',
        label: { type: 'plain_text', text: 'Additional names or terms to scrub' },
        hint: { type: 'plain_text', text: 'Comma-separated. These terms are used for find/replace and then discarded — they are not saved anywhere.' },
        element: {
          type: 'plain_text_input',
          action_id: 'rescrub_terms',
          placeholder: { type: 'plain_text', text: 'e.g., Sarah, Denver VA, Dr. Martinez' },
        }
      },
    ]
  } as unknown as View;
}

/**
 * Approve modal — opened from DM button click. Attestation checkbox only.
 */
export function buildApproveModal(metadata: string): View {
  return {
    type: 'modal',
    callback_id: 'transcript_approve_submit',
    private_metadata: metadata,
    title: { type: 'plain_text', text: 'Approve Transcript' },
    submit: { type: 'plain_text', text: 'Approve' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
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
    ]
  } as unknown as View;
}

/**
 * Reject modal — opened from DM button click. Required note field.
 */
export function buildRejectModal(metadata: string): View {
  return {
    type: 'modal',
    callback_id: 'transcript_reject_submit',
    private_metadata: metadata,
    title: { type: 'plain_text', text: 'Reject Transcript' },
    submit: { type: 'plain_text', text: 'Reject' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'reject_note_block',
        label: { type: 'plain_text', text: 'What needs to be fixed?' },
        hint: { type: 'plain_text', text: 'This note is sent to the uploader. The quarantine file will be deleted.' },
        element: {
          type: 'plain_text_input',
          action_id: 'reject_note',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'e.g., Participant name appears at timestamp 3:42, location mentioned at 7:15' },
        }
      },
    ]
  } as unknown as View;
}

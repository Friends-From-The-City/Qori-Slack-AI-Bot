import type { View } from '@slack/types';

// Helper to get display label for transcript source
const SOURCE_LABELS: Record<string, string> = {
  zoom: 'Zoom auto-generated',
  otter: 'Otter.ai',
  rev: 'Rev.com',
  teams: 'Teams auto-generated',
  other: 'Other'
};
const getSourceLabel = (value: string): string => SOURCE_LABELS[value] || 'Other';

// ─── Modal metadata contract ─────────────────────────────────────

/**
 * Preserved input values that transit through private_metadata during view rebuilds.
 * PRIVACY: piiRealName is TRANSIENT — used only for find/replace during scrubbing,
 * then discarded. It is never persisted to database or logged.
 */
export interface PreservedInputs {
  /** Participant's real name for PII scrubbing — TRANSIENT, never stored */
  piiRealName?: string;
  /** Pasted transcript content */
  pastedText?: string;
  /** Selected transcript source */
  transcriptSource?: string;
  /** Manual observations text */
  observations?: string;
}

/** The shape of private_metadata for the session_notes_submit modal. */
export interface SessionNotesModalMetadata {
  tab: 'manual' | 'upload';
  method: 'files' | 'paste';
  userId: string | undefined;
  teamId: string | undefined;
  channelId: string | undefined;
  selectedSessionId: number | string | undefined;
  mode: string;
  studyId: string | null;
  /** Input values preserved across view rebuilds (tab switch, session change) */
  preserved?: PreservedInputs;
}

interface SessionNotesSession {
  id: number | string;
  session_id?: string;
  displayName?: string;
  study?: { name?: string };
  participant?: { participant_name?: string };
}

interface SessionNotesState {
  tab?: 'manual' | 'upload';
  method?: 'files' | 'paste';
  origin?: { user?: string; team?: string; channel?: string };
  session?: SessionNotesSession;
  sessions?: SessionNotesSession[];
  mode?: string;
  studyId?: string | null;
  /** Input values to preserve/restore across view rebuilds */
  preserved?: PreservedInputs;
}

export const buildSessionNotesView = (state: SessionNotesState = {}) => {
  const tab = state.tab || 'upload';                // 'manual' | 'upload'
  const method = state.method || 'files';           // 'files' | 'paste'
  const isManual = tab === 'manual';

  // Store only essential data in private_metadata to avoid 3001 character limit
  // PRIVACY: preserved.piiRealName transits here during rebuilds but is never persisted
  const essentialData: SessionNotesModalMetadata = {
    tab,
    method,
    userId: state.origin?.user,
    teamId: state.origin?.team,
    channelId: state.origin?.channel,
    selectedSessionId: state.session?.id,
    mode: state.mode || 'observer',
    studyId: state.studyId || null,
    preserved: state.preserved,
  };

  return {
    type: 'modal',
    callback_id: 'session_notes_submit',
    private_metadata: JSON.stringify(essentialData),
    title: { type: 'plain_text', text: 'Session Notes' },
    submit: { type: 'plain_text', text: isManual ? 'Submit to GitHub' : 'Process & Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      // Tabs
      {
        type: 'actions',
        block_id: 'tabs',
        elements: [
          {
            type: 'button', action_id: 'tab_manual', value: 'manual',
            text: { type: 'plain_text', text: 'Manual Notes' },
            style: isManual ? 'primary' : undefined
          },
          {
            type: 'button', action_id: 'tab_upload', value: 'upload',
            text: { type: 'plain_text', text: 'Upload Transcript' },
            style: !isManual ? 'primary' : undefined
          }
        ]
      },

      // Session select (shared)
      {
        type: 'input',
        block_id: 'session_select',
        label: { type: 'plain_text', text: 'Select Session' },
        element: {
          type: 'static_select',
          action_id: 'session_select_change',
          placeholder: { type: 'plain_text', text: 'Choose the session you observed…' },
          options: (state.sessions && state.sessions.length > 0)
            ? state.sessions.map(session => {
              const code = session.session_id || 'Unknown';
              const alias = session.participant?.participant_name;
              const displayName = alias ? `${code} (${alias})` : code;
              return {
                text: {
                  type: 'plain_text',
                  text: `${session.study?.name || 'Unknown Study'} - ${displayName}`
                },
                value: session.id.toString()
              };
            })
            : [{
              text: {
                type: 'plain_text',
                text: 'No sessions available'
              },
              value: 'no_sessions'
            }],
          // initial_option must EXACTLY match one of the options (both text and value)
          // so we use the same format as options - don't use state.session.displayName
          initial_option: state.session
            ? (() => {
              const code = state.session.session_id || 'Unknown';
              const alias = state.session.participant?.participant_name;
              const displayName = alias ? `${code} (${alias})` : code;
              return {
                text: {
                  type: 'plain_text',
                  text: `${state.session.study?.name || 'Unknown Study'} - ${displayName}`
                },
                value: state.session.id.toString()
              };
            })()
            : undefined
        }
      },

      ...(isManual ? manualBlocks(state.preserved) : uploadBlocks(method, state.preserved)),

    ]
  } as unknown as View;
}

const manualBlocks = (preserved?: PreservedInputs) => {
  return [
    // Tips for Better Notes Section
    {type: 'divider'},
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "*Tips for better notes:*\n• Quote reactions: `\"This is confusing\"`\n• Note timestamps: `Minute 5: User struggled`\n• Describe tasks: `Task 1 - Find benefits (3 min)`\n• Flag issues: `VoiceOver didn't announce button`\n• Capture emotions: `User sighed, frustrated`"
        }
      ]
    },
    { type: 'divider' },

    // Your observations - Single large text input field
    {
      type: 'input',
      block_id: 'observations',
      label: {
        type: 'plain_text',
        text: 'Your observations *'
      },
      hint: {
        type: 'plain_text',
        text: 'Write naturally - AI will organize everything for you!'
      },
      element: {
        type: 'plain_text_input',
        action_id: 'observations_text',
        multiline: true,
        placeholder: {
          type: 'plain_text',
          text: 'Type or paste your session observations...'
        },
        ...(preserved?.observations ? { initial_value: preserved.observations } : {})
      }
    }
  ];
}

const uploadBlocks = (method: string, preserved?: PreservedInputs) => {
  const filesSelected = method === 'files';
  return [
    // PII Scrubbing Section
    {
      type: 'header',
      text: { type: 'plain_text', text: 'PII Scrubbing', emoji: true }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '⚠️ *Privacy protection:* Enter the participant\'s real name below. It will be replaced with their code (e.g., PT-001) in the transcript before saving. *This name is NOT stored* — it\'s used only for find/replace, then discarded.'
        }
      ]
    },
    {
      type: 'input',
      block_id: 'pii_real_name',
      optional: true,
      label: { type: 'plain_text', text: 'Participant\'s real name (for scrubbing)' },
      hint: { type: 'plain_text', text: 'e.g., "David Chen" — will be replaced with PT-001. Leave blank if transcript is already anonymized.' },
      element: {
        type: 'plain_text_input',
        action_id: 'real_name_input',
        placeholder: { type: 'plain_text', text: 'First Last' },
        ...(preserved?.piiRealName ? { initial_value: preserved.piiRealName } : {})
      }
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*Select Input Method*' } },
    // Files
    {
      type: 'input',
      block_id: 'transcript_files',
      optional: true,
      label: { type: 'plain_text', text: 'Upload File' },
      hint: { type: 'plain_text', text: 'You can attach multiple files. Common types: txt, md, pdf, docx, mp3, wav.' },
      element: {
        type: 'file_input',
        action_id: 'files',
        filetypes: ['txt', 'md', 'pdf', 'doc', 'docx', 'm4a', 'mp3', 'wav']
      }
    },
    {
			type: "input",
			block_id: "transcript_source_block",
			optional: true,
			label: {
				type: "plain_text",
				text: "Source"
			},
			element: {
				type: "static_select",
				action_id: "transcript_source",
				placeholder: {
					type: "plain_text",
					text: "Select source..."
				},
				options: [
					{
						text: {
							type: "plain_text",
							text: "Zoom auto-generated"
						},
						value: "zoom"
					},
					{
						text: {
							type: "plain_text",
							text: "Otter.ai"
						},
						value: "otter"
					},
					{
						text: {
							type: "plain_text",
							text: "Rev.com"
						},
						value: "rev"
					},
					{
						text: {
							type: "plain_text",
							text: "Teams auto-generated"
						},
						value: "teams"
					},
					{
						text: {
							type: "plain_text",
							text: "Other"
						},
						value: "other"
					}
				],
				...(preserved?.transcriptSource ? {
					initial_option: {
						text: { type: "plain_text", text: getSourceLabel(preserved.transcriptSource) },
						value: preserved.transcriptSource
					}
				} : {})
			}
		},
		{
      type: "divider"
    },
    // Paste
    {
      type: 'input',
      block_id: 'transcript_paste',
      optional: true,
      label: { type: 'plain_text', text: 'Or paste Transcript' },
      element: {
        type: 'plain_text_input', action_id: 'text', multiline: true,
        placeholder: { type: 'plain_text', text: 'Paste transcript text here...' },
        ...(preserved?.pastedText ? { initial_value: preserved.pastedText } : {})
      }
    }
  ];
}

import type { View } from '@slack/types';

// ─── Modal metadata contract ─────────────────────────────────────

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
}

export const buildSessionNotesView = (state: SessionNotesState = {}) => {
  console.log("🚀 ~ buildSessionNotesView ~ state:", state)
  const tab = state.tab || 'upload';                // 'manual' | 'upload'
  const method = state.method || 'files';           // 'files' | 'paste'
  const isManual = tab === 'manual';

  // Store only essential data in private_metadata to avoid 3001 character limit
  const essentialData: SessionNotesModalMetadata = {
    tab,
    method,
    userId: state.origin?.user,
    teamId: state.origin?.team,
    channelId: state.origin?.channel,
    selectedSessionId: state.session?.id,
    mode: state.mode || 'observer',
    studyId: state.studyId || null,
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
          initial_option: state.session
            ? (() => {
              const code = state.session.session_id || 'Unknown';
              const alias = state.session.participant?.participant_name;
              const displayName = alias ? `${code} (${alias})` : code;
              return {
                text: {
                  type: 'plain_text',
                  text: state.session.displayName || `${state.session.study?.name || 'Unknown Study'} - ${displayName}`
                },
                value: state.session.id.toString()
              };
            })()
            : undefined
        }
      },

      ...(isManual ? manualBlocks() : uploadBlocks(method)),

    ]
  } as unknown as View;
}

const manualBlocks = () => {
  return [
    // Tips for Better Notes Section
    {type: 'divider'},
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "💡 *Tips for better notes:*\n• Quote reactions: `\"This is confusing\"`\n• Note timestamps: `Minute 5: User struggled`\n• Describe tasks: `Task 1 - Find benefits (3 min)`\n• Flag issues: `VoiceOver didn't announce button`\n• Capture emotions: `User sighed, frustrated`"
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
        }
      }
    }
  ];
}

const uploadBlocks = (method: string) => {
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
        placeholder: { type: 'plain_text', text: 'First Last' }
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
				]
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
        placeholder: { type: 'plain_text', text: 'Paste transcript text here...' }
      }
    }
  ];
}

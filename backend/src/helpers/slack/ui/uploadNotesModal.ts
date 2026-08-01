// ─── Modal metadata contract ─────────────────────────────────────

/** The shape of private_metadata for the fieldwork_upload_modal. */
export interface UploadNotesModalMetadata {
  study: string;
}

interface Participant {
  id: number | string;
  participant_name: string;
  study_id: number | string;
  scheduled_date?: string;
  study?: { name?: string };
}

export const uploadNotesModal = (participants: Participant[] = []) => {
  // Create participant options for dropdown
  const participantOptions = participants.map(participant => ({
    text: { type: "plain_text", text: participant.participant_name },
    value: `${participant.id}|${participant.study_id}|${participant.study?.name || 'Unknown Study'}|${participant.scheduled_date || 'TBD'}`
  }));

  return {
    "type": "modal",
    "callback_id": "fieldwork_upload_modal",
    "private_metadata": JSON.stringify({ study: "VA Housing Application Study" } satisfies UploadNotesModalMetadata),
    "title": {
      "type": "plain_text",
      "text": "Upload to Fieldwork",
      "emoji": true
    },
    "submit": {
      "type": "plain_text",
      "text": "Upload",
      "emoji": true
    },
    "close": {
      "type": "plain_text",
      "text": "Cancel",
      "emoji": true
    },
    "blocks": [
      {
        "type": "header",
        "text": { "type": "plain_text", "text": "Destination & Participant", "emoji": true }
      },

      /* Folder */
      {
        "type": "input",
        "block_id": "folder_block",
        "label": { "type": "plain_text", "text": "Folder", "emoji": true },
        "element": {
          "type": "static_select",
          "action_id": "folder_select",
          "placeholder": { "type": "plain_text", "text": "Select folder…" },
          "options": [
            { "text": { "type": "plain_text", "text": "redacted-transcripts" }, "value": "redacted-transcripts" },
            { "text": { "type": "plain_text", "text": "session-notes" }, "value": "session-notes" }
          ]
        }
      },

      /* Participant */
      {
        "type": "input",
        "block_id": "participant_block",
        "label": { "type": "plain_text", "text": "Participant", "emoji": true },
        "element": {
          "type": "static_select",
          "action_id": "participant_select",
          "placeholder": { "type": "plain_text", "text": "Select participant..." },
          "options": participantOptions
        }
      },


      { "type": "divider" },

      /* Session Notes Button */
      {
        "type": "actions",
        "block_id": "session_notes_button_block",
        "elements": [
          {
            "type": "button",
            "action_id": "select_session_notes",
            "text": { "type": "plain_text", "text": "Take Notes", "emoji": true },
            "style": "primary",
            "value": "session_notes"
          }
        ]
      },

      /* File Upload Zone */
      {
        "type": "input",
        "block_id": "file_input_block",
        "optional": true,
        "label": { "type": "plain_text", "text": "Files", "emoji": true },
        "element": {
          "type": "file_input",
          "action_id": "files_upload",
          "max_files": 5
        },
        "hint": {
          "type": "plain_text",
          "text": "Select folder and participant to upload files. File types will be shown based on folder selection."
        }
      },

      { "type": "divider" },

      /* Processing Information */
      {
        "type": "section",
        "block_id": "processing_info_title",
        "text": { "type": "mrkdwn", "text": "*Processing Details*" }
      },
      {
        "type": "context",
        "block_id": "processing_info_desc",
        "elements": [
          { "type": "mrkdwn", "text": "Select a folder to see how your content will be processed." }
        ]
      },

      /* Destination Preview */
      {
        "type": "section",
        "block_id": "destination_preview",
        "text": {
          "type": "mrkdwn",
          "text": "`{project}/{study}/03-fieldwork/[folder]/[participant]-[type]-[date].[ext]`"
        }
      },

      /* Footer info */
      {
        "type": "context",
        "block_id": "footer_info",
        "elements": [
          { "type": "mrkdwn", "text": "Files will be processed and committed to GitHub automatically." }
        ]
      }
    ]
  };
};

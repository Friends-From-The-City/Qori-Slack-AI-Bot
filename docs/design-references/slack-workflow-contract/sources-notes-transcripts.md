# Sources, Notes, and Transcripts Contract

**Status:** IMPLEMENTED
**Entry Point:** `/qori-fieldwork` → "Upload Notes" or session notes tab
**Handler:** `backend/src/helpers/slack/commands/sessionNotesHandler.ts` (58K, complex)
**Model:** `backend/src/database/models/study_notes.ts`

## Source Input Methods

### 1. Manual Observations (Tab: Manual)

**Purpose:** Researcher types observation notes directly into Slack.

| UI Label | Type | Required | Details |
|----------|------|----------|---------|
| Study select | static_select | Yes | Populated from user's studies |
| Session select | static_select | Yes | Populated from study participants |
| Observation notes | plain_text_input (multiline) | Yes | Free-text observations |

**Flow:**
1. Researcher types observations
2. Submitted → stored in `study_notes.pending_content` (DB quarantine)
3. DM sent to researcher with Approve / Reject buttons
4. Approve → notes promoted to final location, pending_content cleared
5. Reject → pending_content deleted

**Authority:** CANONICAL (study_notes table, pending_content field for quarantine)

### 2. Transcript Upload (Tab: Upload)

**Purpose:** Upload transcript files or paste transcript text.

| UI Label | Type | Required | Details |
|----------|------|----------|---------|
| Study select | static_select | Yes | Populated from user's studies |
| Session select | static_select | Yes | Populated from study participants |
| Participant real name | plain_text_input | No | **PII** — transient, used for scrubbing, NOT stored canonically |
| Transcript files | file_input | Yes (or paste) | .txt, .docx, or paste |
| Pasted transcript | plain_text_input (multiline) | Yes (or files) | Alternative to file upload |

**Flow:**
1. Researcher uploads file or pastes text
2. Auto-scrub: phone/email patterns removed by regex
3. Content written to GitHub quarantine path
4. DM sent to researcher with three buttons: Approve / Reject / Rescrub
5. **Approve** → quarantine deleted, final study_notes record created, `pii_reviewed=true`
6. **Reject** → quarantine deleted, no record created
7. **Rescrub** → opens modal for additional terms to scrub, re-applies to quarantine

**Authority:**
- Quarantine: ARTIFACT (GitHub quarantine path)
- Final: CANONICAL (study_notes table with pii_reviewed=true)
- participant_real_name: EPHEMERAL (transient, never stored)

### 3. File Upload via Discovery

Source documents uploaded via `/qori-discover` become evidence sources but are NOT treated as transcripts — they follow a different pipeline (file → AI analysis → variables).

## Transcript Representation

| Field | Type | Details |
|-------|------|---------|
| id | INTEGER PK | Internal |
| study_id | FK | Study scope |
| filename | STRING | Upsert key: (filename, study_id) |
| content | TEXT | Final approved content |
| pending_content | TEXT | DB quarantine (manual notes only) |
| source_type | STRING | 'transcript', 'observation', 'notes' |
| participant_code | STRING | PT-NNN format, links to StudyParticipant |
| pii_reviewed | BOOLEAN | Must be true for analysis consumption |
| pii_reviewed_by | STRING | Slack user ID of reviewer |
| pii_reviewed_at | DATE | Review timestamp |

## Speaker Model

- **Participant code** (PT-NNN) used as speaker identifier — system-assigned, not participant real name
- **Moderator/researcher identity:** Not explicitly modeled in transcript structure; inferred from context
- **Turns/segments:** Not structured — transcripts stored as plain text blocks, not turn-level segments

## Privacy / PII Architecture

**Dual quarantine strategy:**
1. Manual notes → DB quarantine (pending_content field)
2. Uploaded transcripts → GitHub quarantine path

**Auto-scrub:** Phone numbers, email patterns detected and removed by regex
**Rescrub loop:** Word-boundary-anchored find/replace, audits replacement counts (not terms)
**participant_real_name:** Provided by researcher for scrubbing accuracy, NEVER persisted

## What Qori Does NOT Currently Support

- **Inline transcript highlighting** — NOT IMPLEMENTED
- **Source-span annotations** — NOT IMPLEMENTED
- **Researcher comments on transcript content** — NOT IMPLEMENTED
- **Manual promote-to-evidence** — NOT IMPLEMENTED (evidence extraction is AI-driven via /qori-analyze)
- **Exact source span stable references** — NOT IMPLEMENTED (evidence links to source, not specific text range)
- **Structured turn-level transcript parsing** — NOT IMPLEMENTED (plain text only)
- **Audio/video upload** — NOT IMPLEMENTED
- **Inline code assignment** — NOT IMPLEMENTED (coding happens in /qori-analyze AI pipeline)
- **Version history for transcripts** — NOT IMPLEMENTED
- **Collaborative annotation** — NOT IMPLEMENTED

## How Sources Reach Synthesis

```
Transcript/Notes → PII Review → Approved study_notes record
                                        │
                     /qori-analyze ◄─────┘
                         │
                    AI extraction → atomic_nugget_core + detail
                         │
                    study_variables (cascade)
                         │
                /qori-synthesis ◄───────────────────────┘
```

## Workspace Design Notes

- Manual notes → rich text editor (not plain text area)
- File upload → drag-and-drop with format validation
- PII review → inline viewer with highlighted PII terms + approve/reject/rescrub
- Transcript viewer → scrollable source viewer panel (see design component-inventory)
- Missing: structured turn parsing, inline highlighting, source-span annotations — all noted as NOT IMPLEMENTED

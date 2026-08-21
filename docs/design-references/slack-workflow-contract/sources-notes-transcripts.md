# Sources, Notes, and Transcripts Contract

**Status:** IMPLEMENTED
**Entry Point:** `/qori-notes` (or `/qori-fieldwork` -> session notes)
**Handler:** `backend/src/helpers/slack/commands/sessionNotesHandler.ts`
**Modal Builder:** `backend/src/helpers/slack/ui/sessionNotesModal.ts`
**Review UI:** `backend/src/helpers/slack/ui/transcriptReviewModal.ts`
**Scrubber:** `backend/src/helpers/transcriptScrubber.ts`
**PII Patterns:** `backend/src/helpers/piiPatterns.ts`
**Model:** `backend/src/database/models/study_notes.ts`

## CURRENT: Source Input Methods

### 1. Manual Observations (Tab: manual)

**Purpose:** Researcher types observation notes directly into Slack.

**Modal fields** (from `sessionNotesModal.ts`, `manualBlocks` function):

| UI Label | block_id | action_id | Type | Required | Notes |
|----------|----------|-----------|------|----------|-------|
| Select Session | `session_select` | `session_select_change` | `static_select` | Yes | Populated from user's sessions (study + participant code). Shared across both tabs. |
| Your observations | `observations` | `observations_text` | `plain_text_input` (multiline) | Yes | Free-text observations. Preserved across tab switches via `PreservedInputs.observations`. |

**Quarantine:** Database (`study_notes.pending_content` field). Content is stored in the `pending_content` column until reviewed.

**Review flow:** DM sent to researcher with two buttons:
- `manual_notes_approve` (style: `primary`, text: "Approve & Commit to Git")
- `manual_notes_reject` (style: `danger`, text: "Reject -- needs source fix")

This is a **binary** review (Approve / Reject). There is no Rescrub button for manual notes.

**Source:** `sessionNotesHandler.ts` lines 792-793, `events.ts` lines 553-554.

### 2. Transcript Upload (Tab: upload)

**Purpose:** Upload transcript files or paste transcript text.

**Modal fields** (from `sessionNotesModal.ts`, `uploadBlocks` function):

| UI Label | block_id | action_id | Type | Required | Notes |
|----------|----------|-----------|------|----------|-------|
| Select Session | `session_select` | `session_select_change` | `static_select` | Yes | Shared with manual tab |
| Participant's real name | `pii_real_name` | `real_name_input` | `plain_text_input` | No (optional) | **Transient PII** -- used only for in-memory find/replace scrubbing, never persisted to DB, log, or error message. Preserved across tab switches via `PreservedInputs.piiRealName`. |
| Upload file | `transcript_files` | `files` | `file_input` | No (optional, or paste) | Accepted filetypes: `txt, md, pdf, doc, docx, m4a, mp3, wav` |
| Source | `transcript_source_block` | `transcript_source` | `static_select` | No (optional) | Options: Zoom auto-generated, Otter.ai, Rev.com, Teams auto-generated, Other |
| Or paste transcript | `transcript_paste` | `text` | `plain_text_input` (multiline) | No (optional, or file) | Alternative to file upload |

**Note:** There is no radio button for transcript method (paste vs file). Both input surfaces are always visible. The user can use either or both.

**Auto-scrub** (from `piiPatterns.ts` and `transcriptScrubber.ts`):

The scrubber applies these patterns in order:

| Pattern | Regex | Replacement |
|---------|-------|-------------|
| Phone (10-digit) | `/\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g` | `[PHONE]` |
| Phone (7-digit) | `/\b[0-9]{3}[-.\s]?[0-9]{4}\b/g` | `[PHONE]` |
| Email | `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z\|a-z]{2,}\b/g` | `[EMAIL]` |

Additionally, `transcriptScrubber.ts` performs name-based scrubbing when participant real name is provided:
- **Participant name variants**: full name, first name (>= 3 chars), last name (>= 3 chars), honorific+last (Mr./Ms./Mrs.) -> participant code (e.g., `PT-001`)
- **Moderator name variants**: same decomposition -> `[Moderator]`
- **Speaker label initials**: e.g., "DC:" -> `[Participant]:` or `[Moderator]:`

Scrub stats are tracked per-type (`participantName`, `moderatorName`, `speakerLabels`, `phoneNumbers`, `emailAddresses`) and displayed in the review DM.

**Quarantine:** GitHub working tree (quarantine path). Content is written to a quarantine location in the GitHub repo.

**Review flow:** DM sent to researcher with three buttons (from `transcriptReviewModal.ts` lines 146-167):
- `transcript_rescrub` (no style, text: "Rescrub")
- `transcript_approve` (style: `primary`, text: "Approve")
- `transcript_reject` (style: `danger`, text: "Reject")

This is a **three-way** review (Rescrub / Approve / Reject).

**Rescrub flow:**
1. Rescrub button opens a pushed modal (`callback_id: 'transcript_rescrub_submit'`)
2. Single input field: `rescrub_terms_block` / `rescrub_terms` -- comma-separated terms
3. Terms are applied as word-boundary-anchored find/replace -> `[REDACTED]`
4. DM is updated with cumulative scrub stats (auto-scrub counts + rescrub redaction count)
5. Rescrub can be repeated (cumulative)
6. Terms are transient -- used for replacement, then discarded

**Approve outcome:** Quarantine file deleted, final `study_notes` record created with `pii_reviewed=true`. DM updated to terminal approved state with GitHub link.

**Reject outcome:** Quarantine file deleted, no record created. DM updated to terminal rejected state. Deleted file remains in git history permanently (ADR 0026 section 6).

### 3. File Upload via Discovery

Source documents uploaded via `/qori-discover` become evidence sources but follow a different pipeline (file -> AI analysis -> variables). They are not treated as transcripts.

## CURRENT: study_notes Schema

From `backend/src/database/models/study_notes.ts`:

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | INTEGER (PK) | No | auto-increment | |
| `study_id` | INTEGER (FK -> research_studies) | No | -- | CASCADE on delete |
| `participant_id` | INTEGER (FK -> study_participants) | Yes | NULL | SET NULL on delete |
| `study_name` | STRING(500) | No | -- | |
| `filename` | STRING(500) | No | -- | |
| `file_path` | STRING(1000) | Yes | NULL | |
| `file_url` | STRING(1000) | Yes | NULL | |
| `transcript` | BOOLEAN | No | `false` | Distinguishes transcripts from manual notes |
| `session_date` | DATEONLY | Yes | NULL | |
| `session_time` | TIME | Yes | NULL | Stored as string in JS |
| `created_by` | STRING | No | -- | Slack user ID |
| `created_at` | DATE | No | `CURRENT_TIMESTAMP` | |
| `updated_at` | DATE | No | `CURRENT_TIMESTAMP` | |
| `pii_reviewed` | BOOLEAN | No | `false` | Must be true for analysis consumption |
| `pii_reviewed_at` | DATE | Yes | NULL | |
| `pii_reviewed_by` | STRING | Yes | NULL | Slack user ID of reviewer |
| `pending_content` | TEXT | Yes | NULL | DB quarantine for manual notes only. Cleared after git write on approval. |

**Note:** The model does NOT have `content`, `source_type`, or `participant_code` columns. Those were listed in the previous version of this document but do not exist in the runtime model definition.

## CURRENT: Privacy / PII Architecture

**Dual quarantine strategy:**
1. Manual notes -> DB quarantine (`pending_content` field in `study_notes` table)
2. Uploaded transcripts -> GitHub quarantine path (separate from final location)

**Auto-scrub (upload only):** Phone numbers (10-digit and 7-digit US formats) and email addresses detected and replaced by regex via shared patterns in `piiPatterns.ts`. Additionally, participant name variants and moderator name variants are scrubbed by `transcriptScrubber.ts`.

**Rescrub loop (upload only):** Comma-separated terms from researcher, applied as word-boundary-anchored find/replace -> `[REDACTED]`. Stats tracked cumulatively. Can be repeated before approval.

**Pre-transmission PII redaction (separate from upload scrub):** `piiRedaction.ts` provides `redactTranscript()` which replaces known participant full names with participant codes BEFORE content is sent to the Anthropic API during `/qori-analyze`. This is a separate layer from upload-time scrubbing.

**participant_real_name:** Provided by researcher at upload time for scrubbing accuracy. Transits through `PreservedInputs` during modal rebuilds. NEVER persisted to database, logs, temp files, or error messages.

## NOT IMPLEMENTED

These 8 capabilities are confirmed absent from the runtime code:

1. **Inline transcript highlighting** -- no UI for highlighting text spans within transcripts
2. **Exact-span annotations** -- no mechanism for attaching annotations to specific text ranges
3. **Researcher comments on sources** -- no comment/discussion surface on transcript content
4. **Qualitative coding on transcript** -- coding happens in `/qori-analyze` AI pipeline, not manual on-transcript
5. **Manual nugget creation** -- evidence extraction is AI-driven only; no manual creation surface
6. **Promote-to-evidence** -- no manual path to promote a transcript excerpt to an evidence nugget
7. **Stable span anchors** -- evidence links to source file, not to specific text ranges within files
8. **Media clips** -- audio/video files can be uploaded (`m4a, mp3, wav` accepted) but there is no playback, clipping, or time-coded annotation

## CURRENT: How Sources Reach Synthesis

```
Transcript/Notes -> PII Review -> Approved study_notes record
                                        |
                     /qori-analyze <-----+
                         |
                    AI extraction -> atomic_nugget_core + detail
                         |
                    study_variables (cascade)
                         |
                /qori-synthesis <-----------------------+
```

The key transition point: only `study_notes` records with `pii_reviewed=true` are eligible for `/qori-analyze` consumption.

## INTENDED (architectural direction)

- Manual notes -> rich text editor (not plain text area)
- File upload -> drag-and-drop with format validation
- PII review -> inline viewer with highlighted PII terms + approve/reject/rescrub
- Transcript viewer -> scrollable source viewer panel
- Structured turn-level transcript parsing

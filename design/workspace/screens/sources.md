# Screen: Sources

**Route** `/studies/:id/sources` · **Purpose**: Ingest and manage study inputs (transcripts, notes, survey exports).

## Hierarchy
Study shell → Sources tab: [Add sources] primary · FileUpload dropzone (collapsed to button once sources exist) · sources DataTable.

Columns (priority): P1 name, type, status · P2 date added, evidence count · P3 added by, size. Status per source: Uploading → Privacy check → Needs privacy review → Ready → Analyzed (evidence count link) · Failed.

## Interactions
Row → source drawer (metadata, privacy state, evidence extracted from it, remove-with-consequence). "Analyze sources" acts on Ready sources; per-file staged progress during ingestion (PII scrubbing at ingestion, ADR-0026). Needs-privacy-review routes to authorized reviewer queue.

## Data
Sources[] (name, type, status, dates, evidence counts, privacy state), upload policy (types, size), analyze eligibility.

## States
Empty (dropzone hero + accepted-types help), uploading (per-file), privacy-review pending (who can act), failed (cause + retry per file), analyzed, source removed with downstream evidence (consequence dialog: "12 evidence items came from this source — they'll be flagged").

## Breakpoints
Table drops P2/P3 per rules; sm stacked cards; dropzone → "Add sources" button (system file picker).

## A11y
Dropzone has button alternative; per-file progress announced individually; table semantics; privacy states never color-only.

## API
`POST /studies/:id/sources` (multipart), `GET /studies/:id/sources`, `POST /studies/:id/analyze`, per-source status stream/poll.

## Unresolved
- Audio/video ingestion v1 or transcript-only?
- Source-level re-analysis vs whole-study only

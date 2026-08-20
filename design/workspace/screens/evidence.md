# Screen: Evidence Browser

**Route** `/studies/:id/evidence` · **Purpose**: Browse/filter the study's evidence items (nuggets, in UI language: evidence); the verbatim ground truth.

## Hierarchy
Study shell → Evidence tab: FilterBar (source, participant, tags, theme, date, stale) · count line ("84 evidence items · 7 sources") · evidence list (single column of EvidenceItem rows, grouped by source or theme via group toggle).

## Interactions
Item → EvidenceDrawer: full verbatim, participant code, source link, capture date, tags (add researcher tags here), everything it supports (themes/findings — forward lineage). Tag filtering on chip click. Group-by toggle (Source | Theme | None) persists per user.

## Data
Evidence[] (text, participant code, source ref, date, tags, theme refs, downstream refs, stale flag), facet counts.

## States
Empty pre-analysis ("No evidence yet — analyze your sources"), filtered empty, stale items flagged inline, partial (extraction running: list grows live with polite announcement "12 new evidence items"), permission (participant identifiers per privacy policy — codes only).

## Breakpoints
List is single-column at all sizes; FilterBar → sheet at md; drawer full-screen at sm.

## A11y
Quotes as blockquote; participant codes expanded for SR; group headings are h3; live-region growth announcements throttled.

## API
`GET /studies/:id/evidence?filters&group`, `PATCH /evidence/:id/tags`, facet counts endpoint.

## Unresolved
- Evidence editing/redaction post-ingestion (governance implications)
- Cross-study evidence browsing v1.1?

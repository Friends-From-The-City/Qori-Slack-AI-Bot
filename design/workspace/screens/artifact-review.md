# Screen: Artifact Review / Publish

**Route** `/artifacts/:id` · **Purpose**: Read, review, approve, and publish Qori-generated documents without leaving the Workspace.

## Layout (xl)

```
PageHeader: crumbs · h1 artifact title · StatusBadge (workflow)
            PublicationStatus pill · [Approve] [Request changes] ⋯
Version bar: v3 · Supersedes v2 · Generated Mar 12 by Qori (from 9 findings) · History
┌ Document (rendered md, max 760px measure) ─┐ ┌ Provenance rail ─────┐
│ ## Key findings                            │ │ Citations (14)       │
│ Older veterans abandon scheduling…[1]      │ │ [1] Finding: …       │
│ …                                          │ │     12 evidence ⏱    │
│                                            │ │ [2] Finding: …       │
└────────────────────────────────────────────┘ └──────────────────────┘
Review footer (when Needs review): comment box · [Approve] [Request changes]
```

## Data
Artifact body, citations map, workflow status + history, versions, publication records (per adapter: state, URL, last attempt, error cause), review threads, destination config.

## Interactions
Citation markers ↔ rail (bidirectional highlight); rail entry → EvidenceDrawer; Approve → publish enabled; Publish dialog (destination + visibility consequence); Retry publication (idempotent); Open in GitHub ↗ when published; version rows → read prior versions (Superseded watermark).

## States
Generating (staged stepper full-pane), draft (suggested treatment banner "Not yet reviewed"), needs review, approved, publishing, published, **publication failed** (workflow badge unchanged + red pill + plain cause + Retry; member variant: "ask your administrator"), superseded, archived.

## Breakpoints
xl/lg: two-pane · md/sm: provenance becomes "Citations (14)" tab; review footer sticky; document measure fluid ≥320px.

## A11y
Document is semantic HTML; citations are links with accessible names ("Citation 1: finding — supported by 12 evidence items"); rail `complementary`; status changes announced; publish dialog trap.

## API
`GET /artifacts/:id` (+body, citations, versions), `POST /artifacts/:id/review`, `POST /artifacts/:id/publish`, `POST /artifacts/:id/publish/retry`, version endpoints.

## Unresolved
- Inline tracked edits v1 vs regenerate-only
- Multiple reviewers / approval quorum per org config?

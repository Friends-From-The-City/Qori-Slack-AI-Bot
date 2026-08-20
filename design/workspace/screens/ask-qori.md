# Screen: Ask Qori

**Route** `/ask` (also docked panel from Search) · **Purpose**: Provenance-bearing Q&A over the scoped, authorized corpus. Full model in `search-and-ask-qori.md`.

## Hierarchy
Scope banner (always first: "Answering from: Project Alpha · 3 studies · 214 evidence items" + Edit scope) → question input → answer thread (question · staged status · streamed answer with numbered citations · supporting findings cards · "Why these results" disclosure) → prior questions this session (collapsed).

## Data
Scope descriptor + corpus counts, streamed answer, citation map, retrieval rationale, degraded flags, session history.

## Interactions
Edit scope opens the same facet controls as Search; citations → TraceabilityPanel; findings cards → drawers; Cancel during generation; "Save as note" (explicit, AI-assisted-marked); copy answer with citations.

## States
No scope (teach + suggest recent study), thin corpus warning pre-answer, generating (staged: "Reading 214 evidence items… Drafting answer…"), stale citations flagged inline, AI unavailable (screen explains + points to Search), answer failed (retry keeps question).

## Breakpoints
Docked panel 384px from Search (xl) · standalone column max 760px · sm full-screen; scope banner condenses to count + edit.

## A11y
Scope banner precedes answer in DOM; streamed answer chunked into polite live region per paragraph; citations real links; cancel reachable during generation; h1 "Ask Qori".

## API
`POST /ask` (scope + question, streaming), citation-resolution endpoint, `POST /notes` (save-as-note), scope validation.

## Unresolved
- Multi-turn conversation vs single Q&A per ask (v1: single Q&A with session list)
- Note persistence location (study vs personal)

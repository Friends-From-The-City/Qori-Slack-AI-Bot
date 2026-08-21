# Screen: Transcript / Source PII Review (P0)

Route: /studies/:id/sources/:noteId/review. Contracts: sources-notes-transcripts.md; Phase 3 gate pattern 1.
Reading task over the FULL quarantined transcript. Three marks only (all real): auto-scrub chips ([PHONE-01]), rescrub-applied chips, researcher's live selection for rescrub terms. NO inline annotation/comments/promotion (NOT IMPLEMENTED).
Rail: scrub ledger (counts by type; terms never stored), rescrub input (word-boundary find/replace, re-applies to quarantine, keeps reading position).
Decision bar: Approve & attest (unlocks at last screen + attestation) / Rescrub / Reject with note. Approve -> pii_reviewed=true, quarantine deleted, analysis unlocked. Manual-notes variant: DB quarantine, Approve/Reject only.
Keyboard per gate frame; SR announcements for chips and decisions.

## Upload attachment (Block 3 review)
Two entry points: (1) session-first — "Upload transcript" on a session row pre-fills session/PT-code, nothing asked; (2) dropzone-first — dropped files enter an attach step (required session picker; optional participant real name, ephemeral, "used once to remove it — never stored") before "Quarantine & scrub". A file is never ingested without a session.
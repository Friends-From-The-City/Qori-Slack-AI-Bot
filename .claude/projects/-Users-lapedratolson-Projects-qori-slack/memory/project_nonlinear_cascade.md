---
name: Non-linear cascade and fresh modal queries
description: Architecture concern — modals must query state fresh on every open; researchers don't work linearly through cascade steps
type: project
---

Researchers don't work linearly through the cascade (brief → plan → fieldwork → analysis). They jump between steps, revisit, and run things out of order.

**Why:** Raised during cascade testing (2026-05-04). /qori-notes showed stale participant data because it depends on SessionObserver intermediary records, not direct participant queries. Broader pattern likely affects multiple modals.

**How to apply:**
- Every modal that reads study state (participants, sessions, notes, variables) must query fresh on open — no assumptions about what steps ran before
- Verify all modals with cascade consumes handle missing upstream gracefully (already done for session_summary v2.0, brief v6.0 — check others)
- The SessionObserver intermediary pattern may need rethinking: should /qori-notes also offer a direct participant dropdown as fallback when no observer sessions exist?
- Affects: /qori-notes, /qori-analyze, /qori-plan, and any modal that reads from study-variables.json or joined tables

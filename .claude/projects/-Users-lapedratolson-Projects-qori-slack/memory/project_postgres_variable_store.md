---
name: Postgres variable store architecture
description: Variables migrated from GitHub JSON to Postgres (May 5 2026) — authoritative store with transactions, per-participant pool merge, model selection
type: project
---

Cascade variables are now stored in Postgres `study_variables` table (authoritative). GitHub JSON files retained as debugging artifacts only.

**Why:** GitHub JSON had race conditions on concurrent writes (two session analyses simultaneously), no atomic per-participant replace, and schema files weren't deployed to production container (schemas at repo root, Railway deploys from backend/).

**How to apply:**
- `studyVariables.js` handles all read/write — same exports, Postgres-backed
- Pool merge: `append_or_replace_per_participant` = DELETE WHERE participant_id + INSERT in transaction
- Discovery uses synthetic study_id: `discovery:{team}:{type}`
- Schemas live at `backend/config/schemas/` (inside deploy context)
- Migration script: `backend/scripts/migrate-variables-to-postgres.js` (one-time, for existing data)
- Extraction model: per-emit selection via `extraction_model: sonnet` in YAML or complexity heuristic
- Schema split: atomic_nugget → atomic_nugget_core (6 fields) + atomic_nugget_detail (11 fields)
- Fallback: if Postgres empty on read, falls back to GitHub JSON (migration period)

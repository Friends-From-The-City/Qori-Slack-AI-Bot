# Follow-on: participant_code Migration Gap

**Filed:** 2026-06-05
**Related:** ADR 0020 (System-Assigned Per-Study Participant Codes)
**Priority:** Medium (not blocking, but critical for federal deployment)

## Issue

The `participant_code` migration (`20260602000000-add-participant-code.js`) is **clean-break-only** — it assumes an empty `study_participants` table and provides no migration path for existing data.

### What happened

- Migration adds `participant_code` column with default `'PT-000'`
- Removes the default after column creation
- Comment states: *"PRE-REQUISITE: Tables must be empty before running this migration."*

If the table is NOT empty (as happened in dev), all existing participants get `participant_code = 'PT-000'`, collapsing all codes to one value.

### Why this matters for federal deployment

ADR 0020 establishes participant codes as the **canonical identifier** for patent-chain traceability:

```
PT-XXX → session notes → atomic nuggets → quotes
```

If a VA deployment ever:
- Imports existing participant data from another system
- Migrates from a legacy Qori installation
- Restores from backup after the migration

...the same bug would collapse all participant codes to `PT-000`, **breaking traceability** for every existing participant.

## Current state

- Dev data: Affected records were disposable test data (cleaned up manually)
- Production: No existing participants at time of migration (non-issue)
- Future deployments: At risk if they have pre-existing data

## Recommended fix

Add a **data migration** that assigns proper codes to any existing participants:

```sql
-- For each study, assign PT-001, PT-002, etc. to existing participants
-- based on creation order
WITH numbered AS (
  SELECT id, study_id,
         'PT-' || LPAD(
           ROW_NUMBER() OVER (PARTITION BY study_id ORDER BY created_at)::TEXT,
           3, '0'
         ) AS new_code
  FROM study_participants
  WHERE participant_code = 'PT-000'
)
UPDATE study_participants sp
SET participant_code = n.new_code
FROM numbered n
WHERE sp.id = n.id;
```

This would:
1. Respect creation order within each study
2. Generate proper PT-XXX codes
3. Maintain uniqueness constraint

## Impact if not fixed

- Any deployment with pre-existing participants will have broken traceability
- Manual cleanup required (as done in dev)
- Federal audit trail could be compromised if not caught

## Notes

This is the clean-break migration strategy's edge case: works perfectly for greenfield, fails silently for brownfield. The migration should either:
1. Refuse to run if table is non-empty (fail loud)
2. Properly migrate existing data (handle gracefully)

Currently it does neither — it silently defaults everything to PT-000.

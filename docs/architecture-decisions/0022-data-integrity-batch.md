# ADR 0022: Data Integrity Batch (R1/R2/R3)

**Status:** Accepted
**Date:** 2026-06-03
**Deciders:** Claude Code with user

## Context

As part of the v1.0 cleanup campaign, we identified three data integrity issues that required schema-level fixes:

1. **R1 (CHECK constraints):** Application-level enum validation (`status_select`, `outreach_method`) could be bypassed. Defense in depth requires DB-level enforcement.

2. **R2 (Temporal column types):** `scheduled_date`, `scheduled_time`, `session_date`, `session_time` were VARCHAR columns storing date/time strings. This prevents proper sorting, indexing, and date arithmetic.

3. **R3 (Denormalized count):** `research_studies.total_participants` was a denormalized counter that could drift from reality. The participant rows ARE the count.

Additionally, **A1 (FK-based queries)** required updating service code that still queried child tables by `study_name` string instead of `study_id` FK.

## Decision

### R1: DB-level CHECK constraints for enums

Added CHECK constraints to `study_participants` table:

```sql
ALTER TABLE study_participants
ADD CONSTRAINT chk_participant_status
CHECK (status_select IN (
  'not_contacted', 'contacted', 'scheduled', 'confirmed',
  'needs_reschedule', 'completed', 'declined', 'disqualified',
  'no_response', 'canceled'
) OR status_select IS NULL);

ALTER TABLE study_participants
ADD CONSTRAINT chk_outreach_method
CHECK (outreach_method IN (
  'email', 'slack', 'phone', 'other'
) OR outreach_method IS NULL);
```

**Rationale:** App-level validation is necessary but insufficient. DB constraints are the last line of defense and cannot be bypassed by direct SQL, migrations, or bugs in new code paths.

### R2: Proper DATE/TIME types with timezone anchor

Converted temporal columns from VARCHAR to native types:
- `study_participants.scheduled_date` → DATE
- `study_participants.scheduled_time` → TIME
- `study_notes.session_date` → DATE
- `study_notes.session_time` → TIME

Added `research_studies.session_timezone` (VARCHAR(50), default `'America/New_York'`) to anchor naive times.

**Rationale:**

1. **Why DATE/TIME instead of VARCHAR:** Proper types enable sorting, comparison, indexing, and date arithmetic. VARCHAR "2026-06-15" sorts correctly but only by accident of ISO format.

2. **Why not TIMESTAMPTZ:** Sessions are scheduled events with user-facing times ("2pm session"). Storing as TIMESTAMPTZ loses the original wall-clock time when displayed across timezones. A session at "2pm ET" should display as "2pm ET" regardless of viewer timezone.

3. **Why the timezone column:** Naive DATE+TIME is ambiguous. Without knowing the study's timezone, we cannot:
   - Convert to TIMESTAMPTZ later if needed
   - Display to remote observers with correct TZ label
   - Sync with external calendars

   The user correctly rejected "upgrade later, it's additive" reasoning: naive→tz conversion requires knowing the original TZ, which is unrecoverable if not recorded now. Default `America/New_York` matches VA headquarters timezone (primary user base).

### R3: Remove denormalized `total_participants`

Dropped `research_studies.total_participants` column. Count is now computed on read via:
- `StudyParticipantModel.count({ where: { study_id } })`
- `study.countParticipants()` (Sequelize mixin)

**Rationale:**
- Single source of truth (no drift possible)
- Simpler code (no `updateParticipantCount()` to maintain)
- COUNT on indexed FK is fast; studies have tens of participants, not millions

### A1: FK-based queries

Updated services to query by `study_id` FK instead of `study_name` string:
- `research_plan.service.ts`
- `session-summary.service.ts`
- `study-notes.service.ts`
- `readoutHandler.ts`

**Rationale:** FKs are the authoritative relationship. String matching is fragile (case sensitivity, renames, duplicates across projects).

## Consequences

### Positive

- Invalid enum values are now rejected at DB level (defense in depth)
- Date/time columns can be properly sorted and compared
- Timezone information captured for future TIMESTAMPTZ migration if needed
- Participant count always accurate (no drift)
- Services use FK relationships correctly

### Negative

- Handler code must convert string dates from forms to Date objects (normalized in service layer)

### Migration Robustness

The R2 migration handles malformed data gracefully:

- **Empty strings, NULL**: Become NULL (expected case)
- **Malformed strings** ("TBD", "N/A", invalid dates): Also become NULL, with a logged warning
- **Implementation**: Uses `pg_temp.safe_to_date()` / `safe_to_time()` PL/pgSQL functions that catch parse exceptions and return NULL
- **Audit trail**: Before conversion, the migration logs any values that don't match ISO date format (`YYYY-MM-DD`) so operators can review what data was lost

This ensures the migration won't fail on real data with messy inputs, while still providing visibility into what got cleaned up.

### Migrations

```
20260603000000-add-enum-check-constraints.js
20260603000001-convert-temporal-columns.js
20260603000002-drop-total-participants.js
```

All migrations tested on fresh database. 47 total migrations run successfully.

## Verification

- TypeScript: All type checks pass
- Unit tests: 123 tests pass
- Integration tests: 161 tests pass
- Manual verification: CHECK constraint rejects invalid values; DATE column stores proper dates

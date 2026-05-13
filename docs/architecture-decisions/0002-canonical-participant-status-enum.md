# ADR 0002: Canonical participant status enum

**Status:** Accepted
**Date:** 2026-05-13
**Decision drivers:** Architecture audit found 15 distinct status strings for 9 concepts across the codebase. Dashboard counts didn't match participant tracker because writers and readers used different casing. Phantom `'Contacted'` status was checked in fieldwork handler but never written anywhere.

## Context

`StudyParticipant.status_select` was a free-form string column. Two write modals (Add Participant, Update Status) used different casing and different slugs for the same conceptual statuses. Multiple read paths (service queries, fieldwork handler, YAML processor) each made local decisions about which strings to check for. No layer agreed with any other. As a result, participants updated via the Update Status modal disappeared from dashboard counts because the dashboard read `'Confirmed'` (title case) while the modal wrote `'confirmed'` (lowercase).

This was traced during testing when a researcher confirmed 3 of 3 participants but the dashboard kept reading "0 of 3 confirmed." The bug had been latent for as long as both modals had existed.

## Decision

Define 9 canonical participant statuses, lowercase with underscores, locked as a JavaScript constant in `backend/src/constants/participantStatus.js`:

```
not_contacted, contacted, scheduled, confirmed, needs_reschedule,
completed, declined, no_response, canceled
```

The constants file is the single source of truth. Every layer that touches status — write modals, read queries, YAML rendering, dashboard counts — imports from this file. Display formatting (e.g., `Confirmed` instead of `confirmed` in user-facing surfaces) lives as a separate `PARTICIPANT_STATUS_LABELS` export and is applied at render time.

Model-level validation (`validate: { isIn: [...] }`) refuses non-canonical values from any Sequelize write path.

## Alternatives considered

**Title case with display formatting on write paths.** Same idea, inverted casing. Rejected because lowercase aligns better with JSON keys, URL slugs, and database conventions, and is the casing the existing Add modal used (smaller migration).

**Database-level CHECK constraint.** Stronger enforcement than application-level validation — refuses bad values even via raw SQL. Rejected for alpha because no untrusted code writes to this table via raw SQL; the application-level guard is sufficient. Filed as v1.1 hardening candidate.

**Database enum type.** Postgres supports native enum types. Rejected because adding/removing values requires migrations, which is more friction than a JavaScript constant for what's still an evolving vocabulary. Worth revisiting once the vocabulary stabilizes.

**Keep the free-form strings, just be careful.** What the project had been doing. Rejected as the root cause of the bugs we just spent days fixing.

## Consequences

**Intended:** Status writes and reads agree forever. Dashboard counts reconcile to the truth table. New code that touches participant status is forced through the constants file by code review (and would fail tests if it skipped them). Status-related bugs become impossible to commit accidentally.

**Accepted downsides:** No database-level enforcement — direct SQL writes could still insert garbage. Trust the application layer for now. The 9-status enum doesn't cover screening flows (no `disqualified`); we chose to ship without screening rather than ship statuses we couldn't produce. Adding the `disqualified` status will return as part of v1.1 screener work.

**Migration impact:** One-time data migration ran successfully on 16 production rows; no rollback needed.

## References

- `backend/src/constants/participantStatus.js`
- Migration: `backend/src/database/migrations/20260513000000-normalize-participant-status.js`
- Instruction document: `cc-instruction-1-status-enum.md`

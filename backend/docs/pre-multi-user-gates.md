# Pre-Multi-User Gates

Items that must be completed before a second user can touch the same study concurrently. These are not blockers for single-user alpha testing.

## Concurrency

### Concurrency test for getNextParticipantCode

**Status:** Filed (2026-06-02)

The advisory lock (`pg_advisory_xact_lock`) is built into `getNextParticipantCode()`, but the 7 integration tests are all sequential — none prove the lock works under actual concurrency.

**Required test:** Two simultaneous `createParticipant()` calls on the same study must get different codes (PT-001 and PT-002, not PT-001 and PT-001).

**Why deferred:** Single-user alpha. No concurrent study access yet.

**Implementation notes:**
- Test needs to spawn parallel async operations within a single test
- May need to add artificial delay after advisory lock acquisition to create race window
- Consider using `Promise.all()` with two `createParticipant()` calls

### Concurrency-cliff analysis

**Status:** Not started

Identify all other places where concurrent access to the same study could cause data corruption or unexpected behavior. Audit:
- Session observer creation
- Study variable writes (pool merge operations)
- Study notes uploads
- Any other per-study sequential operations

## Infrastructure

### Staging environment

**Status:** Not started

Railway staging environment for multi-user testing before production.

---

*This document tracks gates, not a general roadmap. Items here are specifically about the solo→multi-user transition.*

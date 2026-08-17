# ADR 0036: External Side-Effect Idempotency

**Status:** Accepted
**Date:** 2026-08-17
**Decision drivers:** Platform Hardening Phase 4 (PH-4) — make externally mutating workflows safe to retry.

## Context

Qori creates GitHub issues from research findings via `/qori-tickets`. Before PH-4, the `CreatedIssue` model tracked created issues but had no database uniqueness constraint. The original unique index on `(study_name, audience, ticket_id)` was dropped during the Phase 2B FK migration and never replaced.

This meant:
- Race conditions could create duplicate GitHub issues for the same ticket
- Slack action replay could create duplicate issues
- "GitHub success + DB failure" had no recovery path — the issue existed but the mapping was lost

## Decision

### Platform Invariant

**External consequential actions require stable semantic identity.** Retrying a Qori workflow must not duplicate externally consequential actions. Rendered prose is never an idempotency key.

### Implementation

1. **Hard uniqueness constraint** on `(study_id, audience, ticket_id)` in `created_issues` table. The DB rejects race-condition duplicates.

2. **Lifecycle tracking**: `status` column (`pending` → `created` → `failed`) and `updated_at` enable recovery from partial failures.

3. **Machine-readable action marker**: Each GitHub issue body includes `<!-- qori-action-id: {public_id} -->` for recovery when GitHub succeeds but DB write fails. Recovery searches by the Qori-owned marker, not by title.

4. **Idempotent execution flow**:
   - A. Derive semantic action key `(study_id, audience, ticket_id)`
   - B. Check persisted mapping
   - C. If mapping exists with `status: created` → resolve existing issue, don't duplicate
   - D. If no mapping → reserve `pending` row, create GitHub issue, update to `created`
   - E. Unique constraint + concurrent resolution handles simultaneous retries

5. **Dead code removal**: `createGitHubIssues` in `github.ts` (never called) removed.

### Semantic Identity

The current semantic key uses `ticket_id` (e.g., "design-ticket-001") as the strongest stable upstream identity. This is transitional — the structured implementation handoff model (future PH-5+) will introduce canonical recommendation/action identity. The schema is designed to accommodate this without migration: `ticket_id` can be replaced or augmented with a canonical reference.

## Consequences

- Same semantic action run twice → one GitHub issue.
- Concurrent/replayed Slack actions → one CreatedIssue mapping.
- "GitHub success + DB failure" → next retry recovers existing issue via action marker.
- Same title with different `ticket_id` → distinct issues (allowed).
- Renamed GitHub issue → still resolves through persisted mapping.
- GitHub artifact writes (createOrUpdateFileOnGitHub) are naturally idempotent (upsert by path) and unaffected.

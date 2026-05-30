# Production Readiness Gaps

This document tracks known gaps between current state and production/federal readiness. Items here are not bugs — they're architectural gaps that need addressing before VA production deployment.

---

## GAP-001: No runtime error monitoring (ops alerting)

**Status:** Resolved
**Filed:** 2026-05-30
**Resolved:** 2026-05-30
**Workstream:** Security audit / production readiness
**Priority:** High (federal-readiness concern)

### The gap

Contract tests run at BUILD time (CI), not in production. Runtime is covered by fail-loud validation (ADR 0007 / hard-fail), but there's no MONITORING — when a researcher hits a runtime error, nothing alerts ops.

Two-part problem:
1. **Fail loud to USER** — partly done (ADR 0007, synthesis hard-fail). Continue extending.
2. **Fail loud to OPS** — missing. No error monitoring (Sentry or equivalent) on the backend. Production exceptions surface to the user who hit them, not to ops/Lapedra.

### Evidence

Both silent bugs this week were found by accident, not by an alarm:
- Discovery variable swallowing (variables written but consumes didn't read them)
- Approval flow 8-day breakage (approval actions silently failing)

### Risk

Silent failure in a VA demo is worse than a visible one. If a researcher hits an error during a stakeholder presentation, ops has no way to know until after the fact (if at all).

### Resolution

**Implemented 2026-05-30:**

1. **Sentry v8 integration** — All Slack handler errors and Express errors are now captured to Sentry
2. **PII scrubbing** — `beforeSend` hook scrubs participant IDs (PT-XXX), names, nugget content, verbatim quotes, and variable payloads before sending to Sentry
3. **Slack alerts channel** — Errors are posted to `#qori-alerts` (configured via `QORI_ALERTS_CHANNEL_ID`) for persistent, searchable error log
4. **User notification preserved** — Users still get DMs when their requests fail (no behavior change)

**What's captured:**
- Unhandled exceptions in Slack handlers
- TemplateContractError (cascade contract violations)
- Extraction failures (ADR 0019 hard-fails)
- Express HTTP errors (404, 500, etc.)

**Deferred (not needed for alpha):**
- Performance monitoring / transaction tracing
- Release tracking
- Custom breadcrumbs
- Structured logging with correlation IDs

### Configuration

Set in Railway environment:
- `SENTRY_DSN` — Sentry project DSN
- `QORI_ALERTS_CHANNEL_ID` — Slack channel ID for #qori-alerts

### PII scrubbing approach

See `backend/src/config/sentry.js` for full implementation. Summary:

**Fully redacted fields:** `participant_id`, `participant`, `name`, `text`, `quote`, `verbatim`, `nugget_text`, `content`, `transcript`, `session_notes`, `variables`, `value`

**Pattern-based scrubbing:** Participant IDs (`PT-001`, `P-12`), email addresses, phone numbers, title-prefixed names

**Safety:** If scrubbing fails, the event is dropped rather than risk PII leak.

### References

- ADR 0007: Cascade contracts fail loudly (user-facing, not ops-facing)
- ADR 0018: Cascade-aware synthesis modal (contract tests at build time)
- ADR 0019: Ack-first await-extraction handler pattern (hard-fail on extraction failure)
- L004: Cascade contract test suite (CI-time regression guard)

---

## Template for new gaps

```markdown
## GAP-XXX: [Short title]

**Status:** Open | In Progress | Resolved
**Filed:** YYYY-MM-DD
**Workstream:** [Category]
**Priority:** High | Medium | Low

### The gap

[What's missing]

### Evidence

[How was this discovered / what broke]

### Risk

[What happens if not addressed]

### Resolution path

[Steps to fix]

### References

[Related ADRs, issues, code]
```

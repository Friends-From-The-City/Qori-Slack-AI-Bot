# Observability Contract

Observability is provider-configurable. Qori operates correctly without any external observability service.

## Current Implementation

Qori uses Sentry (`@sentry/node` v8) as the default error reporting adapter. Configuration is in `backend/src/config/sentry.js`.

## Configuration

| Variable | Purpose | Required | Default behavior when missing |
|----------|---------|----------|-------------------------------|
| `SENTRY_DSN` | Error reporting endpoint | No | Errors logged to stdout only |
| `NODE_ENV` | Environment tag | No | `development` (Sentry disabled) |
| `QORI_RELEASE_ID` | Release identifier | No | Events have no release tag |

Sentry is disabled in two cases:
1. `NODE_ENV=development`
2. `SENTRY_DSN` is not set

When disabled, all errors flow through stdout logging and the application's error handler. No functionality is lost.

## Release Identifier

The Sentry `release` tag identifies which deployed version generated an event. Currently:

```javascript
const release = process.env.RAILWAY_GIT_COMMIT_SHA;
```

**Portability fix (this slice):** The application now reads `QORI_RELEASE_ID` first, falling back to `RAILWAY_GIT_COMMIT_SHA` for backward compatibility:

```javascript
const release = process.env.QORI_RELEASE_ID || process.env.RAILWAY_GIT_COMMIT_SHA;
```

Any deployment platform can set `QORI_RELEASE_ID` to a commit SHA, semantic version, or deployment identifier.

## PII/Secret Scrubbing

The Sentry `beforeSend` hook scrubs PII and secrets before any data leaves the application:

- **Field-level redaction** for known PII fields (participant IDs, names, content, tokens)
- **Pattern-based scrubbing** for Slack tokens, email addresses, phone numbers, Bearer tokens
- **Two-phase scrubbing**: collect known PII values from structured fields, then scrub those values from all strings including exception messages
- **Fail-closed**: if scrubbing fails, the event is dropped entirely (not sent)

This scrubbing applies regardless of which error reporting service receives the event. It runs within the application before data crosses any network boundary.

## Structured Logging

Application logs go to stdout/stderr. Key patterns:

- Startup: environment, database host, migration state
- Slack: Socket Mode connection, handler invocations
- AI tasks: task IDs, skip conditions (not prompt content)
- Errors: structured error messages without PII

No structured logging framework (Winston, Pino) is currently in use — logs are `console.log`/`console.error`. A deploying organization can capture stdout with any log aggregation tool.

## Error Reporting Adapter Boundary

The Sentry integration is isolated to:

- `src/config/sentry.js` — initialization and PII scrubbing
- `src/app.js` — Express error handler registration
- `src/helpers/slack/events.ts` — manual `Sentry.captureException()` calls in the Slack error handler

To substitute a different error reporting service:

1. Replace `@sentry/node` import in `sentry.js`
2. Update `initSentry()` to initialize the new service
3. Update `beforeSend` to use the new service's hook (or wrap the scrubbing)
4. Update `Sentry.captureException()` calls (3-4 locations)

The PII scrubbing logic (`scrubPII`, `collectPIIValues`, etc.) is provider-independent and can be reused with any error service.

## Behavior When Unavailable

If the observability service is unreachable:
- Application continues operating normally
- Errors are still logged to stdout
- Sentry SDK silently drops events on network failure
- No impact on user-facing functionality

# ADR L007: Backup pg_dump version mismatch + credential leakage in logs

**Status:** Accepted
**Date:** 2026-08-20
**Decision drivers:** Production backup failure, credential exposure in structured logs

## Incident

On 2026-08-20 at 07:02 UTC, the scheduled production backup job (`qori-postgres-backup`) failed with a `pg_dump` version mismatch error.

**Root cause:** The Dockerfile installed the generic `postgresql-client` package from Debian Bookworm, which ships pg_dump 15.19. The production PostgreSQL server is version 18.6. pg_dump refuses to dump a server newer than itself.

**Secondary finding:** The backup failure error was logged via `logError()`, which wrote `error.message` verbatim to structured JSON logs. Node.js `execFileSync` embeds the full command (including `--dbname postgresql://user:PASSWORD@host/db`) in thrown error messages. The production database password was exposed in Railway log output.

## Impact

- **Backup:** No backup produced. Railway Point-in-Time Recovery (PITR) was unaffected — it operates at the infrastructure level independent of this job.
- **Credential exposure:** The production database password appeared in Railway structured logs. The credential was rotated by the operator. No evidence of unauthorized access or database corruption.
- **Duration:** Backup job has been non-functional since the production Postgres was upgraded to 18.x. The exact date of the PG18 upgrade is the true start of the outage window.

## Remediation

### 1. PostgreSQL client upgrade (Dockerfile)
Replaced `postgresql-client` (PG15 from Debian Bookworm) with `postgresql-client-18` from the PostgreSQL Global Development Group (PGDG) apt repository.

### 2. Credential-safe process invocation (backup.js)
- `parseDatabaseUrl()`: Decomposes a PostgreSQL connection URI into individual libpq env vars (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`). The full URI never appears in `execFileSync` argv, so Node error messages cannot echo it.
- `sanitize()`: Belt-and-suspenders function that redacts connection strings, passwords, tokens, and AWS keys from any string before logging.
- `logError()`: Now sanitizes `error.message` before writing to structured logs.

### 3. Version preflight check
`checkVersionCompatibility()` queries client and server major versions before dump. Blocks execution with a sanitized error when client major < server major.

### 4. Regression tests
51 tests total (up from 27):
- 7 secret-leak regression tests proving credentials never appear in log output
- 5 version compatibility tests (18/18 permitted, 18/15 blocked, etc.)
- 4 parseDatabaseUrl tests
- 6 sanitize unit tests

## Lessons

1. **Pin client tools to the same major as the server.** Generic `postgresql-client` tracks the distro, not the database. When production upgrades, the backup container silently becomes incompatible.
2. **Never pass credentials as command arguments.** Node's `execFileSync` constructs error messages from the argv array. Use env vars or config files for secrets.
3. **Sanitize at the log boundary.** Even with env-var-based connection, stderr from child processes can contain credentials in unexpected formats. Sanitize before logging.
4. **The backup service existed only in production.** No DEV backup service means no pre-production verification path. Consider adding a DEV backup service for future validation.

## Verification

- Container `pg_dump --version`: `pg_dump (PostgreSQL) 18.6 (Debian 18.6-1.pgdg12+2)`
- Container `pg_restore --version`: `pg_restore (PostgreSQL) 18.6 (Debian 18.6-1.pgdg12+2)`
- DEV database dump lifecycle: version_check_passed (client 18, server 18) → dump_completed → dump_verified (3,814,597 bytes) → cleanup_done
- Secret-leak runtime test: no credentials in success logs, failure logs, or sanitized errors

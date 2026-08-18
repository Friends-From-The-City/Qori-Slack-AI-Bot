# ADR 0039: Disaster Recovery Posture

**Status:** Accepted
**Date:** 2026-08-18
**Context:** GOV-5 Disaster Recovery / Backup + Restore Verification

## Context

Qori's PostgreSQL database is the authoritative store for all canonical state: projects, studies, evidence graph (sources → constructs → relationships), participants, variables, artifacts, and survey data. GitHub holds document bodies (Markdown) and YAML config; Redis holds only transient staging (pending CSV uploads with 2h TTL, disabled RAG queues). Slack is non-authoritative.

Prior to GOV-5, no disaster recovery posture existed:
- No restore had ever been tested
- RPO/RTO were unknown
- PITR status was uninspected
- Volume backup schedules were unverified
- No portable logical backup mechanism existed
- No runbook documented recovery procedures

## Decision

1. **Logical backup via pg_dump is the primary portable recovery mechanism.** Railway volume backups are convenient but scoped to the same project/environment — they do not survive volume or project deletion. A pg_dump in `--format=custom --no-owner` is the only backup that is portable across infrastructure.

2. **PITR is enabled on PROD.** Verified 2026-08-18: WAL archiving operational, pgBackRest archive-push successful, gap_state=clear, failed=0. Railway PITR restore timeline is active. DEV does not have PITR (acceptable — volume backups and logical dumps cover development).

3. **Restore validation is mandatory before cutover.** A database starting successfully is not sufficient. The `validate-restore.js` script checks: migration count, core table presence, FK/unique constraints, evidence graph edges, and row counts. This script must pass before any connection-string cutover.

4. **Recovery creates a sibling, never overwrites.** Both Railway volume restore and PITR create a new Postgres service. The original database is preserved for investigation. This is Railway's native recovery model and we adopt it.

5. **Runbook at `docs/operations/disaster-recovery.md`.** Covers five incident classes (bad deploy, service failure, volume loss, project loss, credential loss), step-by-step procedures, validation checklist, cutover design, and rollback strategy.

## Measured Evidence (GOV-5 Drill, 2026-08-18)

- **pg_dump:** 18 seconds for 210 MB database (DEV), producing 3.6 MB custom-format dump
- **pg_restore:** 7 seconds to local temp database, zero errors
- **Validation:** All checks pass — 71 migrations, 32 tables, 69 FK constraints, 79 evidence graph edges, row counts match source exactly
- **Measured logical restore drill execution time:** ~25 seconds (dump + restore + validation) for the tested DEV dataset. This excludes incident assessment, target provisioning, production cutover, application redeployment, smoke testing, and human decision time. A production RTO has not yet been established through a full recovery exercise

## Verified State (2026-08-18)

- PROD PITR: **Enabled and operational** — WAL archiving verified, pgBackRest archive-push successful, gap_state=clear
- DEV volume backups: **Enabled** (verified in Railway dashboard)
- PROD volume backups: **Enabled** (verified in Railway dashboard)

## GOV-5B: Offsite Logical Backup (2026-08-18)

Automated daily pg_dump to external S3-compatible storage, implemented in `operations/postgres-backup/`.

- **Schedule:** `0 7 * * *` (07:00 UTC daily, Railway Cron Service)
- **Format:** `pg_dump --format=custom --no-owner --no-privileges`
- **Storage:** Supabase Storage (S3-compatible, outside Railway), private bucket, TLS in transit
- **Retention:** Target 30 days; automated retention deferred (Supabase S3 does not expose lifecycle config)
- **Verification:** Each backup is verified with `pg_restore --list` before upload
- **Metadata:** JSON sidecar with timestamp, environment, dump size, engine version, git SHA
- **Access:** Least-privilege Supabase S3 credential scoped to backup bucket (PutObject, GetObject only)
- **Limitations:** Supabase S3 does not support object versioning or bucket lifecycle expiration; each backup uses a unique timestamped key; the backup job never deletes objects

This is the only recovery layer that survives Railway project/volume deletion.

## Remaining Gaps

1. PROD logical dump not yet tested (drill was DEV-only)
2. No automated backup monitoring/alerting
3. Offsite backup cron service deployment pending Railway cron service provisioning
4. Automated retention not yet implemented (Supabase S3 limitation — manual cleanup for now)

## Consequences

- DR runbook and validation script are now part of the codebase
- Future deployments can use `validate-restore.js` for post-migration schema confidence
- Three recovery layers now exist for PROD: volume backups, PITR, and offsite logical dumps
- Offsite backup code is tested (24 unit tests) and ready for deployment once Railway cron service is provisioned

# Qori Disaster Recovery Runbook

**Last verified:** 2026-08-18 (GOV-5A restore drill + GOV-5B offsite backup implementation)
**Scope:** PostgreSQL canonical state, Redis transient state, GitHub projections

---

## 1. Data Authority Map

| Store | Authority | Loss impact |
|-------|-----------|-------------|
| **Postgres** | Authoritative durable state | Projects, studies, evidence graph, variables, participants, artifacts (pointers), survey data — all canonical state |
| **GitHub** | Durable projection/output + config | Document bodies (Markdown), YAML prompt templates, study scaffolds, participant trackers. Pointers in Postgres, content in GitHub |
| **Slack** | Interaction surface | Non-authoritative. Do not reconstruct Postgres from Slack |
| **Redis** | Transient staging + disabled queues | Pending CSV uploads (2h TTL), disabled RAG job queues. Loss = re-upload in-progress CSVs only |

**Critical:** A restored Postgres DB must NOT be reconstructed from GitHub or Slack. Postgres is the single source of truth for all structured state.

---

## 2. Incident Classification

| Class | Scenario | Recovery source |
|-------|----------|----------------|
| **A** | Bad deployment / bad migration / data corruption | Railway volume backup → restore as sibling, or PITR if enabled, or pg_dump logical backup |
| **B** | Postgres service failure | Railway volume backup → restore, or PITR → sibling service |
| **C** | Volume deletion | Offsite logical dump from S3 (§5.5). **Railway volume backups may be lost with the volume.** |
| **D** | Railway project/environment loss | Offsite logical dump from S3 (§5.5). Volume backups are project-scoped and lost with the project |
| **E** | Credential/config loss | Railway Variables tab (if accessible), or redeploy from env documentation |

**Key limitation:** Railway volume backups are scoped to the same project/environment. If the volume or project is deleted, volume backups may also be lost. A portable logical dump (pg_dump) is the only backup that survives project/volume deletion.

---

## 3. RPO / RTO Targets

### Current Measured Values (GOV-5 drill, 2026-08-18)

| Metric | DEV measured | PROD target |
|--------|-------------|-------------|
| **RPO (logical dump)** | Time since last pg_dump | Depends on dump schedule — see §10 |
| **RPO (volume backup)** | Per Railway schedule if enabled | Daily = 24h worst case |
| **RPO (PITR)** | Not available (archive_mode=off) | Minutes-level (PITR enabled, WAL archiving verified operational) |
| **Logical restore drill time** | **25 seconds** (18s dump + 7s restore for 210 MB / 32 tables / 232k rows) | Not yet measured for PROD dataset |

**Important:** Measured logical restore drill execution time: ~25 seconds for the tested DEV dataset. This excludes incident assessment, target provisioning, production cutover, application redeployment, smoke testing, and human decision time. A production RTO has not yet been established through a full recovery exercise.

---

## 4. Immediate Response

When a data incident is suspected:

### 4.1 Pause application writes

```
# Option A: Scale Railway service to 0 replicas (dashboard)
Railway → Project → Environment → qori-slack service → Settings → Scale to 0

# Option B: Set maintenance mode env var (if supported)
# Currently no maintenance mode — use Option A
```

### 4.2 Preserve the damaged database

**Do NOT modify, drop, or restore over the damaged database.** It may be needed for investigation.

- If the Postgres service is still running, leave it in place
- Note the current time (for PITR window reference)
- Record the last known good deployment SHA

### 4.3 Assess incident class

Determine A/B/C/D/E from the table above. This determines the recovery path.

---

## 5. Recovery Procedures

### 5.1 Volume Backup Restore (Class A, B)

Railway volume backups restore as a **sibling Postgres service** — the source is untouched.

1. Railway Dashboard → Project → Environment → Postgres service
2. Navigate to **Backups** tab
3. Select the backup closest to (but before) the incident
4. Click **Restore** — this creates a new Postgres service with the restored volume
5. Note the new service's connection details (internal hostname, port)
6. **Do NOT delete the original Postgres service yet**

### 5.2 PITR Restore (Class A, B — if enabled)

Railway PITR restores to a **new sibling Postgres service**, leaving the source untouched.

1. Railway Dashboard → Project → Environment → Postgres service
2. Navigate to **Backups** → **Point-in-Time Recovery**
3. Select the target timestamp (must be within the available restore window)
4. Click **Restore** — creates a new Postgres service
5. Note the new service's connection details
6. **Do NOT delete the original Postgres service yet**

### 5.3 Logical Restore from pg_dump (Class A, B, C, D)

This is the only recovery path that survives volume/project deletion.

**Prerequisites:** A pg_dump file in `--format=custom` must exist from a prior backup.

```bash
# 1. Create a new Postgres service in Railway (or use any Postgres instance)
# 2. Get the connection details for the target

# 3. Restore
pg_restore --no-owner --no-privileges \
  -h <TARGET_HOST> -p <TARGET_PORT> -U <TARGET_USER> -d <TARGET_DB> \
  <BACKUP_FILE>.dump

# 4. Verify (see §6)
```

### 5.4 Manual pg_dump (for ad-hoc backup)

```bash
# Use Railway public URL (not internal — that's only reachable from within Railway)
pg_dump \
  -h <RAILWAY_PUBLIC_HOST> -p <RAILWAY_PUBLIC_PORT> \
  -U postgres -d railway \
  --format=custom --no-owner \
  -f qori-backup-$(date +%Y%m%d-%H%M%S).dump

# Verify the dump
pg_restore --list <BACKUP_FILE>.dump | wc -l  # Should be > 0
ls -lh <BACKUP_FILE>.dump  # Should be non-zero size
```

**Security:**
- Do NOT commit dump files to Git
- Do NOT upload to Slack
- Do NOT store in the application repo
- Delete local copies after offsite transfer
- Do NOT expose credentials in shell history (use PGPASSWORD env var or .pgpass)

### 5.5 Automated Offsite Backup (GOV-5B)

A dedicated backup job runs daily as a Railway Cron Service:

- **Code:** `operations/postgres-backup/backup.js`
- **Schedule:** `0 7 * * *` (07:00 UTC daily)
- **Storage:** External S3-compatible bucket (outside Railway)
- **Format:** `pg_dump --format=custom --no-owner --no-privileges`

**Object layout:**
```
qori/postgres/YYYY/MM/DD/qori-prod-YYYYMMDDTHHMMSSZ.dump
qori/postgres/YYYY/MM/DD/qori-prod-YYYYMMDDTHHMMSSZ.meta.json
```

**Restore from offsite backup:**
1. Download the `.dump` file from S3
2. Provision a target Postgres instance
3. `pg_restore --no-owner --no-privileges -h <HOST> -p <PORT> -U <USER> -d <DB> <FILE>.dump`
4. Run `validate-restore.js` against the restored instance
5. If validated, proceed with cutover (§7)

**Retention:** 30-day lifecycle policy on the S3 bucket.

**This is the only backup that survives Railway project/environment deletion.**

---

## 6. Restore Validation

A database starting successfully is NOT sufficient. Run these checks against the restored copy.

### 6.1 Schema migration state

```sql
SELECT COUNT(*) as migration_count FROM "SequelizeMeta";
-- Must match the expected migration count for the deployed code version
```

### 6.2 Table inventory

```sql
SELECT COUNT(*) as table_count FROM pg_tables WHERE schemaname = 'public';
-- DEV (as of GOV-5): 32 tables
-- PROD (as of GOV-5): 20 tables (13 migrations behind dev)
```

### 6.3 Row counts (canonical tables)

```sql
SELECT 'projects' as tbl, COUNT(*) as cnt FROM projects
UNION ALL SELECT 'research_studies', COUNT(*) FROM research_studies
UNION ALL SELECT 'evidence_sources', COUNT(*) FROM evidence_sources
UNION ALL SELECT 'evidence_constructs', COUNT(*) FROM evidence_constructs
UNION ALL SELECT 'evidence_relationships', COUNT(*) FROM evidence_relationships
UNION ALL SELECT 'research_artifacts', COUNT(*) FROM research_artifacts
UNION ALL SELECT 'artifact_evidence_refs', COUNT(*) FROM artifact_evidence_refs
UNION ALL SELECT 'data_subjects', COUNT(*) FROM data_subjects
UNION ALL SELECT 'data_subject_links', COUNT(*) FROM data_subject_links
UNION ALL SELECT 'evidence_subject_attributions', COUNT(*) FROM evidence_subject_attributions
UNION ALL SELECT 'study_participants', COUNT(*) FROM study_participants
UNION ALL SELECT 'study_variables', COUNT(*) FROM study_variables
ORDER BY tbl;
```

Compare against last known good counts. All counts should be ≥ pre-incident values (unless incident involved erroneous inserts).

### 6.4 Constraint integrity

```sql
-- FK constraints
SELECT COUNT(*) as fk_count
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';

-- Unique constraints
SELECT COUNT(*) as unique_count
FROM information_schema.table_constraints
WHERE constraint_type = 'UNIQUE' AND table_schema = 'public';
```

### 6.5 Evidence graph chain

```sql
-- Verify source → construct edges exist
SELECT
  'source→construct' as edge, COUNT(*) as cnt
FROM evidence_relationships
WHERE from_source_id IS NOT NULL AND to_construct_id IS NOT NULL;

-- Verify construct type distribution
SELECT construct_type, COUNT(*)
FROM evidence_constructs
GROUP BY construct_type
ORDER BY count DESC;
```

### 6.6 Automated validation script

Run the integration test suite against the restored database:

```bash
cd backend
DATABASE_URL="postgresql://<user>:<pass>@<host>:<port>/<db>" npm run test:integration
```

Or use the startup schema validator:

```bash
node scripts/validate-schema.js
```

---

## 7. Connection-String Cutover

**Do NOT execute this without completing §6 validation.**

1. Confirm all validation checks pass on the restored sibling DB
2. Railway Dashboard → Project → Environment → qori-slack service → Variables
3. Update `DB_HOST` to point to the restored Postgres service's internal hostname
4. If the restored service has a different port, update `DB_PORT`
5. If credentials differ, update `DB_USER` and `DB_PASSWORD`
6. Trigger a redeploy of qori-slack (Railway auto-redeploys on variable change)
7. Monitor startup logs — `start.sh` will:
   - Wait for DB connection
   - Run pending migrations
   - Verify migration count
   - Validate schema
   - Start the app
8. **Do NOT run migrations blindly against an unvalidated restore**

---

## 8. Post-Cutover Verification

1. Verify `start.sh` completed without errors in Railway deploy logs
2. Check Sentry for any new errors (especially `SequelizeDatabaseError`)
3. Run a smoke test: trigger a `/qori-plan` or `/qori-brief` command in Slack
4. Verify study list loads correctly
5. Check that the `qori-alerts` channel receives no unexpected errors
6. Monitor for 15 minutes before declaring recovery complete

---

## 9. Rollback Strategy

If the restored DB fails validation or the application behaves incorrectly after cutover:

1. Revert `DB_HOST` (and any other changed vars) to the original Postgres service
2. Railway auto-redeploys on variable change
3. If the original DB was also corrupted, attempt a different restore point (older backup, different PITR timestamp)
4. Retain both the original and restored databases until the incident is fully resolved

---

## 10. Redis Recovery

**Redis is non-authoritative.** Qori's Redis stores only:

1. **Pending CSV uploads** (`survey:pending:*` keys, 2h TTL) — transient staging buffer. Loss = researcher re-uploads CSV. No data loss.
2. **Disabled RAG job queues** (Bull queues, `removeOnComplete: true`) — no-op workers. Loss = zero impact.

**If Redis is lost:** The application will throw connection errors from Bull queue initialization on startup, but all authoritative state remains in Postgres. Researchers with in-progress CSV reviews will see "Survey data has expired" and must re-upload.

**Invariant:** If this audit's finding changes — if authoritative state migrates to Redis — **stop and report it as a DR gap before proceeding.**

---

## 11. Observability During Recovery

- **Sentry:** Monitor for application/runtime errors during and after recovery. Release SHA is recorded per GOV-4.
- **qori-alerts channel:** Production operational errors route here. Monitor during recovery.
- **Do NOT** send DB credentials, connection strings, or restored data content into Sentry or Slack telemetry.
- Record the deployment/release SHA that is running against the restored database.

---

## 12. Communication / Escalation

| Step | Action |
|------|--------|
| Incident detected | Notify team in appropriate channel |
| Writes paused | Confirm in channel |
| Recovery path chosen | Document which class (A–E) and which restore method |
| Validation complete | Share validation results (counts, constraint checks) |
| Cutover executed | Confirm new DB is live |
| Smoke test passed | Declare recovery complete |
| Post-mortem | Schedule within 48h |

---

## 13. Railway Dashboard Navigation

### Check backup schedules
```
Railway Dashboard
→ Project (caring-beauty)
→ Environment (production / dev)
→ Postgres service
→ Backups tab
→ Verify: Daily / Weekly / Monthly schedules
→ Note most recent successful backup timestamp
```

### Check PITR status
```
Railway Dashboard
→ Postgres service
→ Backups tab
→ Point-in-Time Recovery section
→ Verify: Enabled/Disabled
→ If enabled: note available restore window
→ If enabled: verify archive health indicators
```

### PITR Status (verified 2026-08-18)

**PROD PITR is enabled and operational.**

- WAL archive credentials regenerated during setup
- WAL archiving verified operational from Postgres logs
- pgBackRest archive-push completed successfully
- PITR anchor emitted
- gap_state=clear, failed=0
- Railway PITR restore timeline is active and selectable

**DEV PITR is not enabled.** Acceptable for development — logical dumps and volume backups provide sufficient coverage.

**Do NOT perform a production PITR restore without incident justification.**

---

## Appendix A: GOV-5 Drill Results (2026-08-18)

### Environment Audit

| | DEV | PROD |
|---|---|---|
| Postgres version | 18.4 | 18.4 |
| DB size | 210 MB | 10 MB |
| Tables | 32 | 20 |
| Migrations applied | 71 | 58 |
| FK constraints | 69 | 29 |
| Unique constraints | 73 | 55 |
| `wal_level` | replica | replica |
| `archive_mode` | off | on (verified 2026-08-18) |
| PITR (Postgres-level) | Not configured | **Enabled and verified** — WAL archiving operational, pgBackRest archive-push successful, gap_state=clear, failed=0 |
| Volume backup schedule | Enabled (verified in dashboard) | Enabled (verified in dashboard) |
| Logical dump tested | Yes (this drill) | Not tested (no destructive prod ops) |

### Restore Drill (DEV)

| Step | Duration | Result |
|------|----------|--------|
| pg_dump (custom format, 210 MB DB) | 18 seconds | 3.6 MB dump file |
| pg_restore (to local temp DB) | 7 seconds | No errors |
| Validation: migration count | — | PASS (71) |
| Validation: table count | — | PASS (32) |
| Validation: FK constraints | — | PASS (69) |
| Validation: evidence graph edges | — | PASS (79 source→construct) |
| Validation: row counts match source | — | PASS (all counts identical) |
| Cleanup: temp DB dropped + dump deleted | — | Complete |

**Measured logical restore drill execution time:** ~25 seconds for the tested DEV dataset (210 MB). This excludes incident assessment, target provisioning, production cutover, application redeployment, smoke testing, and human decision time. A production RTO has not yet been established through a full recovery exercise.

### Prod Migration Gap

PROD has 58 migrations vs DEV's 71. This is expected — GOV features are on the dev branch and haven't been merged to main yet. PROD has 20 tables vs DEV's 32 (12 new tables from GOV/survey work).

---

## Appendix B: Remaining DR Gaps

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 1 | ~~PITR not enabled~~ | ~~High~~ | **RESOLVED** — PROD PITR enabled 2026-08-18, WAL archiving verified, gap_state=clear |
| 2 | ~~Volume backup schedules not verified~~ | ~~High~~ | **RESOLVED** — Both DEV and PROD scheduled volume backups verified enabled |
| 3 | ~~No offsite logical backup~~ | ~~High~~ | **RESOLVED (GOV-5B)** — Automated daily pg_dump to external S3, 30-day retention. Code at `operations/postgres-backup/` |
| 4 | **PROD restore not tested** | Medium | Drill was performed on DEV only. PROD logical dump should be tested (to a non-prod target) |
| 5 | **No automated backup monitoring** | Medium | No alerting if scheduled backups fail or PITR archive falls behind |
| 6 | **Document bodies exist only in GitHub** | Info | By design. Not a Postgres DR gap, but total GitHub loss would lose all generated Markdown content. GitHub's own DR applies |

### Recommended Follow-ups

1. **PROD logical dump drill:** Run pg_dump against PROD (to a local/temp target), validate, delete. Do not modify PROD data.
2. **Backup monitoring:** Alert on Railway volume backup, PITR archive, or offsite backup failures.
3. **Offsite backup deployment:** Deploy the `operations/postgres-backup/` cron service to Railway with S3 credentials configured.

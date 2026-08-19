# Integrated Dev Release Test Plan

Last updated: 2026-08-19

---

## Purpose

One systematic manual/system test gate for current dev before promotion to main. Each test specifies preconditions, operator action, expected state, and pass/fail criteria.

**Environment:** Railway dev + Qori-dev Slack app in QD workspace (`qoridev.slack.com`)

---

## 1. AUTHORIZATION

### AUTH-1: Project-scoped access

**Preconditions:** Two users in QD workspace. User A owns project P1. User B is NOT a member of P1.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | User B runs `/qori-start` and selects project P1 | `assertProjectAccess` denies. User B receives access-denied ephemeral message. | No study created for User B |
| 2 | User A adds User B to P1 via admin center | `project_members` row created for User B | User B now passes access check |
| 3 | User B runs `/qori-start` and selects project P1 | Study creation succeeds | Study visible to User B |

### AUTH-2: Study-scoped operations

**Preconditions:** User A owns study S1 in project P1. User B is a project member but did NOT create S1.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | User B runs `/qori-plan` for study S1 | Access check passes (project membership sufficient for read/write) | Plan generation succeeds |
| 2 | User B attempts to delete study S1 via admin center | Owner-only check denies. Ephemeral denial message. | Study NOT deleted |

### AUTH-3: Disabled legacy commands

**Preconditions:** Dev app registered with current event handlers.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/civicmind ask-study` | Returns "not available yet" message | No error, no crash |
| 2 | Run `/civicmind ask` | Returns "not available yet" message | No error, no crash |
| 3 | Run `/civicmind create-template-study` | Returns "not available yet" message | No error, no crash |

### AUTH-4: Cross-project access denial

**Preconditions:** Two projects P1, P2. User A is member of P1 only.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | User A attempts to access a study in P2 | `assertProjectAccess` denies | Access-denied message, no data returned |

---

## 2. CORE RESEARCH

### CR-1: Project and study creation (`/qori-start`)

**Preconditions:** User authenticated in QD workspace. GitHub config repo accessible.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/qori-start` | Modal opens with project selection + study name fields | Modal renders correctly |
| 2 | Create new project "Test Release" | `research_projects` row created. GitHub repo folder created. `project_members` row for creator. | Project exists in DB + GitHub |
| 3 | Create study "Test Study" in "Test Release" | `research_studies` row created. GitHub study folder scaffolded from `config/templates/`. `study_variables` initialized. | Study exists in DB + GitHub |
| 4 | Verify scaffold | GitHub study folder has README.md and expected subdirectories | Scaffold matches `config/templates/` |

### CR-2: Study variables cascade

**Preconditions:** Study S1 exists.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/qori-brief` for S1, fill modal, submit | Brief generated. Variables emitted to `study_variables` table (Postgres). GitHub `study-variables.json` updated (best-effort). | Variables in DB, artifact in GitHub |
| 2 | Run `/qori-plan` for S1 | Plan modal pre-fills with cascade variables from brief. Plan consumes brief variables. | Upstream context visible in plan output |
| 3 | Verify `study_variables` table | Variables from brief + plan present, keyed by study_id + variable_name | DB is authoritative |

### CR-3: Research planning flow

**Preconditions:** Study S1 with completed brief.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/qori-plan` for S1 | Modal opens with pre-filled fields from cascade | Modal renders, cascade fields populated |
| 2 | Submit plan | Plan artifact generated via LLM. Emitted variables stored. GitHub artifact written. | Artifact in GitHub, variables in DB |
| 3 | Run `/qori-guide` for S1 | Discussion guide consumes plan variables | Guide artifact references plan context |

### CR-4: Source ingestion (transcript + privacy)

**Preconditions:** Study S1 with completed plan.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/qori-session` for S1, upload transcript | Modal opens, transcript upload field available | Modal renders |
| 2 | Submit with transcript text | Session summary generated. PII scrubbing applied (ADR 0026). Participant codes assigned (ADR 0020). Atomic nuggets emitted. | Transcript processed, PII scrubbed, nuggets in variables |
| 3 | Verify PII scrubbing | Output does not contain participant real names (replaced with PT-XXX codes) | No PII in artifact |
| 4 | Verify nugget extraction | `study_variables` contains `atomic_nugget_core` and `atomic_nugget_detail` entries | Nuggets extractable |

### CR-5: Survey privacy + deterministic analysis

**Preconditions:** Study S1 exists. CSV survey data available.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/qori-survey` for S1 | Modal opens with survey upload | Modal renders |
| 2 | Submit survey CSV | Deterministic analysis runs (no LLM). Frequencies computed. Evidence rows created. | Survey artifact in GitHub, evidence in DB |
| 3 | Verify determinism | Re-submit same CSV | Identical output (no LLM variance) |

### CR-6: Evidence derivation + finding lineage

**Preconditions:** Study S1 with at least 2 session summaries processed.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/qori-synthesis` → affinity mapping | Affinity analysis consumes session nuggets. Themes emitted. | Themes derived from nuggets, not fabricated |
| 2 | Run `/qori-synthesis` → research readout | Readout consumes affinity themes + session data. Findings reference source nuggets. | Finding lineage traceable to sessions |
| 3 | Verify cascade summary | Readout artifact contains cascade summary section listing upstream sources | Cascade summary present |

### CR-7: Artifact generation + GitHub delivery

**Preconditions:** Any completed template run from above.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Verify GitHub artifact | Artifact markdown file exists at expected path in study folder | File present |
| 2 | Verify artifact content | Contains masthead, methodology section, AI-generated body, cascade summary | Structure matches template |
| 3 | Verify Slack delivery | User received DM with artifact link and summary | DM sent |

### CR-8: GitHub issue idempotency

**Preconditions:** Study S1 with completed readout.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Run `/qori-issues` for S1 | GitHub issues created from readout findings | Issues created |
| 2 | Run `/qori-issues` again for S1 | No duplicate issues created (idempotency check) | Issue count unchanged |

---

## 3. GOVERNANCE

### GOV-T1: DSAR export

**Preconditions:** Study S1 with participant data (at least one session with participant codes).

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Initiate DSAR export for a participant | Export package generated containing all data associated with participant code | Export complete, contains expected data |
| 2 | Verify export contents | Package includes session references, variable entries, any survey responses | All participant data present |

### GOV-T2: DSAR delete/redaction

**Preconditions:** Study S1 with participant data. DSAR export completed first (for comparison).

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Initiate DSAR deletion for participant | Participant data redacted/deleted from DB. Downstream artifacts marked stale. | Participant data removed |
| 2 | Verify deletion | Query `study_variables` for participant code returns no data | Data absent |
| 3 | Verify downstream staleness | Artifacts that referenced deleted participant are flagged or marked | Staleness indicated |

### GOV-T3: Artifact reconciliation

**Preconditions:** Study with artifacts in GitHub.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Verify artifact metadata | Artifacts have creation timestamps, version info | Metadata present |

### GOV-T4: Archive and retrieval

**Preconditions:** Study S1 completed (all workflows run).

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Archive study S1 via admin center | Study status set to archived. Retention schedule assigned. | Study archived |
| 2 | Verify archived study is read-only | Attempt to run `/qori-plan` for archived study | Operation blocked or warning shown |
| 3 | Retrieve archived study | Restore study from archive | Study accessible again |

### GOV-T5: Records hold

**Preconditions:** Study S1 exists.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Place legal hold on study S1 | Hold record created. Study protected from deletion/disposition. | Hold active |
| 2 | Attempt to delete study while hold active | Deletion blocked. Hold takes precedence. | Study NOT deleted |
| 3 | Release hold | Hold record removed. Study eligible for normal lifecycle. | Hold released |

### GOV-T6: Disposition eligibility

**Preconditions:** Study S1 with retention schedule that has elapsed.

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Check disposition eligibility | Study eligible for disposition (retention elapsed, no hold) | Eligible |
| 2 | Execute disposition | Content suppressed/destroyed per disposition action. Audit log entry created. | Disposition complete |
| 3 | Verify permanent-record protection | Permanent records are NOT eligible for destruction disposition | Protected |

---

## 4. OPERATIONS

### OPS-1: DB migration state

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Check migration count on Railway dev | `SELECT count(*) FROM "SequelizeMeta"` matches number of migration files | Counts match |
| 2 | Run `npx sequelize-cli db:migrate:status` | All migrations show as "up" | No pending migrations |

### OPS-2: Observability

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Trigger a known error in dev | Sentry event appears in dev project | Sentry active |
| 2 | Verify `#qori-alerts` | Error notification posted to alerts channel | Alerts working |
| 3 | Verify PII scrubbing | Sentry event does not contain participant names or raw transcript | PII scrubbed |

### OPS-3: Backup service

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Check backup cron status | Cron is configured and has run recently | Backup scheduled |
| 2 | Verify backup artifact | Backup file exists in Supabase bucket with recent timestamp | Backup present |
| 3 | Document PITR status | Record whether Railway Postgres has point-in-time recovery enabled | Status documented |

### OPS-4: No production mutation

| Step | Operator Action | Expected State | Pass/Fail |
|------|-----------------|----------------|-----------|
| 1 | Verify test environment | All operations above used dev workspace + dev DB | No prod data touched |
| 2 | Verify Slack app isolation | Dev commands used Qori-dev app (A0BM9PN95LM), not prod Qori app (A08U0FLM4AG) | Correct app used |

---

## Test Execution Record

| Section | Tester | Date | Result | Notes |
|---------|--------|------|--------|-------|
| Authorization | | | | |
| Core Research | | | | |
| Governance | | | | |
| Operations | | | | |

**Overall result:** PASS / FAIL / BLOCKED

**Sign-off:** _______________  Date: _______________

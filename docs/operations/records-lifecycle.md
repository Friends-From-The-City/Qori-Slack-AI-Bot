# Records Lifecycle Operations Guide

> GOV-6 — Records Lifecycle / Archival / Retention / Legal Hold / Disposition

## Overview

Qori enforces assigned records authority but does not invent records schedules. This guide covers how canonical research records are classified, retained, archived, retrieved, held, and disposed of within the system.

## Lifecycle States

| Status | Meaning |
|---|---|
| `active` | Record is in use and part of ongoing research operations |
| `inactive` | Record is no longer actively used but not yet archived |
| `archived` | Record is archived — preserved, searchable, retrievable, but not mutable |
| `disposition_eligible` | Retention period expired, eligible for disposition (pending gate check) |
| `on_hold` | Record is under a preservation hold — disposition blocked |
| `transferred` | Record has been transferred to permanent preservation authority |
| `disposed` | Record has been lawfully disposed (tombstoned, not deleted from DB) |

## Schedule Assignment

### What is a Records Schedule?

A records schedule defines the retention authority for a category of records. It specifies:

- **Authority type**: `grs` (NARA General Records Schedule), `agency_schedule`, or `other_authority`
- **Authority code**: The specific citation (e.g., `GRS 6.1-010`)
- **Record value**: `temporary` (may be destroyed) or `permanent` (must be transferred/preserved)
- **Retention trigger**: Event that starts the retention clock (e.g., `project_closed`)
- **Retention period**: Duration in days (NULL if review-based)
- **Disposition action**: `destroy`, `transfer`, or `review`

### Assigning a Schedule

Records are assigned schedules via the `RecordsAssignmentService`. Each canonical record (project, study, evidence source, construct, artifact) can have exactly one assignment, identified by `(record_type, record_public_id)`.

Qori does NOT preload federal retention schedules. Schedules are created by records officers or administrators when the organization's retention authority is known.

### Cutoff / Retention Trigger

The retention clock starts when a trigger event occurs. Supported trigger categories:

- `project_closed` — project marked complete/archived
- `study_closed` — study completed
- `source_superseded` — evidence source replaced
- `artifact_finalized` — artifact finalized for delivery
- `fixed_date` — specific calendar date
- `manual_records_officer_cutoff` — records officer sets date

**When both retention_start_at AND schedule.retention_period_days are known**, the system computes `eligible_disposition_at` automatically.

**When either is missing**, no automatic eligibility is computed.

## Archival

### What Archival Does

- Sets `project.status = 'archived'`
- Transitions active/inactive record assignments to `lifecycle_status = 'archived'`
- Preserves ALL canonical data, evidence lineage, subject governance

### What Archival Does NOT Do

- Does NOT delete anything
- Does NOT trigger disposition
- Does NOT remove records from search/retrieval
- Does NOT affect preservation holds

### Reactivation

Archived projects can be reactivated, which:
- Restores `project.status = 'active'`
- Transitions archived assignments back to `active`

## Retrieval

Archived records are retrievable via the `RecordsRetrievalService`. The retrieval path:

```
project → studies → evidence sources → constructs → relationships
→ artifacts → records-management metadata → active holds
```

All entities are returned with stable public IDs. The system does NOT reconstruct from Slack or GitHub.

## Holds

### Creating a Hold

Holds are created by owner/admin users. Types:

| Type | Use Case |
|---|---|
| `legal` | Litigation or legal proceedings |
| `litigation` | Active litigation hold |
| `audit` | Internal or external audit |
| `investigation` | Ongoing investigation |
| `records_freeze` | General records preservation order |

### Hold Scope

- **Project-level hold**: Created without targets. Blocks ALL records within the project.
- **Record-level hold**: Created with specific `(target_type, target_public_id)` targets. Blocks only those records.

### Hold Inheritance

Hold status is computed deterministically — NOT copied to child rows.

If an active project-level hold exists → ALL records in that project are disposition-blocked.

If a specific record hold exists → that record is disposition-blocked.

### Releasing a Hold

Releasing sets `status = 'released'`, `released_by`, and `released_at`. The hold record is preserved for audit purposes.

## Disposition

### Eligibility Gate (Fail-Closed)

A record may be eligible for disposition ONLY when ALL conditions are met:

1. Records schedule assigned
2. Schedule authority active (not superseded)
3. Record is temporary OR disposition action explicitly permits
4. Retention trigger date known
5. `eligible_disposition_at <= now()`
6. No active effective hold (project-level or record-level)
7. Record not already disposed/transferred
8. Acting user has owner/admin role
9. Disposition action matches schedule

If ANY condition fails, the system returns specific ineligibility reasons:

| Reason | Meaning |
|---|---|
| `NO_SCHEDULE` | No records schedule assigned |
| `SCHEDULE_SUPERSEDED` | Schedule authority has been superseded |
| `NO_CUTOFF` | Retention start date or eligible date not set |
| `NOT_YET_ELIGIBLE` | Retention period has not expired |
| `ACTIVE_HOLD` | Active preservation hold exists |
| `PERMANENT_RECORD` | Permanent records cannot be destroyed |
| `TRANSFER_REQUIRED` | Schedule requires transfer, not destruction |
| `ALREADY_DISPOSED` | Record already disposed |
| `AUTH_DENIED` | Actor lacks required authorization |

### Disposition Execution

For eligible temporary records with `disposition_action = 'destroy'`, the system routes through a **record-type disposition adapter**:

**Supported types (automated content suppression):**

| Record Type | Suppressed Fields | Preserved Structural Metadata |
|---|---|---|
| `evidence_construct` | `label`, `payload` | public_id, construct_type, derivation_type, status, created_by, timestamps |
| `research_artifact` | `title`, `path`, `url` | public_id, artifact_type, repo, ref, semantic_key, created_by, timestamps |

Completed destroy:
1. Suppresses destroyable content via adapter (NULLs payload columns)
2. Creates an immutable disposition event with `outcome='completed'`
3. Marks assignment `lifecycle_status = 'disposed'`
4. Preserves structural/audit identity for lineage

**Unsupported types (→ manual review):**

| Record Type | Reason |
|---|---|
| `project` | name/slug are routing keys; content suppression orphans child studies |
| `study` | name used in display paths; content suppression orphans participants/evidence |
| `evidence_source` | NOT NULL FK children in survey tables would break |

These return `outcome='manual_review_required'` — content remains intact, assignment is NOT marked disposed.

For `disposition_action = 'review'`:
- Returns `manual_review_required` — records officer must review

For `disposition_action = 'transfer'`:
- Returns `manual_review_required` — manual records officer action required

### Disposition Events

All disposition attempts (successful or blocked) create append-only events in `records_disposition_events`. Events record:

- Action attempted (`destroy`, `transfer`, `preserve`, `cancel`)
- Authority code and schedule item
- Outcome (`completed`, `blocked`, `manual_review_required`, `failed`)
- Actor and timestamp
- Structural metadata (no PII or record content)

## Permanent Records / Transfer

Permanent records (`record_value = 'permanent'`) follow a distinct lifecycle:

- **Never** eligible for `destroy` disposition
- May become `disposition_eligible` when transfer is required
- Require human records officer action for transfer preparation
- NARA transfer tooling is NOT implemented in this slice

## DSAR Interaction

### Policy Decision Boundary

Privacy/DSAR obligations and records-retention authority can conflict. The system implements a boundary check:

```
DSAR request → records/hold check → decision
```

| Scenario | Decision |
|---|---|
| No records assignment, no hold | `PERMIT` — DSAR may proceed |
| Active preservation hold | `BLOCKED_BY_HOLD` — data modification blocked |
| Active records schedule assignment | `GOVERNANCE_REVIEW_REQUIRED` |
| Record under management (no schedule) | `GOVERNANCE_REVIEW_REQUIRED` |
| Record already disposed | `PERMIT` — no conflict |

The system does NOT invent legal precedence. When both obligations apply → `GOVERNANCE_REVIEW_REQUIRED` for human records officer decision.

## Backup Interaction

Per GOV-5:

- Live system disposition does NOT rewrite historical PITR/WAL/backup objects
- Backup retention is governed separately by DR policy
- Restored backups must reapply current governance/disposition state before returning to service

## Operator Responsibilities

### Records Officer Gates

The following operations require manual records officer action:

1. **Schedule creation**: Only create schedules based on known records authority
2. **Schedule supersession**: Mark schedules superseded when authority changes
3. **Disposition review**: Records with `disposition_action = 'review'` require officer determination
4. **Transfer preparation**: Permanent records transfer requires officer coordination
5. **DSAR conflict resolution**: When both DSAR and records obligations apply

### Authorization Model

| Operation | Required Role |
|---|---|
| Archive/retrieve project | Authorized researcher (project member) |
| Create/release hold | Owner/admin |
| Execute disposition (destroy) | Owner/admin |
| Create records schedule | Owner/admin |
| Assign schedule to record | Owner/admin |

A future records-officer role is documented as follow-up if warranted.

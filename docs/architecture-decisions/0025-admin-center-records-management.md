# ADR 0025: Admin Center and Federal Records Management Architecture

**Status:** Accepted
**Date:** 2026-06-05
**Decision drivers:** Federal deployment readiness; VHA RCS 10-1 compliance; operationalizing the H7 DSAR engine built in #203
**Relates to:** ADR 0024 (project-level authorization), H7 remediation (#203), `/qori-delete` handler

## Context

Qori is a research operations platform deployed to VA. VA research data falls under federal records management law (44 U.S.C. § 3301 et seq.) and VHA-specific policy (VHA RCS 10-1, VHA Handbook 1200.12). These frameworks are explicit:

1. **Records have disposition schedules.** Every record has a classification that determines when it *may* be destroyed — not "should be deleted" but "may now be deleted, if the custodian chooses."

2. **Disposition is gated, not automatic.** A record cannot be destroyed until: (a) its retention period has elapsed, (b) no legal hold is active, and (c) an authorized person executes the disposition.

3. **Legal hold overrides everything.** When litigation, FOIA, congressional inquiry, or IG investigation is pending, a Records Freeze (litigation hold) suspends all disposition. Destruction during a hold is a federal violation.

4. **Improper disposal is reportable.** Per VHA RCS 10-1 and NARA guidance, unauthorized destruction of federal records is a NARA-reportable incident. The consequence is not merely "data loss" — it's regulatory exposure.

5. **Classification is a VA determination.** The mapping of Qori record types (session transcripts, atomic nuggets, research plans, participant PII) to VHA disposition schedules (RCS items) is a VA records-officer determination. We build the mechanism; VA sets the values.

The H7 remediation (#203) built a DSAR engine: `exportParticipantData()` assembles all participant data for export, `deleteParticipantDSAR()` cascade-deletes it. These functions exist but have no UI — they're currently only callable from code. The existing `/qori-delete` command (study deletion) is creator-gated but lacks legal-hold awareness and audit logging.

This ADR defines the architecture for:
- **Role model:** Surfacing the owner/member distinction in `project_members` for records-authority gating
- **Disposition data model:** Carrying classification, retention, and trigger metadata on records
- **Legal hold:** A first-class concept that blocks disposition
- **Retention-gated deletion:** Default to retain; permit deletion only when conditions are met
- **Audit logging:** Every disposition action logged for NARA compliance
- **Admin center:** A unified interface for destructive operations, gated and audited

---

## Decision

### 1. Role Model: Owner as Records Authority

**Principle:** Project owners are the records authority for their project. Members can work the data; only owners can destroy it.

**Builds on ADR 0024.** The `project_members` table already has a `role` column with values `'owner'` and `'member'`. ADR 0024 used this for project-delete gating. This ADR extends the pattern:

| Operation | Current Gate | New Gate |
|-----------|--------------|----------|
| Read/analyze/generate | Project membership | *Unchanged* |
| Delete study | Study creator | **Project owner** |
| Delete participant (DSAR) | `assertStudyAccess` | **Project owner** |
| DSAR export | `assertStudyAccess` | **Project owner** |
| Delete project | Project creator | **Project owner** |
| Set/release legal hold | N/A | **System admin or designated authority** |

**Note (2026-06-05):** All Admin Center operations are owner-gated. The original design considered membership-gating for export (read-only), but for simplicity and consistency, Phase 1 implements owner-only access to the Admin Center UI. This eliminates the need for a separate "member export" UI path and keeps the authorization model uniform: members work the data, owners manage and dispose it.

**Why owner, not creator?** Research projects outlive individual researchers. A study creator may leave the organization; the project owner (records authority) remains responsible for disposition. The owner role already exists — we elevate its semantics.

**Authorization helper:**

```typescript
/**
 * Assert user is a project owner (records authority).
 * Throws AuthorizationError if not.
 */
export async function assertProjectOwner(
  userId: string,
  projectId: number,
): Promise<void> {
  const membership = await ProjectMemberModel.findOne({
    where: { project_id: projectId, user_id: userId, role: 'owner' },
  });
  if (!membership) {
    throw new AuthorizationError(
      'Access denied: only project owners can perform this action'
    );
  }
}

/**
 * Assert user is an owner of the project containing this study.
 */
export async function assertStudyOwner(
  userId: string,
  studyId: number,
): Promise<void> {
  const study = await ResearchStudyModel.findByPk(studyId, {
    attributes: ['id', 'project_id'],
  });
  if (!study || !study.project_id) {
    throw new AuthorizationError('Study not found or has no project');
  }
  await assertProjectOwner(userId, study.project_id);
}
```

**Operational note:** Current projects have exactly one owner (the creator, seeded with `source='creator'`). Multi-owner projects are supported by the schema but not by current UI. When a primary owner transfers authority, the new owner is added with `role='owner'` via direct DB insert or future "Transfer Ownership" UI.

---

### 2. Records Disposition Data Model

**Principle:** Every Qori record carries disposition metadata. Classification values are deployment-configured; we build the schema to hold them.

**VHA RCS 10-1 structure (simplified):**
- **Record Series:** A category of records (e.g., "Human Subjects Research Records")
- **Item Number:** Specific disposition schedule item (e.g., "10-1, Item 1550.1")
- **Disposition Instruction:** What happens and when (e.g., "Destroy 6 years after study closure")
- **Disposition Authority:** Legal citation (e.g., "N1-15-93-1, Item 10")
- **Trigger Event:** When the clock starts (e.g., "study closure", "participant withdrawal")

**Qori record types** (initial classification buckets):

| Record Type | Examples | PII Level |
|-------------|----------|-----------|
| `participant_record` | `study_participants` row | High |
| `session_transcript` | `study_notes` with `transcript=true` | High |
| `session_artifact` | `study_notes` with `transcript=false` | Medium |
| `cascade_variable` | `study_variables` row (nuggets, quotes) | High |
| `research_document` | GitHub-rendered plans, briefs, readouts | Low |
| `study_metadata` | `research_studies` row | Low |

*Note: The mapping of these record types to VHA RCS 10-1 schedule items is a VA records-officer determination. The `disposition_schedules` table holds whatever classification they assign — we do not assert category membership here.*

**New table: `disposition_schedules`** (deployment-configured by VA records officer)

```sql
CREATE TABLE disposition_schedules (
  id SERIAL PRIMARY KEY,

  -- Classification identity
  record_type VARCHAR(50) NOT NULL UNIQUE,  -- Qori record type (enum above)
  rcs_item VARCHAR(50),                     -- VHA RCS 10-1 item number (e.g., "1550.1")
  series_title VARCHAR(255),                -- Human-readable series name

  -- Disposition instruction
  disposition_action VARCHAR(50) NOT NULL DEFAULT 'destroy',
    -- 'destroy' | 'transfer' | 'permanent'
  retention_years INTEGER,                  -- NULL = "when business use ceases" or permanent
  trigger_event VARCHAR(50) NOT NULL DEFAULT 'study_closure',
    -- 'study_closure' | 'participant_withdrawal' | 'fiscal_year_end' | 'business_use_ceases'

  -- Authority
  disposition_authority VARCHAR(100),       -- NARA citation (e.g., "N1-15-93-1, Item 10")

  -- Operational
  requires_pii_handling BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed with deployment defaults (VA records officer adjusts)
INSERT INTO disposition_schedules (record_type, disposition_action, trigger_event, requires_pii_handling)
VALUES
  ('participant_record', 'destroy', 'study_closure', TRUE),
  ('session_transcript', 'destroy', 'study_closure', TRUE),
  ('session_artifact', 'destroy', 'study_closure', TRUE),
  ('cascade_variable', 'destroy', 'study_closure', TRUE),
  ('research_document', 'destroy', 'study_closure', FALSE),
  ('study_metadata', 'destroy', 'study_closure', FALSE);
```

**Why separable record types?** VHA RCS 10-1 is explicit: "Records that are not readily separable from other records in the same system must be retained for the longest applicable retention period." By classifying records at the row level (or bucket level), we avoid forcing short-retention items to inherit long-retention schedules. Participant PII may have a 6-year retention; administrative metadata may have 3-year. Keep them separable.

**Study-level trigger tracking:**

```sql
ALTER TABLE research_studies ADD COLUMN IF NOT EXISTS
  closed_at TIMESTAMP;  -- When trigger_event='study_closure', this is the clock start

-- Future: participant-level trigger
ALTER TABLE study_participants ADD COLUMN IF NOT EXISTS
  withdrawn_at TIMESTAMP;  -- When trigger_event='participant_withdrawal'
```

**Classification is external.** The `disposition_schedules` table ships with placeholder values. Before VA production deployment, the VA records officer maps Qori record types to actual RCS items and sets `retention_years`, `disposition_authority`, etc. We do not hardcode "6 years" — we build the mechanism to read whatever they configure.

---

### 3. Legal Hold

**Principle:** Legal hold is a first-class entity that suspends all disposition. Holds are set by authority, centrally tracked, and checked before any deletion.

**From VHA RCS 10-1:** A "Records Freeze" or "Litigation Hold" is issued when:
- Litigation is pending or anticipated
- FOIA request is in progress
- Congressional inquiry is active
- OIG investigation is underway
- Any official request requires records preservation

**Table: `legal_holds`**

```sql
CREATE TABLE legal_holds (
  id SERIAL PRIMARY KEY,

  -- Scope (one of these is set)
  scope_type VARCHAR(20) NOT NULL,  -- 'global' | 'project' | 'study' | 'participant'
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  study_id INTEGER REFERENCES research_studies(id) ON DELETE CASCADE,
  participant_id INTEGER REFERENCES study_participants(id) ON DELETE CASCADE,

  -- Hold details
  reason VARCHAR(50) NOT NULL,
    -- 'litigation' | 'foia' | 'congressional' | 'oig' | 'audit' | 'other'
  reference_number VARCHAR(100),  -- Case number, FOIA tracking ID, etc.
  description TEXT,

  -- Lifecycle
  issued_by VARCHAR(50) NOT NULL,      -- Slack user ID of authority
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_by VARCHAR(50),
  released_at TIMESTAMP,
  release_reason TEXT,

  -- Operational
  is_active BOOLEAN GENERATED ALWAYS AS (released_at IS NULL) STORED,

  CONSTRAINT valid_scope CHECK (
    (scope_type = 'global' AND project_id IS NULL AND study_id IS NULL AND participant_id IS NULL) OR
    (scope_type = 'project' AND project_id IS NOT NULL AND study_id IS NULL AND participant_id IS NULL) OR
    (scope_type = 'study' AND study_id IS NOT NULL AND participant_id IS NULL) OR
    (scope_type = 'participant' AND participant_id IS NOT NULL)
  )
);

CREATE INDEX idx_legal_holds_active ON legal_holds(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_legal_holds_project ON legal_holds(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_legal_holds_study ON legal_holds(study_id) WHERE study_id IS NOT NULL;
CREATE INDEX idx_legal_holds_participant ON legal_holds(participant_id) WHERE participant_id IS NOT NULL;
```

**Hold check helper:**

```typescript
import { Op } from 'sequelize';

interface HoldCheckResult {
  isHeld: boolean;
  holds: Array<{
    id: number;
    scope_type: string;
    reason: string;
    reference_number: string | null;
    issued_by: string;
    issued_at: Date;
  }>;
}

/**
 * Check if a record is under legal hold.
 *
 * Checks from broadest to narrowest scope:
 * 1. Global holds (affect everything)
 * 2. Project holds (affect all studies in project)
 * 3. Study holds (affect all participants in study)
 * 4. Participant holds (affect specific participant)
 *
 * SECURITY: Uses parameterized Sequelize queries — never string interpolation.
 */
export async function checkLegalHold(
  options: {
    projectId?: number;
    studyId?: number;
    participantId?: number;
  }
): Promise<HoldCheckResult> {
  // Build OR conditions using Sequelize Op — NEVER string interpolation
  const orConditions: Array<Record<string, unknown>> = [
    { scope_type: 'global' },  // Global holds always checked
  ];

  if (options.projectId) {
    orConditions.push({
      scope_type: 'project',
      project_id: options.projectId,
    });
  }
  if (options.studyId) {
    orConditions.push({
      scope_type: 'study',
      study_id: options.studyId,
    });
  }
  if (options.participantId) {
    orConditions.push({
      scope_type: 'participant',
      participant_id: options.participantId,
    });
  }

  const holds = await LegalHold.findAll({
    where: {
      is_active: true,
      [Op.or]: orConditions,
    },
    order: [['issued_at', 'DESC']],
  });

  return {
    isHeld: holds.length > 0,
    holds: holds.map(h => ({
      id: h.id,
      scope_type: h.scope_type,
      reason: h.reason,
      reference_number: h.reference_number,
      issued_by: h.issued_by,
      issued_at: h.issued_at,
    })),
  };
}
```

**Who can set/release holds?** This is deployment-specific. Initial implementation: only users with a designated "records_admin" flag (new column on `project_members` or separate `system_admins` table). VA may tie this to their existing authority structure.

---

### 4. Retention-Gated Deletion

**Principle:** Retain by default. Deletion is the *gated exception*, permitted only when disposition conditions are affirmatively met.

**Deletion requires ALL of:**
1. **Authorization:** User is project owner (records authority)
2. **Trigger elapsed:** Disposition trigger has occurred (e.g., study closed) AND retention period has passed
3. **No hold:** No active legal hold covers this record
4. **Explicit confirmation:** User has acknowledged the deletion via confirmation UI

**Disposition eligibility check:**

```typescript
interface DispositionEligibility {
  eligible: boolean;
  reasons: string[];  // Human-readable explanations
  blockers: Array<{
    type: 'hold' | 'retention' | 'trigger_not_met';
    detail: string;
  }>;
}

/**
 * Check if a record is eligible for disposition (deletion).
 *
 * IMPORTANT: This function determines IF deletion is PERMITTED, not whether
 * it should happen. The decision to delete is made by the records authority
 * (project owner) — this function enforces the legal constraints.
 */
export async function checkDispositionEligibility(
  recordType: string,
  options: {
    studyId: number;
    participantId?: number;
  }
): Promise<DispositionEligibility> {
  const blockers: DispositionEligibility['blockers'] = [];
  const reasons: string[] = [];

  // 1. Get disposition schedule for this record type
  const schedule = await DispositionSchedule.findOne({
    where: { record_type: recordType },
  });

  if (!schedule) {
    // No schedule = conservative default (retain indefinitely)
    blockers.push({
      type: 'retention',
      detail: `No disposition schedule configured for record type "${recordType}"`,
    });
    return { eligible: false, reasons, blockers };
  }

  // 2. Check trigger event
  const study = await ResearchStudy.findByPk(options.studyId);

  if (schedule.trigger_event === 'study_closure') {
    if (!study?.closed_at) {
      blockers.push({
        type: 'trigger_not_met',
        detail: 'Study has not been closed. Disposition is not permitted until study closure.',
      });
    } else if (schedule.retention_years) {
      const cutoffDate = new Date(study.closed_at);
      cutoffDate.setFullYear(cutoffDate.getFullYear() + schedule.retention_years);

      if (new Date() < cutoffDate) {
        blockers.push({
          type: 'retention',
          detail: `Retention period not elapsed. Eligible for disposition after ${cutoffDate.toISOString().split('T')[0]}.`,
        });
      } else {
        reasons.push(
          `Retention period elapsed: ${schedule.retention_years} years after study closure ` +
          `(${study.closed_at.toISOString().split('T')[0]}).`
        );
      }
    }
  }

  if (schedule.trigger_event === 'business_use_ceases') {
    reasons.push(
      'Disposition permitted when business use ceases. ' +
      'Records authority must confirm business use has ended.'
    );
  }

  // 3. Check legal holds
  const holdCheck = await checkLegalHold({
    projectId: study?.project_id ?? undefined,
    studyId: options.studyId,
    participantId: options.participantId,
  });

  if (holdCheck.isHeld) {
    for (const hold of holdCheck.holds) {
      blockers.push({
        type: 'hold',
        detail: `Legal hold active: ${hold.reason} (${hold.reference_number || 'no reference'}) — ` +
          `issued ${hold.issued_at.toISOString().split('T')[0]}`,
      });
    }
  }

  return {
    eligible: blockers.length === 0,
    reasons,
    blockers,
  };
}
```

**Privacy deletion requests (DSAR):** Data subjects may request deletion under various privacy frameworks (GDPR, CCPA, Privacy Act). However:

1. **Federal retention can override erasure.** For VA research data, VHA RCS 10-1 disposition schedules may require retention that supersedes a deletion request. Research records are typically long-retention (tied to study closure + years).

2. **Applicability is a VA determination.** Whether GDPR/CCPA erasure rights apply to a given participant's data — and how they interact with federal retention obligations — is a VA legal/policy determination, not a default we assume.

3. **The system supports both postures.** When disposition permits deletion (trigger met, retention elapsed, no hold), the DSAR delete proceeds. When retention requirements block deletion, the request is denied with explanation. The classification decides, not the code.

**VA's default posture is conservative retention.** The architecture assumes records are retained until disposition conditions are affirmatively met — not that erasure requests automatically succeed. This matches RCS 10-1's framework: disposition is a *permitted* action when conditions are satisfied, not a default outcome.

**Design supports both postures:**
- **DSAR-delete:** When disposition permits, delete proceeds
- **Retention-locked:** When blocked by schedule or hold, deletion is denied with reason
- **Export-only:** DSAR export is always available (read-only) regardless of deletion eligibility

The classification decides, not the code.

---

### 5. Disposition Audit Log

**Principle:** Every disposition action is logged with what/when/who/under-what-authority. Improper disposal is a NARA-reportable incident.

**Table: `disposition_audit_log`**

```sql
CREATE TABLE disposition_audit_log (
  id SERIAL PRIMARY KEY,

  -- What was affected
  action VARCHAR(30) NOT NULL,
    -- 'delete_participant' | 'delete_study' | 'delete_project' | 'export_participant'
    -- | 'hold_issued' | 'hold_released' | 'deletion_blocked' | 'deletion_denied'
  record_type VARCHAR(50) NOT NULL,  -- From disposition_schedules
  target_id INTEGER,                  -- FK varies by record_type; logged for reference
  target_identifier VARCHAR(100),     -- Human-readable (e.g., "PT-007", study name)

  -- Context
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  study_id INTEGER REFERENCES research_studies(id) ON DELETE SET NULL,
  participant_id INTEGER,  -- Not FK — participant may be deleted

  -- Who
  actor_user_id VARCHAR(50) NOT NULL,  -- Slack user ID
  actor_role VARCHAR(20),              -- 'owner' | 'admin' | etc.

  -- Authorization
  authorization_basis TEXT NOT NULL,
    -- e.g., "Project owner per ADR 0025" | "DSAR request" | "Legal hold release"
  disposition_schedule_id INTEGER REFERENCES disposition_schedules(id),

  -- Legal hold context (if applicable)
  legal_hold_id INTEGER REFERENCES legal_holds(id),
  legal_hold_override BOOLEAN DEFAULT FALSE,  -- TRUE if action required hold release first

  -- Outcome
  outcome VARCHAR(20) NOT NULL,  -- 'success' | 'blocked' | 'denied' | 'error'
  outcome_detail TEXT,           -- Blockers, error messages, etc.

  -- Counts (what was actually affected)
  records_affected JSONB,  -- e.g., {"notes": 3, "variables": 47, "observers": 2}

  -- Timestamp
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_action ON disposition_audit_log(action);
CREATE INDEX idx_audit_log_project ON disposition_audit_log(project_id);
CREATE INDEX idx_audit_log_study ON disposition_audit_log(study_id);
CREATE INDEX idx_audit_log_actor ON disposition_audit_log(actor_user_id);
CREATE INDEX idx_audit_log_occurred_at ON disposition_audit_log(occurred_at);
```

**Audit helper:**

```typescript
interface AuditEntry {
  action: string;
  record_type: string;
  target_identifier: string;
  project_id?: number;
  study_id?: number;
  participant_id?: number;
  actor_user_id: string;
  actor_role: string;
  authorization_basis: string;
  disposition_schedule_id?: number;
  legal_hold_id?: number;
  legal_hold_override?: boolean;
  outcome: 'success' | 'blocked' | 'denied' | 'error';
  outcome_detail?: string;
  records_affected?: Record<string, number>;
}

/**
 * Log a disposition action. Always called, whether action succeeded or was blocked.
 */
export async function logDispositionAction(entry: AuditEntry): Promise<void> {
  await DispositionAuditLog.create({
    ...entry,
    records_affected: entry.records_affected ? JSON.stringify(entry.records_affected) : null,
    occurred_at: new Date(),
  });

  console.log(
    `[DISPOSITION AUDIT] ${entry.action} ${entry.outcome}: ` +
    `${entry.record_type} "${entry.target_identifier}" ` +
    `by ${entry.actor_user_id} (${entry.actor_role}) — ${entry.authorization_basis}`
  );
}
```

**What gets logged:**
- Every successful deletion (participant, study, project)
- Every blocked deletion (with blockers)
- Every denied deletion (authorization failure)
- Every export (DSAR data export)
- Every hold issued/released

**Audit log durability (critical):** The audit log uses `ON DELETE SET NULL` for `project_id` and `study_id` FKs. After a cascade delete, these columns become NULL — the referential link is gone. Therefore:

1. **Audit write MUST happen BEFORE cascade delete.** The deletion handler gathers all denormalized info (identifiers, counts, authority), writes the audit entry, *then* executes the delete.

2. **Denormalized fields are the durable record.** After deletion, `target_identifier` (e.g., "PT-007", "Accessibility Testing Q2"), `records_affected` (counts), and `authorization_basis` are the only surviving evidence of what was deleted. These must be complete and human-readable.

3. **Implementation pattern:**
   ```typescript
   // 1. Gather counts and identifiers BEFORE delete
   const counts = await gatherRecordCounts(studyId);
   const studyName = study.name;

   // 2. Write audit entry FIRST
   await logDispositionAction({
     action: 'delete_study',
     target_identifier: studyName,
     records_affected: counts,
     // ... other fields
   });

   // 3. THEN execute cascade delete
   await study.destroy();
   ```

**Retention of audit log:** The audit log itself is a federal record. Its disposition schedule: permanent or very long retention (VA records officer determines). Never auto-purge.

---

### 6. Admin Center Interface

**Principle:** A unified Slack interface for destructive operations, with confirmation friction, owner-gating, and retention checks.

**Scope:** The Admin Center absorbs the current `/qori-delete` command and adds:
- DSAR export (existing `exportParticipantData()`, now with UI)
- Participant deletion (existing `deleteParticipantDSAR()`, now with UI)
- Study closure (setting `closed_at` to trigger disposition eligibility)
- Legal hold viewer (read-only for project owners)

**Entry point:** `/qori-admin` command → opens Admin Center modal

**Modal structure:**

```
┌─────────────────────────────────────────┐
│  Admin Center                     [X]   │
├─────────────────────────────────────────┤
│  Project: {project_name}                │
│  Your role: Owner ✓                     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📋 DSAR Request                 │    │
│  │ Export or delete participant    │    │
│  │ data for privacy compliance     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🗑️ Delete Study                 │    │
│  │ Permanently remove a study      │    │
│  │ and all associated data         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📁 Close Study                  │    │
│  │ Mark study complete; starts     │    │
│  │ disposition retention clock     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ ⚖️ Legal Holds                  │    │
│  │ View active holds on this       │    │
│  │ project (read-only)             │    │
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│ ⚠️ These actions cannot be undone.      │
│ All actions are logged for compliance.  │
└─────────────────────────────────────────┘
```

**DSAR flow (example):**

1. User clicks "DSAR Request" → opens participant picker (study → participant)
2. User selects action: Export | Delete | Both
3. System runs `checkDispositionEligibility()`:
   - If eligible: show confirmation with checkboxes
   - If blocked: show blockers, disable delete, allow export-only
4. User confirms via typed-study-name confirmation (existing pattern)
5. System executes, logs to `disposition_audit_log`, reports outcome

**Delete Study flow (absorbing `/qori-delete`):**

1. User clicks "Delete Study" → opens study picker
2. System runs `checkDispositionEligibility()` for all record types in study
3. If any record type blocked: show aggregate blockers, explain which record types are held
4. If eligible: show confirmation with record counts
5. User types study name to confirm
6. System executes cascading delete, logs to audit, reports outcome

**Confirmation friction pattern:**

```
┌─────────────────────────────────────────┐
│  Confirm Deletion                 [X]   │
├─────────────────────────────────────────┤
│  You are about to permanently delete:   │
│                                         │
│  Study: Accessibility Testing Q2        │
│  • 12 participants                      │
│  • 47 session transcripts               │
│  • 234 cascade variables (nuggets)      │
│  • 8 research documents (GitHub)        │
│                                         │
│  Disposition authority:                 │
│  VHA RCS 10-1, Item 1550.1              │
│                                         │
│  ☐ I confirm this study is closed       │
│  ☐ I confirm business use has ceased    │
│  ☐ I understand this cannot be undone   │
│                                         │
│  Type "Accessibility Testing Q2" to     │
│  confirm:                               │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│           [Cancel]  [Delete Forever]    │
└─────────────────────────────────────────┘
```

---

### 7. Phasing

**Full vision above. Build incrementally.**

#### Phase 1: Owner-Gating + Admin Center Shell + Audit Log

**Goal:** Make destructive operations owner-gated and audited. No retention/hold logic yet — just proper authorization and logging.

**Deliverables:**
- [ ] `assertProjectOwner()` and `assertStudyOwner()` helpers
- [ ] `/qori-admin` command with Admin Center modal
- [ ] Migrate `/qori-delete` into Admin Center (owner-gated, not creator-gated)
- [ ] Wire `exportParticipantData()` and `deleteParticipantDSAR()` to Admin Center UI
- [ ] `disposition_audit_log` table and `logDispositionAction()` helper
- [ ] All delete operations log to audit (success or failure)
- [ ] Confirmation modal with checkbox friction

**Not in Phase 1:**
- Disposition schedules (no retention checking)
- Legal holds (no hold checking)
- Study closure trigger

**Security stance:** Phase 1 is "owner-gated + audit logged" — a significant improvement over current state (creator-gated, no audit). Deletion is still permissive (no retention blocks), but only owners can execute, and everything is logged.

**Known interim gap (Phase 1–2):** Legal holds are NOT technically enforced until Phase 3. An owner CAN delete records that would later be hold-blocked once the hold system is built. For pre-VA alpha use, this is acceptable — holds are a procedural control (VA records officer issues verbally, team complies manually). For VA production, Phase 3 must be complete before holds are operationally relied upon. This is the same "function-only, interface pending" discipline as H7's DSAR engine.

---

#### Phase 2: Disposition Schedules + Retention-Gated Deletion

**Goal:** Add disposition classification and retention checking. Deletion blocked when retention period not elapsed.

**Deliverables:**
- [ ] `disposition_schedules` table with seed data
- [ ] `closed_at` column on `research_studies`
- [ ] "Close Study" action in Admin Center (sets trigger)
- [ ] `checkDispositionEligibility()` helper
- [ ] Delete actions check eligibility; blocked deletions logged with reason
- [ ] UI shows blockers when deletion not permitted

**Not in Phase 2:**
- Legal holds
- Hold management UI

**Security stance:** Phase 2 adds retention enforcement. Deletion is now gated by (owner + trigger elapsed + retention met). Still no hold awareness.

---

#### Phase 3: Legal Hold System

**Goal:** First-class legal hold with central tracking and disposition override.

**Deliverables:**
- [ ] `legal_holds` table
- [ ] `checkLegalHold()` helper
- [ ] Legal hold viewer in Admin Center (read-only for owners)
- [ ] Hold management interface (separate, admin-only, TBD scope)
- [ ] Disposition eligibility check includes hold check
- [ ] Hold-blocked deletions logged with hold reference

**Security stance:** Phase 3 completes the federal records-management posture. Deletion is gated by (owner + trigger elapsed + retention met + no hold).

---

#### Phase 4: VA Configuration Handoff

**Goal:** VA records officer populates `disposition_schedules` with real RCS values. Verify system honors their configuration.

**Deliverables:**
- [ ] Documentation for VA records officer: how to configure schedules
- [ ] Verification test: set schedule, close study, verify retention gating
- [ ] Verification test: set hold, attempt delete, verify block
- [ ] Production deployment with VA-configured values

---

## Alternatives Considered

### A. Role-based on new tier (e.g., "admin" role)

Could add a third role (`'admin'`) to `project_members` for records authority.

**Rejected:** The owner/member distinction already exists and maps cleanly to VA's concept. Adding a third tier increases complexity without clear benefit. "Owner" means "records authority" — that's the correct semantic.

### B. Hardcode retention periods in code

Could implement "6 years after study closure" as application logic.

**Rejected:** Retention periods are VA policy, not application constants. They change when policy changes. The correct design is a configuration table (`disposition_schedules`) that VA's records officer populates. We build the mechanism; they set the values.

### C. Auto-disposition (delete automatically when eligible)

Could implement a cron job that deletes eligible records without human action.

**Rejected:** Federal records management requires human authorization for disposition. Even when eligible, the records authority (owner) must execute the deletion. Auto-delete removes human judgment and creates audit complications. The correct model is "eligible, pending owner action."

### D. Per-row disposition metadata

Could add `record_type`, `disposition_schedule_id` to every row in every table.

**Rejected:** Over-normalized for current needs. Record type is inferrable from table (e.g., `study_participants` → `participant_record`). Per-row metadata is only needed if different rows in the same table have different classifications — not currently the case. If needed later, migrate.

### E. Soft-delete instead of hard-delete

Could use `deleted_at` columns and never physically delete.

**Rejected for disposition actions:** When disposition is authorized (all conditions met) and the records authority executes it, the action is hard-delete. Soft-delete would mean records are never actually disposed — they accumulate indefinitely with tombstone flags. This contradicts the RCS 10-1 framework: disposition means disposition.

**Caveat:** Whether a *privacy deletion request* (DSAR) results in hard-delete or requires retention depends on VA's classification of the record and any applicable legal holds. The system supports hard-delete *when permitted* — it does not assume erasure is always the outcome. Soft-delete might be appropriate for records under retention obligation where a DSAR is received; that's a VA policy decision implemented via the disposition schedule, not a blanket architectural choice.

---

## Consequences

### Positive

- **Federal compliance:** Architecture directly maps to VHA RCS 10-1 concepts
- **Audit trail:** Every disposition action logged for NARA compliance
- **Flexible configuration:** VA records officer sets retention values, not developers
- **Progressive enhancement:** Phase 1 immediately improves security (owner-gating + audit)
- **Explicit authority:** Project owners are unambiguously the records authority
- **Support both postures:** DSAR-delete and retention-locked coexist based on classification

### Negative

- **Complexity:** Three new tables, new helpers, new UI flows
- **Friction:** Deletions require more confirmation (intentional, not incidental)
- **Configuration burden:** VA must populate `disposition_schedules` before Phase 2 is meaningful

### Neutral

- **Existing H7 code preserved:** `exportParticipantData()` and `deleteParticipantDSAR()` continue to work; Admin Center wraps them with UI and gating
- **Owner/member semantics clarified:** Previously implicit; now explicit

---

## Explicit Scope Boundaries

**We build the mechanism; VA sets the values.**

| Responsibility | Owner |
|----------------|-------|
| Qori record types (buckets) | Qori team |
| `disposition_schedules` schema | Qori team |
| Record-type-to-RCS-item mapping | **VA records officer** |
| Retention years per record type | **VA records officer** |
| Disposition authority citations | **VA records officer** |
| Legal hold issuance/release | **VA designated authority** |
| Application code honoring all of above | Qori team |

**Cite:** VHA RCS 10-1 (VHA Records Control Schedule) is the framework source for disposition concepts, trigger events, and legal hold requirements in this design.

---

## References

- ADR 0024: Project-Level Authorization Model
- VHA RCS 10-1: VHA Records Control Schedule
- VHA Handbook 1200.12: Use of Data and Data Repositories in VHA Research
- 44 U.S.C. § 3301 et seq.: Federal Records Act
- NARA Bulletin 2014-06: Litigation Holds
- H7 remediation (#203): DSAR engine implementation
- `backend/src/services/dsar.service.ts`: Existing export/delete functions
- `backend/src/services/authorization.service.ts`: Existing auth helpers

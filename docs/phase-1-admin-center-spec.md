# Phase 1 Spec: Admin Center + Owner-Gating + Audit Log

**ADR:** 0025 (Admin Center and Federal Records Management)
**Scope:** Owner-gating + admin center shell + audit log + wire H7 DSAR to UI
**NOT in scope:** disposition_schedules, checkDispositionEligibility, legal_holds, closed_at
**Goal:** Make existing destructive capability reachable, gated, and audited

---

## Pre-Build Verification (BLOCKING)

### Owner Coverage Audit

ADR 0025 asserts every project has one owner (creator seeded with `role='owner'`, `source='creator'`). The admin center will DENY access to any project without an owner row. Before building the gate, verify the property: **no legitimate user is locked out of their own project.**

This requires more than a row count — the bootstrap assumes `projects.created_by` is populated and valid.

#### Step 1: Confirm unique constraint exists

```sql
-- Verify unique constraint on project_members(project_id, user_id)
-- If missing, ON CONFLICT will throw instead of upserting
SELECT conname FROM pg_constraint
WHERE conrelid = 'project_members'::regclass
AND contype = 'u';
```

**Expected:** Row with constraint name (e.g., `project_members_project_id_user_id_key`).

**If missing:** Add the constraint before bootstrap:
```sql
ALTER TABLE project_members
ADD CONSTRAINT project_members_project_id_user_id_key
UNIQUE (project_id, user_id);
```

#### Step 2: Identify projects without owners

```sql
-- Projects with NO owner in project_members
SELECT p.id, p.name, p.created_by, p.created_at
FROM projects p
LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
WHERE pm.id IS NULL;
```

**Expected:** Zero rows.

#### Step 3: Identify projects with NULL/empty created_by (bootstrap cannot fix)

```sql
-- Projects where created_by is NULL or empty — cannot bootstrap owner
SELECT id, name, created_by, created_at
FROM projects
WHERE created_by IS NULL OR created_by = '';
```

**Expected:** Zero rows.

**If non-zero:** Manual intervention required. These projects need an owner assigned manually (determine legitimate owner, insert row).

#### Step 4: Run bootstrap fix (if Step 2 found rows AND Step 3 is zero)

```sql
INSERT INTO project_members (project_id, user_id, role, source)
SELECT id, created_by, 'owner', 'creator'
FROM projects
WHERE id NOT IN (SELECT DISTINCT project_id FROM project_members WHERE role = 'owner')
  AND created_by IS NOT NULL AND created_by != ''
ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner';
```

#### Step 5: Re-verify (Step 2 query returns zero rows)

#### Step 6: Check for departed/invalid sole owners

```sql
-- Projects whose ONLY owner might be departed (no recent activity)
-- This is a warning check, not a blocker — but document any results
SELECT p.id, p.name, pm.user_id as owner_id, pm.added_at
FROM projects p
JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'owner'
LEFT JOIN project_members pm2 ON pm2.project_id = p.id AND pm2.role = 'owner' AND pm2.id != pm.id
WHERE pm2.id IS NULL  -- Only one owner
ORDER BY pm.added_at;
```

Review any results: if the sole owner is known to be departed, assign a new owner before proceeding.

**Status checklist:**
- [ ] Step 1: Unique constraint exists
- [ ] Step 2: All projects have owner rows (or Step 4 fixed it)
- [ ] Step 3: No projects with NULL/empty created_by
- [ ] Step 5: Re-verification passed
- [ ] Step 6: Sole-owner review complete (no departed users blocking access)

---

## 1. Role Gate (Foundation)

### Files Touched

| File | Action |
|------|--------|
| `backend/src/services/authorization.service.ts` | Add `assertProjectOwner()`, `assertStudyOwner()` |
| `backend/src/__tests__/unit/authorization.service.test.ts` | Add unit tests |

### Implementation

```typescript
// authorization.service.ts — ADD these functions

/**
 * Assert user is a project owner (records authority).
 * Throws AuthorizationError if not.
 *
 * FAIL-CLOSED: Database errors → DENY, throw AuthorizationError
 */
export async function assertProjectOwner(
  userId: string,
  projectId: number,
): Promise<void> {
  try {
    const membership = await ProjectMemberModel.findOne({
      where: { project_id: projectId, user_id: userId, role: 'owner' },
    });

    if (!membership) {
      throw new AuthorizationError(
        'Access denied: only project owners can perform this action'
      );
    }
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    // Database error — fail closed
    console.error(
      `[AUTH] assertProjectOwner failed for user=${userId} project=${projectId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

/**
 * Assert user is an owner of the project containing this study.
 * Throws AuthorizationError if not.
 *
 * FAIL-CLOSED: Database errors → DENY, throw AuthorizationError
 */
export async function assertStudyOwner(
  userId: string,
  studyId: number,
): Promise<void> {
  try {
    const study = await ResearchStudyModel.findByPk(studyId, {
      attributes: ['id', 'project_id'],
    });

    if (!study) {
      throw new AuthorizationError('Study not found');
    }

    if (!study.project_id) {
      throw new AuthorizationError('Study has no project — cannot verify ownership');
    }

    await assertProjectOwner(userId, study.project_id);
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    console.error(
      `[AUTH] assertStudyOwner failed for user=${userId} study=${studyId}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AuthorizationError('Access denied: authorization check failed');
  }
}

/**
 * Check if user is a project owner (non-throwing version).
 * Returns false on any error (fail-closed).
 */
export async function isProjectOwner(
  userId: string,
  projectId: number,
): Promise<boolean> {
  try {
    const membership = await ProjectMemberModel.findOne({
      where: { project_id: projectId, user_id: userId, role: 'owner' },
    });
    return !!membership;
  } catch (error) {
    console.error(
      `[AUTH] isProjectOwner check failed for user=${userId} project=${projectId}:`,
      error instanceof Error ? error.message : error,
    );
    return false;  // Fail closed
  }
}
```

### Unit Tests

```typescript
describe('assertProjectOwner', () => {
  it('allows project owner', async () => {
    // Setup: user is owner of project
    await expect(assertProjectOwner(ownerId, projectId)).resolves.not.toThrow();
  });

  it('denies project member (non-owner)', async () => {
    // Setup: user is member but not owner
    await expect(assertProjectOwner(memberId, projectId))
      .rejects.toThrow(AuthorizationError);
  });

  it('denies non-member', async () => {
    await expect(assertProjectOwner(strangerId, projectId))
      .rejects.toThrow(AuthorizationError);
  });

  it('fails closed on database error', async () => {
    // Mock DB to throw
    await expect(assertProjectOwner(userId, projectId))
      .rejects.toThrow(AuthorizationError);
  });
});

describe('assertStudyOwner', () => {
  it('allows owner of study\'s project', async () => {
    await expect(assertStudyOwner(ownerId, studyId)).resolves.not.toThrow();
  });

  it('denies member of study\'s project', async () => {
    await expect(assertStudyOwner(memberId, studyId))
      .rejects.toThrow(AuthorizationError);
  });

  it('throws on study not found', async () => {
    await expect(assertStudyOwner(ownerId, 99999))
      .rejects.toThrow('Study not found');
  });

  it('throws on study with no project', async () => {
    // Setup: orphan study with project_id = NULL
    await expect(assertStudyOwner(ownerId, orphanStudyId))
      .rejects.toThrow('Study has no project');
  });
});
```

### Pre-Build Check: Verify isProjectMember Signature

The Admin Center modal uses `isProjectMember(userId, projectId, slackClient)` for the non-owner path. Confirm this helper exists with the expected signature in `authorization.service.ts`:

```typescript
// Expected signature (from ADR 0024 implementation)
export async function isProjectMember(
  userId: string,
  projectId: number,
  slackClient?: WebClient,  // Optional — channel membership fallback
): Promise<boolean>
```

**Verification:** `grep -n "async function isProjectMember" backend/src/services/authorization.service.ts`

If signature differs (different param order, different name, missing client param), adjust the modal handler call to match the actual implementation. Do not assume — compile-and-runtime verify.

### Verification

- [ ] `assertProjectOwner()` throws on non-owner
- [ ] `assertProjectOwner()` throws on DB error (fail-closed)
- [ ] `assertStudyOwner()` chains to `assertProjectOwner()` correctly
- [ ] `isProjectOwner()` returns false on error (fail-closed, non-throwing)
- [ ] `isProjectMember()` exists with expected signature (verified via grep)
- [ ] All tests pass

---

## 2. Audit Log (Accountability)

### Files Touched

| File | Action |
|------|--------|
| `backend/src/database/migrations/XXXXXX-create-disposition-audit-log.js` | Create table |
| `backend/src/database/models/disposition_audit_log.ts` | Sequelize model |
| `backend/src/database/models/index.js` | Register model |
| `backend/src/services/audit.service.ts` | NEW: `logDispositionAction()` |
| `backend/src/__tests__/unit/audit.service.test.ts` | Unit tests |

### Migration

```javascript
// migrations/XXXXXX-create-disposition-audit-log.js

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('disposition_audit_log', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      // What was affected
      action: {
        type: Sequelize.STRING(30),
        allowNull: false,
        // 'delete_participant' | 'delete_study' | 'export_participant'
        // | 'deletion_denied' | 'deletion_error'
      },
      record_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      target_id: {
        type: Sequelize.INTEGER,
        allowNull: true,  // May be NULL after deletion
      },
      target_identifier: {
        type: Sequelize.STRING(255),
        allowNull: false,  // REQUIRED — durable human-readable ID
      },

      // Context (SET NULL on delete — target_identifier is the durable record)
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'SET NULL',
      },
      project_name: {
        type: Sequelize.STRING(255),
        allowNull: true,  // Denormalized for durability
      },
      study_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'research_studies', key: 'id' },
        onDelete: 'SET NULL',
      },
      study_name: {
        type: Sequelize.STRING(255),
        allowNull: true,  // Denormalized for durability
      },
      participant_id: {
        type: Sequelize.INTEGER,
        allowNull: true,  // Not FK — participant may be deleted
      },
      participant_code: {
        type: Sequelize.STRING(20),
        allowNull: true,  // Denormalized for durability (e.g., "PT-007")
      },

      // Who
      actor_user_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      actor_role: {
        type: Sequelize.STRING(20),
        allowNull: true,  // 'owner' | 'member' | etc.
      },

      // Authorization
      authorization_basis: {
        type: Sequelize.TEXT,
        allowNull: false,
        // e.g., "Project owner per ADR 0025" | "DSAR request"
      },

      // Outcome
      outcome: {
        type: Sequelize.STRING(20),
        allowNull: false,
        // 'success' | 'denied' | 'error'
      },
      outcome_detail: {
        type: Sequelize.TEXT,
        allowNull: true,  // Error messages, denial reasons
      },

      // Counts (what was actually affected)
      records_affected: {
        type: Sequelize.JSONB,
        allowNull: true,
        // e.g., {"notes": 3, "variables": 47, "observers": 2}
      },

      // Timestamp
      occurred_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Indexes for querying
    await queryInterface.addIndex('disposition_audit_log', ['action']);
    await queryInterface.addIndex('disposition_audit_log', ['project_id']);
    await queryInterface.addIndex('disposition_audit_log', ['study_id']);
    await queryInterface.addIndex('disposition_audit_log', ['actor_user_id']);
    await queryInterface.addIndex('disposition_audit_log', ['occurred_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('disposition_audit_log');
  },
};
```

### Model

```typescript
// models/disposition_audit_log.ts

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from 'sequelize';

export type AuditAction =
  | 'delete_participant'
  | 'delete_study'
  | 'export_participant'
  | 'deletion_denied'
  | 'deletion_error';

export type AuditOutcome = 'success' | 'denied' | 'error';

class DispositionAuditLog extends Model<
  InferAttributes<DispositionAuditLog>,
  InferCreationAttributes<DispositionAuditLog>
> {
  declare id: CreationOptional<number>;
  declare action: AuditAction;
  declare record_type: string;
  declare target_id: number | null;
  declare target_identifier: string;
  declare project_id: number | null;
  declare project_name: string | null;
  declare study_id: number | null;
  declare study_name: string | null;
  declare participant_id: number | null;
  declare participant_code: string | null;
  declare actor_user_id: string;
  declare actor_role: string | null;
  declare authorization_basis: string;
  declare outcome: AuditOutcome;
  declare outcome_detail: string | null;
  declare records_affected: Record<string, number> | null;
  declare occurred_at: CreationOptional<Date>;
}

export default (sequelize: Sequelize) => {
  DispositionAuditLog.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      action: { type: DataTypes.STRING(30), allowNull: false },
      record_type: { type: DataTypes.STRING(50), allowNull: false },
      target_id: { type: DataTypes.INTEGER, allowNull: true },
      target_identifier: { type: DataTypes.STRING(255), allowNull: false },
      project_id: { type: DataTypes.INTEGER, allowNull: true },
      project_name: { type: DataTypes.STRING(255), allowNull: true },
      study_id: { type: DataTypes.INTEGER, allowNull: true },
      study_name: { type: DataTypes.STRING(255), allowNull: true },
      participant_id: { type: DataTypes.INTEGER, allowNull: true },
      participant_code: { type: DataTypes.STRING(20), allowNull: true },
      actor_user_id: { type: DataTypes.STRING(50), allowNull: false },
      actor_role: { type: DataTypes.STRING(20), allowNull: true },
      authorization_basis: { type: DataTypes.TEXT, allowNull: false },
      outcome: { type: DataTypes.STRING(20), allowNull: false },
      outcome_detail: { type: DataTypes.TEXT, allowNull: true },
      records_affected: { type: DataTypes.JSONB, allowNull: true },
      occurred_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'disposition_audit_log',
      underscored: true,
      timestamps: false,
      sequelize,
    },
  );

  return DispositionAuditLog;
};

export type { DispositionAuditLog };
```

### Service

```typescript
// services/audit.service.ts

import type { AuditAction, AuditOutcome, DispositionAuditLog } from '../database/models/disposition_audit_log';
import sequelize from '../database';

const AuditLogModel = sequelize.models.DispositionAuditLog as typeof DispositionAuditLog;

export interface AuditEntry {
  action: AuditAction;
  record_type: string;
  target_id?: number;
  target_identifier: string;  // REQUIRED — durable ID

  // Context (denormalized for durability)
  project_id?: number;
  project_name?: string;
  study_id?: number;
  study_name?: string;
  participant_id?: number;
  participant_code?: string;

  // Who
  actor_user_id: string;
  actor_role?: string;

  // Authorization
  authorization_basis: string;

  // Outcome
  outcome: AuditOutcome;
  outcome_detail?: string;
  records_affected?: Record<string, number>;
}

/**
 * Log a disposition action.
 *
 * CRITICAL: Call this BEFORE executing the delete, with pre-gathered counts
 * and identifiers. After cascade delete, FKs become NULL — the denormalized
 * fields are the only durable record.
 *
 * Always logs, whether action succeeded or was denied/errored.
 */
export async function logDispositionAction(entry: AuditEntry): Promise<DispositionAuditLog> {
  const logEntry = await AuditLogModel.create({
    action: entry.action,
    record_type: entry.record_type,
    target_id: entry.target_id ?? null,
    target_identifier: entry.target_identifier,
    project_id: entry.project_id ?? null,
    project_name: entry.project_name ?? null,
    study_id: entry.study_id ?? null,
    study_name: entry.study_name ?? null,
    participant_id: entry.participant_id ?? null,
    participant_code: entry.participant_code ?? null,
    actor_user_id: entry.actor_user_id,
    actor_role: entry.actor_role ?? null,
    authorization_basis: entry.authorization_basis,
    outcome: entry.outcome,
    outcome_detail: entry.outcome_detail ?? null,
    records_affected: entry.records_affected ?? null,
  });

  console.log(
    `[AUDIT] ${entry.action} ${entry.outcome}: ` +
    `${entry.record_type} "${entry.target_identifier}" ` +
    `by ${entry.actor_user_id} (${entry.actor_role ?? 'unknown'}) — ` +
    `${entry.authorization_basis}`
  );

  return logEntry;
}

/**
 * Helper to gather record counts for a study BEFORE deletion.
 * Returns counts suitable for records_affected field.
 */
export async function gatherStudyRecordCounts(studyId: number): Promise<Record<string, number>> {
  const [participants, notes, variables] = await Promise.all([
    sequelize.models.StudyParticipant.count({ where: { study_id: studyId } }),
    sequelize.models.StudyNotes.count({ where: { study_id: studyId } }),
    sequelize.models.StudyVariable.count({ where: { study_id: studyId } }),
  ]);

  return {
    participants,
    notes,
    variables,
  };
}

/**
 * Helper to gather record counts for a participant BEFORE deletion.
 */
export async function gatherParticipantRecordCounts(
  participantId: number,
  studyId: number,
  participantCode: string,
): Promise<Record<string, number>> {
  const [notes, observers, variables] = await Promise.all([
    sequelize.models.StudyNotes.count({ where: { participant_id: participantId } }),
    sequelize.models.SessionObserver.count({ where: { participant_id: participantId } }),
    sequelize.models.StudyVariable.count({
      where: { study_id: studyId, participant_id: participantCode },
    }),
  ]);

  return {
    notes,
    observers,
    variables,
  };
}
```

### Critical Ordering Pattern (Truthful Audit)

**Problem:** If we write `outcome:'success'` before the delete and then delete throws, the audit log falsely claims success when nothing was deleted. A false success in a federal audit log is worse than no log.

**Solution:** Write audit AFTER delete succeeds, but gather context BEFORE delete. If delete throws, log the error.

```typescript
// CORRECT: Gather context before, audit after, handle failure
async function deleteWithAudit(studyId: number, userId: string) {
  // 1. Load context BEFORE delete (will be gone after)
  const study = await ResearchStudy.findByPk(studyId, {
    include: [{ model: Project, as: 'project' }],
  });
  const studyName = study.name;
  const projectName = study.project?.name;

  // 2. Gather counts BEFORE delete (will be zero after)
  const counts = await gatherStudyRecordCounts(studyId);

  // 3. Prepare audit entry (don't write yet)
  const auditEntry = {
    action: 'delete_study' as const,
    record_type: 'study_metadata',
    target_id: studyId,
    target_identifier: studyName,
    project_id: study.project_id,
    project_name: projectName,
    study_id: studyId,
    study_name: studyName,
    actor_user_id: userId,
    actor_role: 'owner',
    authorization_basis: 'Project owner per ADR 0025',
    records_affected: counts,
  };

  // 4. Execute delete, THEN audit with true outcome
  try {
    await study.destroy();

    // 5. SUCCESS: Log truthful success
    await logDispositionAction({
      ...auditEntry,
      outcome: 'success',
    });
  } catch (error) {
    // 6. FAILURE: Log truthful error (nothing was deleted)
    await logDispositionAction({
      ...auditEntry,
      outcome: 'error',
      outcome_detail: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });

    // Re-throw so caller knows delete failed
    throw error;
  }
}

// WRONG: Audit says "success" before delete runs — false if delete throws
async function falsePositiveDelete(studyId: number, userId: string) {
  await logDispositionAction({ outcome: 'success', ... });  // LIES if next line throws
  await study.destroy();  // If this throws, log is now false
}

// WRONG: Delete before gathering context — counts are zero, names lost
async function lostContextDelete(studyId: number, userId: string) {
  await study.destroy();  // Context gone
  const counts = await gatherStudyRecordCounts(studyId);  // Returns all zeros
  await logDispositionAction({ records_affected: counts, ... });  // Useless
}
```

**Key invariant:** The audit log must never claim a deletion happened when it didn't (false positive), and must always capture what was deleted (denormalized context gathered before delete).

### Verification

- [ ] Migration runs successfully
- [ ] Model registered in index.js
- [ ] `logDispositionAction()` creates row with all denormalized fields
- [ ] `gatherStudyRecordCounts()` returns correct counts
- [ ] `gatherParticipantRecordCounts()` returns correct counts
- [ ] Audit row readable after referenced rows deleted (SET NULL works)

---

## 3. Admin Center Shell (/qori-admin)

### Files Touched

| File | Action |
|------|--------|
| `backend/src/helpers/slack/commands/admin/adminCenterHandler.ts` | NEW: Command handler |
| `backend/src/helpers/slack/ui/adminCenterModal.ts` | NEW: Modal builder |
| `backend/src/helpers/slack/events.ts` | Register command + modal callbacks |

### Command Handler

```typescript
// commands/admin/adminCenterHandler.ts

import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs } from '@slack/bolt';
import { isProjectOwner, isProjectMember } from '../../../../services/authorization.service';
import { getProjectByChannelId } from '../../../../services/project.service';
import { buildAdminCenterModal, buildNonOwnerModal } from '../../ui/adminCenterModal';

/**
 * /qori-admin command handler
 *
 * Opens the Admin Center modal for project owners.
 * Non-owners see an informational message, not the actions.
 */
export async function adminCenterCommandHandler({
  ack,
  command,
  client,
}: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();

  const userId = command.user_id;
  const channelId = command.channel_id;

  try {
    // 1. Get project from channel
    const project = await getProjectByChannelId(channelId);

    if (!project) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'This channel is not associated with a Qori project. ' +
          'Run `/qori-admin` from a project channel.',
      });
      return;
    }

    // 2. Check if user is owner
    const userIsOwner = await isProjectOwner(userId, project.id);

    // 3. Open appropriate modal
    if (userIsOwner) {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildAdminCenterModal(project),
      });
    } else {
      // Check if at least a member (for context)
      const userIsMember = await isProjectMember(userId, project.id, client);

      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildNonOwnerModal(project, userIsMember),
      });
    }
  } catch (error) {
    console.error('[ADMIN] Error opening admin center:', error);
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `Error opening Admin Center: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}
```

### Modal Builder

```typescript
// ui/adminCenterModal.ts

import type { ModalView } from '@slack/bolt';
import type { Project } from '../../../database/models/project';

/**
 * Admin Center modal for project owners.
 *
 * Phase 1 ACTIVE: DSAR, Delete Study
 * Phase 1 PREVIEW (disabled): Close Study, Legal Holds
 */
export function buildAdminCenterModal(project: Project): ModalView {
  return {
    type: 'modal',
    callback_id: 'admin-center-main',
    title: { type: 'plain_text', text: 'Admin Center' },
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify({ projectId: project.id }),
    blocks: [
      // Header
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Project:* ${project.name}\n*Your role:* Owner`,
        },
      },
      { type: 'divider' },

      // === ACTIVE ACTIONS (Phase 1) ===
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*DSAR Request*\nExport or delete participant data for privacy compliance.',
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: 'admin-dsar-open',
          style: 'primary',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Delete Study*\nPermanently remove a study and all associated data.',
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Open' },
          action_id: 'admin-delete-study-open',
          style: 'danger',
        },
      },

      { type: 'divider' },

      // === PREVIEW ACTIONS (Future — visibly disabled) ===
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_Coming in a future release:_',
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '~*Close Study*~\n_Mark study complete; starts disposition retention clock._',
        },
        // NO accessory button — visibly absent
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '~*Legal Holds*~\n_View active holds on this project._',
        },
        // NO accessory button — visibly absent
      },

      { type: 'divider' },

      // Footer warning
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: ':warning: *Actions here cannot be undone.* All actions are logged for compliance.',
          },
        ],
      },
    ],
  };
}

/**
 * Modal shown to non-owners.
 */
export function buildNonOwnerModal(project: Project, isMember: boolean): ModalView {
  const memberContext = isMember
    ? 'You are a project member, but only project owners can access the Admin Center.'
    : 'You are not a member of this project.';

  return {
    type: 'modal',
    callback_id: 'admin-center-non-owner',
    title: { type: 'plain_text', text: 'Admin Center' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Project:* ${project.name}`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:lock: *Owner-Only Access*\n\n${memberContext}\n\n` +
            'Contact a project owner if you need to:\n' +
            '• Export participant data (DSAR)\n' +
            '• Delete a participant or study',
        },
      },
    ],
  };
}
```

### Event Registration

```typescript
// events.ts — ADD these registrations

// Command
app.command('/qori-admin', adminCenterCommandHandler);

// Button actions (route to sub-flows)
app.action('admin-dsar-open', adminDsarOpenHandler);
app.action('admin-delete-study-open', adminDeleteStudyOpenHandler);
```

### Verification

- [ ] `/qori-admin` in project channel opens modal
- [ ] Owner sees DSAR and Delete Study buttons (active)
- [ ] Owner sees Close Study and Legal Holds (grayed, no button, "Coming in a future release")
- [ ] Non-owner sees "Owner-Only Access" message, no action buttons
- [ ] Non-member sees appropriate message
- [ ] Command from non-project channel shows error

---

## 4. Wire Existing Capability

### 4A. DSAR Export (Membership-Gated, Read-Only)

**Gate:** `assertStudyAccess()` (project membership) — NOT owner-gated. Export is read-only; denying members access to export their own project's data is over-gating.

**Confirm asymmetry is intentional:** Yes. Export = read operation. Delete = destructive operation. Different gates.

| File | Action |
|------|--------|
| `backend/src/helpers/slack/commands/admin/dsarHandler.ts` | NEW: DSAR flow handler |
| `backend/src/helpers/slack/ui/dsarModal.ts` | NEW: DSAR modals |
| `backend/src/services/dsar.service.ts` | Already exists — wire to UI |

```typescript
// dsarHandler.ts (simplified flow)

export async function adminDsarOpenHandler({ ack, body, client }) {
  await ack();
  // Open study picker → participant picker → action picker (Export / Delete / Both)
  // ...
}

export async function dsarExportHandler({ ack, body, view, client }) {
  await ack();

  const { studyId, participantId, userId } = parseMetadata(view);

  // Gate: membership (read-only, not owner)
  await assertStudyAccess(userId, studyId, client);

  // Execute export
  const exportData = await exportParticipantData(participantId, userId, client);

  // Log audit (export, not deletion)
  await logDispositionAction({
    action: 'export_participant',
    record_type: 'participant_record',
    target_identifier: exportData.participant_code,
    // ... other fields
    outcome: 'success',
  });

  // Send export to user (DM with JSON attachment or structured message)
  // ...
}
```

### 4B. DSAR Delete (Owner-Gated, Audited)

**Gate:** `assertStudyOwner()` — owner required for destruction.

```typescript
// dsarHandler.ts (delete flow)

export async function dsarDeleteHandler({ ack, body, view, client }) {
  await ack();

  const { studyId, participantId, participantCode, userId } = parseMetadata(view);

  // Gate: OWNER required
  await assertStudyOwner(userId, studyId);

  // 1. Gather context BEFORE delete (will be gone after)
  const study = await ResearchStudy.findByPk(studyId);
  const project = await Project.findByPk(study.project_id);

  // 2. Gather counts BEFORE delete (will be zero after)
  const counts = await gatherParticipantRecordCounts(participantId, studyId, participantCode);

  // 3. Prepare audit entry (don't write yet — outcome unknown)
  const auditEntry = {
    action: 'delete_participant' as const,
    record_type: 'participant_record',
    target_id: participantId,
    target_identifier: participantCode,
    project_id: project.id,
    project_name: project.name,
    study_id: studyId,
    study_name: study.name,
    participant_id: participantId,
    participant_code: participantCode,
    actor_user_id: userId,
    actor_role: 'owner',
    authorization_basis: 'Project owner per ADR 0025, DSAR deletion request',
    records_affected: counts,
  };

  // 4. Execute delete, THEN audit with true outcome
  try {
    const result = await deleteParticipantDSAR(participantId, userId, client);

    // 5. SUCCESS: Log truthful success
    await logDispositionAction({
      ...auditEntry,
      outcome: 'success',
    });

    // 6. Notify user of success
    // ...
  } catch (error) {
    // 7. FAILURE: Log truthful error (nothing was deleted)
    await logDispositionAction({
      ...auditEntry,
      outcome: 'error',
      outcome_detail: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });

    // 8. Notify user of failure
    // ...
    throw error;
  }
}
```

### Denial Logging Pattern

When `assertStudyOwner()` throws, the handler must log a denial (outcome: 'denied') for audit completeness:

```typescript
// Wrapper pattern for all destructive handlers
export async function dsarDeleteHandler({ ack, body, view, client }) {
  await ack();

  const { studyId, participantId, participantCode, userId } = parseMetadata(view);

  // Gather minimal context for denial logging (before owner check)
  const participant = await StudyParticipant.findByPk(participantId);
  const study = await ResearchStudy.findByPk(studyId);

  try {
    // Gate: OWNER required — throws AuthorizationError if not
    await assertStudyOwner(userId, studyId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      // Log DENIAL (non-owner attempted delete)
      await logDispositionAction({
        action: 'delete_participant',
        record_type: 'participant_record',
        target_identifier: participantCode,
        study_id: studyId,
        study_name: study?.name,
        participant_code: participantCode,
        actor_user_id: userId,
        actor_role: 'member',  // They weren't owner
        authorization_basis: 'Denied: user is not project owner',
        outcome: 'denied',
        outcome_detail: error.message,
      });

      // Notify user
      // ...
      return;  // Don't throw — handled gracefully
    }
    throw error;  // Unexpected error — re-throw
  }

  // ... proceed with delete (owner confirmed)
}
```

### 4C. Migrate /qori-delete (Creator → Owner, Add Audit)

**Critical:** Remove/redirect old route. Exactly ONE gated path.

| File | Action |
|------|--------|
| `backend/src/helpers/slack/commands/study/deleteStudyHandler.ts` | REMOVE or redirect |
| `backend/src/helpers/slack/commands/admin/deleteStudyHandler.ts` | NEW: Owner-gated version |
| `backend/src/helpers/slack/events.ts` | Update registration |

**Option A: Redirect old command to Admin Center**

```typescript
// commands/study/deleteStudyHandler.ts — REPLACE entire handler

export async function deleteStudyCommandHandler({ ack, command, client }) {
  await ack();

  // Redirect to Admin Center
  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: ':information_source: `/qori-delete` has moved to the Admin Center.\n\n' +
      'Run `/qori-admin` and select "Delete Study" to continue.\n\n' +
      '_This change ensures all destructive actions are owner-gated and audited._',
  });
}
```

**Option B: Remove command entirely** (cleaner, but more disruptive)

```typescript
// events.ts — REMOVE this line
// app.command('/qori-delete', deleteStudyCommandHandler);
```

**Recommended: Option A** — redirect with explanation. Less disruptive, users learn the new path.

**New handler in Admin Center:**

```typescript
// commands/admin/deleteStudyHandler.ts

export async function adminDeleteStudyHandler({ ack, body, view, client }) {
  await ack();

  const { studyId, studyName, userId } = parseMetadata(view);

  // Gate: OWNER required (changed from creator)
  await assertStudyOwner(userId, studyId);

  // 1. Gather context BEFORE delete (will be gone after)
  const study = await ResearchStudy.findByPk(studyId);
  const project = await Project.findByPk(study.project_id);

  // 2. Gather counts BEFORE delete (will be zero after)
  const counts = await gatherStudyRecordCounts(studyId);

  // 3. Prepare audit entry (don't write yet — outcome unknown)
  const auditEntry = {
    action: 'delete_study' as const,
    record_type: 'study_metadata',
    target_id: studyId,
    target_identifier: studyName,
    project_id: project.id,
    project_name: project.name,
    study_id: studyId,
    study_name: studyName,
    actor_user_id: userId,
    actor_role: 'owner',
    authorization_basis: 'Project owner per ADR 0025',
    records_affected: counts,
  };

  // 4. Execute delete, THEN audit with true outcome
  try {
    await deleteStudyFolderFromGitHub(study.path, process.env.GITHUB_REPO);
    await deleteResearchStudy(studyId, userId);

    // 5. SUCCESS: Log truthful success
    await logDispositionAction({
      ...auditEntry,
      outcome: 'success',
    });

    // 6. Notify user of success
    // ...
  } catch (error) {
    // 7. FAILURE: Log truthful error
    // Note: GitHub delete may have succeeded but DB failed — log partial state
    await logDispositionAction({
      ...auditEntry,
      outcome: 'error',
      outcome_detail: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        'GitHub folder may have been deleted; DB records may remain.',
    });

    // 8. Notify user of failure
    // ...
    throw error;
  }
}
```

### Confirmation Friction (Reuse Existing Pattern)

```typescript
// ui/deleteStudyConfirmModal.ts — Reuse /qori-delete's existing pattern

export function buildDeleteStudyConfirmModal(study, counts): ModalView {
  return {
    type: 'modal',
    callback_id: 'admin-delete-study-confirm',
    title: { type: 'plain_text', text: 'Confirm Deletion' },
    submit: { type: 'plain_text', text: 'Delete Forever' },
    close: { type: 'plain_text', text: 'Cancel' },
    private_metadata: JSON.stringify({ studyId: study.id, studyName: study.name }),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':warning: *You are about to permanently delete:*\n\n' +
            `*Study:* ${study.name}\n` +
            `• ${counts.participants} participants\n` +
            `• ${counts.notes} session notes/transcripts\n` +
            `• ${counts.variables} cascade variables\n`,
        },
      },
      { type: 'divider' },
      {
        type: 'input',
        block_id: 'confirm_checkboxes',
        element: {
          type: 'checkboxes',
          action_id: 'confirm_checks',
          options: [
            {
              text: { type: 'plain_text', text: 'I understand this cannot be undone' },
              value: 'understand',
            },
            {
              text: { type: 'plain_text', text: 'I confirm I am authorized to delete this data' },
              value: 'authorized',
            },
          ],
        },
        label: { type: 'plain_text', text: 'Confirmation' },
      },
      {
        type: 'input',
        block_id: 'confirm_name',
        element: {
          type: 'plain_text_input',
          action_id: 'study_name_input',
          placeholder: { type: 'plain_text', text: `Type "${study.name}" to confirm` },
        },
        label: { type: 'plain_text', text: 'Type study name to confirm' },
      },
    ],
  };
}
```

### Verification

- [ ] DSAR Export works, gated at membership (not owner)
- [ ] DSAR Delete works, gated at OWNER
- [ ] DSAR Delete writes audit BEFORE executing delete
- [ ] Delete Study works, gated at OWNER (not creator)
- [ ] Delete Study writes audit BEFORE executing delete
- [ ] `/qori-delete` redirects to Admin Center (no second ungated route)
- [ ] Confirmation modal requires all checkboxes + typed name
- [ ] Audit log contains complete denormalized info after delete

---

## File Summary

| File | Action | Piece |
|------|--------|-------|
| `backend/src/services/authorization.service.ts` | Modify | 1 |
| `backend/src/__tests__/unit/authorization.service.test.ts` | Modify | 1 |
| `backend/src/database/migrations/XXXXXX-create-disposition-audit-log.js` | Create | 2 |
| `backend/src/database/models/disposition_audit_log.ts` | Create | 2 |
| `backend/src/database/models/index.js` | Modify | 2 |
| `backend/src/services/audit.service.ts` | Create | 2 |
| `backend/src/__tests__/unit/audit.service.test.ts` | Create | 2 |
| `backend/src/helpers/slack/commands/admin/adminCenterHandler.ts` | Create | 3 |
| `backend/src/helpers/slack/ui/adminCenterModal.ts` | Create | 3 |
| `backend/src/helpers/slack/commands/admin/dsarHandler.ts` | Create | 4 |
| `backend/src/helpers/slack/ui/dsarModal.ts` | Create | 4 |
| `backend/src/helpers/slack/commands/admin/deleteStudyHandler.ts` | Create | 4 |
| `backend/src/helpers/slack/ui/deleteStudyConfirmModal.ts` | Create | 4 |
| `backend/src/helpers/slack/commands/study/deleteStudyHandler.ts` | Modify (redirect) | 4 |
| `backend/src/helpers/slack/events.ts` | Modify | 3, 4 |

---

## Verification: Required Integration Tests

**Standard:** Prove-the-property, not checklist assertions. These are bypass-test / survivor-hunt tests that must actually run and pass.

### Pre-Build Verification
- [ ] Owner coverage audit passes (all 6 steps documented above)
- [ ] `isProjectMember()` signature verified via grep

### TEST 1: Owner Gate Bypass Test (REQUIRED)

**Property to prove:** A non-owner CANNOT delete via the actual handler path, and the denial is logged.

```typescript
// backend/src/__tests__/integration/admin-center-owner-gate.test.ts

describe('Admin Center Owner Gate', () => {
  let project: Project;
  let study: ResearchStudy;
  let participant: StudyParticipant;
  let ownerId: string;
  let memberId: string;  // Member but NOT owner

  beforeAll(async () => {
    // Setup: Create project with owner and member
    project = await createTestProject({ created_by: ownerId });
    await ProjectMember.create({ project_id: project.id, user_id: ownerId, role: 'owner', source: 'creator' });
    await ProjectMember.create({ project_id: project.id, user_id: memberId, role: 'member', source: 'explicit' });
    study = await createTestStudy({ project_id: project.id });
    participant = await createTestParticipant({ study_id: study.id });
  });

  it('denies DSAR delete to project member (non-owner)', async () => {
    // Attempt delete via ACTUAL handler (not just assertStudyOwner unit test)
    const result = await callDsarDeleteHandler({
      userId: memberId,  // Member, not owner
      studyId: study.id,
      participantId: participant.id,
    });

    // Verify: deletion denied
    expect(result.success).toBe(false);
    expect(result.error).toContain('only project owners');

    // Verify: participant still exists
    const stillExists = await StudyParticipant.findByPk(participant.id);
    expect(stillExists).not.toBeNull();

    // Verify: denial logged to audit
    const auditEntry = await DispositionAuditLog.findOne({
      where: {
        action: 'delete_participant',
        target_identifier: participant.participant_code,
        outcome: 'denied',
      },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry.actor_user_id).toBe(memberId);
  });

  it('denies study delete to project member (non-owner)', async () => {
    const result = await callDeleteStudyHandler({
      userId: memberId,
      studyId: study.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('only project owners');

    // Study still exists
    const stillExists = await ResearchStudy.findByPk(study.id);
    expect(stillExists).not.toBeNull();

    // Denial logged
    const auditEntry = await DispositionAuditLog.findOne({
      where: {
        action: 'delete_study',
        target_identifier: study.name,
        outcome: 'denied',
      },
    });
    expect(auditEntry).not.toBeNull();
  });
});
```

### TEST 2: Audit Durability Survivor Test (REQUIRED)

**Property to prove:** After deletion, the audit log contains complete, correct, denormalized data that survives the cascade.

```typescript
// backend/src/__tests__/integration/admin-center-audit-durability.test.ts

describe('Audit Log Durability', () => {
  it('audit entry survives study deletion with correct denormalized data', async () => {
    // Setup: Create project, study, participant, variables
    const project = await createTestProject({ name: 'Survivor Test Project' });
    const study = await createTestStudy({
      project_id: project.id,
      name: 'Survivor Test Study',
    });
    const participant = await createTestParticipant({
      study_id: study.id,
      participant_code: 'PT-SURVIVOR',
    });
    await createTestVariables(study.id, participant.participant_code, 5);
    await createTestNotes(study.id, participant.id, 3);

    const ownerId = project.created_by;

    // Execute delete via handler
    await callDeleteStudyHandler({
      userId: ownerId,
      studyId: study.id,
    });

    // Verify: study is gone
    const studyGone = await ResearchStudy.findByPk(study.id);
    expect(studyGone).toBeNull();

    // Verify: audit log entry exists with COMPLETE denormalized data
    const auditEntry = await DispositionAuditLog.findOne({
      where: {
        action: 'delete_study',
        target_id: study.id,  // Was the study ID
      },
    });

    expect(auditEntry).not.toBeNull();

    // FK columns may be NULL now (SET NULL), but denormalized fields survive
    expect(auditEntry.target_identifier).toBe('Survivor Test Study');
    expect(auditEntry.project_name).toBe('Survivor Test Project');
    expect(auditEntry.study_name).toBe('Survivor Test Study');
    expect(auditEntry.outcome).toBe('success');

    // Counts captured before delete
    expect(auditEntry.records_affected).toEqual({
      participants: 1,
      notes: 3,
      variables: 5,
    });
  });

  it('audit entry captures failure correctly when delete throws', async () => {
    // Setup: study that will fail to delete (mock DB error)
    const study = await createTestStudy({ name: 'Will Fail Study' });
    mockDeleteToThrow(study.id, new Error('Simulated DB failure'));

    const ownerId = study.project?.created_by;

    // Execute delete — will fail
    await expect(callDeleteStudyHandler({
      userId: ownerId,
      studyId: study.id,
    })).rejects.toThrow('Simulated DB failure');

    // Verify: study still exists (delete failed)
    const stillExists = await ResearchStudy.findByPk(study.id);
    expect(stillExists).not.toBeNull();

    // Verify: audit log says ERROR, not success
    const auditEntry = await DispositionAuditLog.findOne({
      where: {
        action: 'delete_study',
        target_identifier: 'Will Fail Study',
      },
    });

    expect(auditEntry).not.toBeNull();
    expect(auditEntry.outcome).toBe('error');  // NOT 'success'
    expect(auditEntry.outcome_detail).toContain('Simulated DB failure');
  });
});
```

### TEST 3: One Path Test (REQUIRED)

**Property to prove:** The old `/qori-delete` command no longer deletes — it redirects.

```typescript
// backend/src/__tests__/integration/admin-center-one-path.test.ts

describe('/qori-delete Redirect', () => {
  it('old /qori-delete command redirects to Admin Center, does not delete', async () => {
    const study = await createTestStudy({ name: 'Should Not Be Deleted' });
    const ownerId = study.project?.created_by;

    // Call OLD /qori-delete command handler
    const result = await callOldDeleteStudyCommand({
      userId: ownerId,
      channelId: study.project?.channel_id,
      text: '',
    });

    // Verify: redirect message sent, not deletion modal
    expect(result.messageType).toBe('ephemeral');
    expect(result.text).toContain('/qori-delete has moved');
    expect(result.text).toContain('/qori-admin');

    // Verify: study still exists (no deletion happened)
    const stillExists = await ResearchStudy.findByPk(study.id);
    expect(stillExists).not.toBeNull();

    // Verify: no audit log entry (nothing was attempted)
    const auditEntry = await DispositionAuditLog.findOne({
      where: {
        action: 'delete_study',
        target_identifier: 'Should Not Be Deleted',
      },
    });
    expect(auditEntry).toBeNull();
  });
});
```

### Test File Summary

| Test File | Property Proven |
|-----------|-----------------|
| `admin-center-owner-gate.test.ts` | Non-owner cannot delete; denial logged |
| `admin-center-audit-durability.test.ts` | Audit survives cascade; failure logged truthfully |
| `admin-center-one-path.test.ts` | Old route redirects; no second ungated path |

### Unit Test Checklist (secondary, not sufficient alone)

- [ ] `assertProjectOwner()` unit tests pass
- [ ] `assertStudyOwner()` unit tests pass
- [ ] `logDispositionAction()` unit tests pass
- [ ] `gatherStudyRecordCounts()` unit tests pass

### Manual Verification (if integration tests not yet wired)

- [ ] Owner can delete via Admin Center (happy path)
- [ ] Non-owner sees "Owner-Only" modal
- [ ] `/qori-delete` shows redirect message
- [ ] Audit log has entry after deletion

---

## Deployment Checklist (Slack App Config)

**Before testing:** Register `/qori-admin` in the Slack app configuration. Code-side `app.command()` registration alone won't make Slack route the command.

### Slack Dashboard / Manifest

- [ ] Add `/qori-admin` command in Slack app config (dashboard or manifest.yml)
- [ ] Request URL: same endpoint as existing commands (e.g., `https://<app-url>/slack/events`)
- [ ] Description: "Admin Center - manage DSAR requests, delete studies"
- [ ] Usage hint: (leave empty or "Open from project channel")

**Keep `/qori-delete` registered** — the redirect handler needs Slack to route the command to our app. Do NOT remove it from the Slack config.

### Example manifest.yml addition

```yaml
slash_commands:
  # ... existing commands ...
  - command: /qori-admin
    url: https://your-app.railway.app/slack/events
    description: Admin Center - manage DSAR requests, delete studies
    should_escape: false
```

### Verification

- [ ] `/qori-admin` appears in Slack's command autocomplete
- [ ] Command routes to app (not "command not found")
- [ ] `/qori-delete` still routes (shows redirect message)

---

## Not in Scope (Phase 2-3)

- `disposition_schedules` table
- `checkDispositionEligibility()`
- `legal_holds` table
- `checkLegalHold()`
- `closed_at` column
- "Close Study" action (preview only)
- "Legal Holds" viewer (preview only)

Phase 1 deletion is permissive. Owner can delete. Retention/hold gating is Phase 2-3.

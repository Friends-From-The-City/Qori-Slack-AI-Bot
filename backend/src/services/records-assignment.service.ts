/**
 * Records Assignment Service — GOV-6
 *
 * Manages records-management assignments for canonical records.
 * Handles lifecycle status transitions, retention calculation, and archival.
 */

import { Op, type Sequelize, type Transaction } from 'sequelize';
import type {
  RecordsManagementAssignment,
  AssignableRecordType,
  LifecycleStatus,
} from '../database/models/records_management_assignment';
import type { RecordsSchedule } from '../database/models/records_schedule';
import defaultSequelize from '../database';

// ═══════════════════════════════════════════════════════════
// TEST INJECTION
// ═══════════════════════════════════════════════════════════

let _injectedSequelize: Sequelize | null = null;

export function injectSequelizeForTest(instance: Sequelize): void {
  _injectedSequelize = instance;
}

export function clearInjectedSequelize(): void {
  _injectedSequelize = null;
}

function db(): Sequelize {
  return _injectedSequelize || defaultSequelize;
}

function assignmentModel() {
  return db().models.RecordsManagementAssignment as typeof RecordsManagementAssignment;
}

function scheduleModel() {
  return db().models.RecordsSchedule as typeof RecordsSchedule;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface AssignScheduleInput {
  project_id: number;
  record_type: AssignableRecordType;
  record_public_id: string;
  records_schedule_id?: number;
  schedule_item?: string;
  record_series?: string;
  assigned_by?: string;
}

export interface SetCutoffInput {
  retention_start_at: Date;
  cutoff_at?: Date;
}

// ═══════════════════════════════════════════════════════════
// OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Create a records management assignment for a canonical record.
 * Idempotent on (record_type, record_public_id) — returns existing if found.
 */
export async function assignRecord(input: AssignScheduleInput): Promise<RecordsManagementAssignment> {
  const [assignment] = await assignmentModel().findOrCreate({
    where: {
      record_type: input.record_type,
      record_public_id: input.record_public_id,
    },
    defaults: {
      project_id: input.project_id,
      record_type: input.record_type,
      record_public_id: input.record_public_id,
      records_schedule_id: input.records_schedule_id ?? null,
      schedule_item: input.schedule_item ?? null,
      record_series: input.record_series ?? null,
      assigned_by: input.assigned_by ?? null,
      lifecycle_status: 'active',
    },
  });
  return assignment;
}

/**
 * Attach a schedule to an existing assignment.
 */
export async function attachSchedule(
  assignmentId: number,
  scheduleId: number,
  scheduleItem?: string,
): Promise<void> {
  await assignmentModel().update(
    {
      records_schedule_id: scheduleId,
      schedule_item: scheduleItem ?? null,
      updated_at: new Date(),
    },
    { where: { id: assignmentId } },
  );
}

/**
 * Set retention trigger date and compute eligible_disposition_at.
 * Only computes automatically when BOTH retention_start_at and
 * the schedule's retention_period_days are known.
 */
export async function setRetentionTrigger(
  assignmentId: number,
  input: SetCutoffInput,
  transaction?: Transaction,
): Promise<{ eligible_disposition_at: Date | null }> {
  const assignment = await assignmentModel().findByPk(assignmentId, { transaction });
  if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

  let eligibleAt: Date | null = null;

  if (assignment.records_schedule_id) {
    const schedule = await scheduleModel().findByPk(assignment.records_schedule_id, { transaction });
    if (schedule && schedule.retention_period_days != null) {
      eligibleAt = new Date(input.retention_start_at);
      eligibleAt.setDate(eligibleAt.getDate() + schedule.retention_period_days);
    }
  }

  await assignmentModel().update(
    {
      retention_start_at: input.retention_start_at,
      cutoff_at: input.cutoff_at ?? null,
      eligible_disposition_at: eligibleAt,
      updated_at: new Date(),
    },
    { where: { id: assignmentId }, transaction },
  );

  return { eligible_disposition_at: eligibleAt };
}

/**
 * Update lifecycle status.
 */
export async function updateLifecycleStatus(
  assignmentId: number,
  status: LifecycleStatus,
  transaction?: Transaction,
): Promise<void> {
  await assignmentModel().update(
    { lifecycle_status: status, updated_at: new Date() },
    { where: { id: assignmentId }, transaction },
  );
}

/**
 * Find assignment by canonical record reference.
 */
export async function findByRecord(
  recordType: AssignableRecordType,
  recordPublicId: string,
): Promise<RecordsManagementAssignment | null> {
  return assignmentModel().findOne({
    where: { record_type: recordType, record_public_id: recordPublicId },
  });
}

/**
 * Find all assignments for a project.
 */
export async function findByProject(projectId: number): Promise<RecordsManagementAssignment[]> {
  return assignmentModel().findAll({
    where: { project_id: projectId },
    order: [['assigned_at', 'ASC']],
  });
}

/**
 * Find all assignments with a specific lifecycle status.
 */
export async function findByStatus(
  projectId: number,
  status: LifecycleStatus,
): Promise<RecordsManagementAssignment[]> {
  return assignmentModel().findAll({
    where: { project_id: projectId, lifecycle_status: status },
  });
}

/**
 * Find all disposition-eligible assignments (eligible_disposition_at <= now).
 */
export async function findEligibleForDisposition(
  projectId: number,
): Promise<RecordsManagementAssignment[]> {
  return assignmentModel().findAll({
    where: {
      project_id: projectId,
      eligible_disposition_at: { [Op.lte]: new Date() },
      lifecycle_status: { [Op.notIn]: ['disposed', 'transferred'] },
    },
  });
}

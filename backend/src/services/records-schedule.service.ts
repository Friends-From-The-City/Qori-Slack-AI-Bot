/**
 * Records Schedule Service — GOV-6
 *
 * CRUD for records schedules (NARA GRS, agency-specific, other authority).
 * Qori stores and enforces assigned authority — it does not invent schedules.
 */

import type { Sequelize } from 'sequelize';
import type { RecordsSchedule, AuthorityType, RecordValue, ScheduleDispositionAction } from '../database/models/records_schedule';
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

function scheduleModel() {
  return db().models.RecordsSchedule as typeof RecordsSchedule;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CreateScheduleInput {
  authority_type: AuthorityType;
  authority_code: string;
  title: string;
  description?: string;
  record_value: RecordValue;
  retention_trigger: string;
  retention_period_days?: number;
  disposition_action: ScheduleDispositionAction;
  transfer_instructions?: string;
  effective_date?: string;
  source_url?: string;
}

// ═══════════════════════════════════════════════════════════
// OPERATIONS
// ═══════════════════════════════════════════════════════════

export async function createSchedule(input: CreateScheduleInput): Promise<RecordsSchedule> {
  return scheduleModel().create({
    authority_type: input.authority_type,
    authority_code: input.authority_code,
    title: input.title,
    description: input.description ?? null,
    record_value: input.record_value,
    retention_trigger: input.retention_trigger,
    retention_period_days: input.retention_period_days ?? null,
    disposition_action: input.disposition_action,
    transfer_instructions: input.transfer_instructions ?? null,
    effective_date: input.effective_date ?? null,
    superseded_date: null,
    source_url: input.source_url ?? null,
  });
}

export async function findScheduleByPublicId(publicId: string): Promise<RecordsSchedule | null> {
  return scheduleModel().findOne({ where: { public_id: publicId } });
}

export async function findScheduleById(id: number): Promise<RecordsSchedule | null> {
  return scheduleModel().findByPk(id);
}

/**
 * Mark a schedule as superseded. Does not delete — records that reference
 * this schedule retain their assignment history.
 */
export async function supersedeSchedule(id: number, supersededDate: string): Promise<void> {
  await scheduleModel().update(
    { superseded_date: supersededDate },
    { where: { id } },
  );
}

/**
 * Check whether a schedule is currently active (not superseded).
 */
export function isScheduleActive(schedule: RecordsSchedule): boolean {
  if (!schedule.superseded_date) return true;
  return new Date(schedule.superseded_date) > new Date();
}

/**
 * Audit Service
 *
 * Per ADR 0025: Every disposition action is logged for NARA compliance.
 *
 * CRITICAL ORDERING:
 * - Gather context + counts into variables BEFORE delete
 * - Execute delete
 * - Log with true outcome (success | error) using pre-gathered variables
 *
 * The audit log must never:
 * - Claim a deletion happened when it didn't (false positive)
 * - Re-query for context after delete destroyed it (empty log)
 */

import type { AuditAction, AuditOutcome, DispositionAuditLog } from '../database/models/disposition_audit_log';
import sequelize from '../database';

const DispositionAuditLogModel = sequelize.models.DispositionAuditLog as typeof DispositionAuditLog;
const StudyParticipantModel = sequelize.models.StudyParticipant;
const StudyNotesModel = sequelize.models.StudyNotes;
const StudyVariableModel = sequelize.models.StudyVariable;
const SessionObserverModel = sequelize.models.SessionObserver;

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface AuditEntry {
  action: AuditAction;
  record_type: string;
  target_id?: number;
  target_identifier: string; // REQUIRED — durable ID

  // Context (denormalized for durability — captured BEFORE delete)
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

// ═══════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Log a disposition action.
 *
 * CRITICAL: Call this AFTER the delete operation, with outcome reflecting
 * what actually happened (success | error | denied). Use pre-gathered
 * context variables — do NOT re-query the database.
 *
 * Always logs, whether action succeeded or was denied/errored.
 */
export async function logDispositionAction(entry: AuditEntry): Promise<DispositionAuditLog> {
  const logEntry = await DispositionAuditLogModel.create({
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

  // Console log for observability
  const outcomeEmoji = entry.outcome === 'success' ? '✓' : entry.outcome === 'denied' ? '⊘' : '✗';
  console.log(
    `[AUDIT] ${outcomeEmoji} ${entry.action} ${entry.outcome}: ` +
      `${entry.record_type} "${entry.target_identifier}" ` +
      `by ${entry.actor_user_id} (${entry.actor_role ?? 'unknown'}) — ` +
      `${entry.authorization_basis}`,
  );

  return logEntry;
}

// ═══════════════════════════════════════════════════════════════════════
// CONTEXT GATHERING (call BEFORE delete)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Gather record counts for a study BEFORE deletion.
 * Returns counts suitable for records_affected field.
 *
 * CALL THIS BEFORE DELETE — after delete, counts will be zero.
 */
export async function gatherStudyRecordCounts(studyId: number): Promise<Record<string, number>> {
  const [participants, notes, variables] = await Promise.all([
    StudyParticipantModel.count({ where: { study_id: studyId } }),
    StudyNotesModel.count({ where: { study_id: studyId } }),
    StudyVariableModel.count({ where: { study_id: studyId } }),
  ]);

  return {
    participants,
    notes,
    variables,
  };
}

/**
 * Gather record counts for a participant BEFORE deletion.
 *
 * CALL THIS BEFORE DELETE — after delete, counts will be zero.
 *
 * @param participantId - Database ID of participant
 * @param studyId - Study ID (for variable lookup)
 * @param participantCode - Participant code (e.g., 'PT-007') for variable lookup
 */
export async function gatherParticipantRecordCounts(
  participantId: number,
  studyId: number,
  participantCode: string,
): Promise<Record<string, number>> {
  const [notes, observers, variables] = await Promise.all([
    StudyNotesModel.count({ where: { participant_id: participantId } }),
    SessionObserverModel.count({ where: { participant_id: participantId } }),
    StudyVariableModel.count({
      where: { study_id: studyId, participant_id: participantCode },
    }),
  ]);

  return {
    notes,
    observers,
    variables,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get recent audit log entries for a project.
 */
export async function getAuditLogForProject(
  projectId: number,
  options: { limit?: number } = {},
): Promise<DispositionAuditLog[]> {
  return DispositionAuditLogModel.findAll({
    where: { project_id: projectId },
    order: [['occurred_at', 'DESC']],
    limit: options.limit ?? 50,
  });
}

/**
 * Get recent audit log entries for a study.
 */
export async function getAuditLogForStudy(
  studyId: number,
  options: { limit?: number } = {},
): Promise<DispositionAuditLog[]> {
  return DispositionAuditLogModel.findAll({
    where: { study_id: studyId },
    order: [['occurred_at', 'DESC']],
    limit: options.limit ?? 50,
  });
}

/**
 * Get audit log entries by actor.
 */
export async function getAuditLogByActor(
  actorUserId: string,
  options: { limit?: number } = {},
): Promise<DispositionAuditLog[]> {
  return DispositionAuditLogModel.findAll({
    where: { actor_user_id: actorUserId },
    order: [['occurred_at', 'DESC']],
    limit: options.limit ?? 50,
  });
}

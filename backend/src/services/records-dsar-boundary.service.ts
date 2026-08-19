/**
 * Records-DSAR Boundary Service — GOV-6 § 13
 *
 * Defines the policy decision boundary between DSAR/privacy obligations
 * and records-retention authority.
 *
 * DSAR request → canonical subject traversal → records/hold check
 * → disposition/privacy decision → execute permitted action
 *   OR return GOVERNANCE_REVIEW_REQUIRED
 *
 * Does NOT invent legal precedence. If both obligations appear to apply:
 * → GOVERNANCE_REVIEW_REQUIRED
 *
 * Preserves audit metadata without exposing PII.
 */

import type { Sequelize } from 'sequelize';
import { computeEffectiveHold } from './records-hold.service';
import { findByRecord } from './records-assignment.service';
import type { AssignableRecordType } from '../database/models/records_management_assignment';
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

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type DSARRecordsDecision =
  | 'PERMIT'                     // No records obligations conflict — DSAR may proceed
  | 'GOVERNANCE_REVIEW_REQUIRED' // Both obligations apply — human review needed
  | 'BLOCKED_BY_HOLD';           // Active hold blocks any data modification

export interface DSARRecordsCheck {
  decision: DSARRecordsDecision;
  reasons: string[];
  has_records_assignment: boolean;
  has_active_hold: boolean;
  lifecycle_status: string | null;
}

// ═══════════════════════════════════════════════════════════
// BOUNDARY CHECK
// ═══════════════════════════════════════════════════════════

/**
 * Check whether a DSAR deletion may proceed for a specific record.
 *
 * Decision tree:
 * 1. Active hold on this record → BLOCKED_BY_HOLD
 * 2. Records schedule assigned AND record is NOT disposition-eligible → GOVERNANCE_REVIEW_REQUIRED
 *    (records retention authority may override DSAR deletion)
 * 3. No schedule assigned OR record is already disposed → PERMIT
 * 4. Records assignment exists with active/inactive status → GOVERNANCE_REVIEW_REQUIRED
 *
 * This function does NOT execute any deletion.
 */
export async function checkDSARRecordsConflict(
  projectId: number,
  recordType: AssignableRecordType,
  recordPublicId: string,
): Promise<DSARRecordsCheck> {
  const reasons: string[] = [];

  // 1. Check effective hold
  const holdResult = await computeEffectiveHold(projectId, recordType, recordPublicId);

  if (holdResult.effective_hold) {
    return {
      decision: 'BLOCKED_BY_HOLD',
      reasons: [
        'Active preservation hold blocks DSAR data modification',
        ...holdResult.reasons,
      ],
      has_records_assignment: false, // not checked — hold alone is blocking
      has_active_hold: true,
      lifecycle_status: null,
    };
  }

  // 2. Check records assignment
  const assignment = await findByRecord(recordType, recordPublicId);

  if (!assignment) {
    // No records management — DSAR may proceed freely
    return {
      decision: 'PERMIT',
      reasons: ['No records management assignment — DSAR may proceed'],
      has_records_assignment: false,
      has_active_hold: false,
      lifecycle_status: null,
    };
  }

  // Already disposed — no conflict
  if (assignment.lifecycle_status === 'disposed' || assignment.lifecycle_status === 'transferred') {
    return {
      decision: 'PERMIT',
      reasons: [`Record already ${assignment.lifecycle_status} — DSAR may proceed`],
      has_records_assignment: true,
      has_active_hold: false,
      lifecycle_status: assignment.lifecycle_status,
    };
  }

  // Records schedule assigned — potential conflict
  if (assignment.records_schedule_id) {
    return {
      decision: 'GOVERNANCE_REVIEW_REQUIRED',
      reasons: [
        'Record has an active records schedule assignment',
        'DSAR deletion may conflict with records retention authority',
        'A records officer must determine whether DSAR obligation or retention authority takes precedence',
      ],
      has_records_assignment: true,
      has_active_hold: false,
      lifecycle_status: assignment.lifecycle_status,
    };
  }

  // Assignment exists but no schedule — still flag for review
  // since the record is under records management
  if (assignment.lifecycle_status === 'active' || assignment.lifecycle_status === 'inactive') {
    return {
      decision: 'GOVERNANCE_REVIEW_REQUIRED',
      reasons: [
        'Record is under records management (no schedule assigned yet)',
        'A records officer should review before DSAR deletion proceeds',
      ],
      has_records_assignment: true,
      has_active_hold: false,
      lifecycle_status: assignment.lifecycle_status,
    };
  }

  // Default: permit
  return {
    decision: 'PERMIT',
    reasons: ['No records conflict detected'],
    has_records_assignment: true,
    has_active_hold: false,
    lifecycle_status: assignment.lifecycle_status,
  };
}

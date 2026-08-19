/**
 * Disposition Service — GOV-6
 *
 * Fail-closed disposition eligibility evaluation and controlled execution.
 *
 * A record may be eligible for disposition only when ALL conditions are met:
 * - records schedule assigned
 * - schedule authority active/not superseded
 * - record is temporary OR disposition action explicitly permits
 * - retention trigger known
 * - eligible_disposition_at <= now
 * - no active effective hold
 * - record not already disposed/transferred
 * - disposition action matches schedule
 *
 * Disposition execution for this slice: controlled transaction for eligible
 * TEMPORARY records only. Does NOT hard-delete — creates immutable event
 * and tombstones the assignment.
 */

import type { Sequelize, Transaction } from 'sequelize';
import type { RecordsManagementAssignment, AssignableRecordType } from '../database/models/records_management_assignment';
import type { RecordsSchedule } from '../database/models/records_schedule';
import type { RecordsDispositionEvent, DispositionEventAction, DispositionEventOutcome } from '../database/models/records_disposition_event';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import type { ResearchArtifact } from '../database/models/research_artifact';
import { computeEffectiveHold } from './records-hold.service';
import { isScheduleActive, findScheduleById } from './records-schedule.service';
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

function eventModel() {
  return db().models.RecordsDispositionEvent as typeof RecordsDispositionEvent;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type IneligibilityReason =
  | 'NO_SCHEDULE'
  | 'SCHEDULE_SUPERSEDED'
  | 'NO_CUTOFF'
  | 'NOT_YET_ELIGIBLE'
  | 'ACTIVE_HOLD'
  | 'PERMANENT_RECORD'
  | 'TRANSFER_REQUIRED'
  | 'ALREADY_DISPOSED'
  | 'AUTH_DENIED';

export interface EligibilityResult {
  eligible: boolean;
  reasons: IneligibilityReason[];
  details: string[];
  assignment: RecordsManagementAssignment;
  schedule: RecordsSchedule | null;
}

export interface DispositionResult {
  outcome: DispositionEventOutcome;
  event_public_id: string | null;
  reasons: string[];
}

// ═══════════════════════════════════════════════════════════
// ELIGIBILITY (fail-closed)
// ═══════════════════════════════════════════════════════════

/**
 * Evaluate disposition eligibility for a records assignment.
 * Fail-closed: any missing data → ineligible.
 */
export async function evaluateEligibility(
  assignmentId: number,
): Promise<EligibilityResult> {
  const assignment = await assignmentModel().findByPk(assignmentId);
  if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

  const reasons: IneligibilityReason[] = [];
  const details: string[] = [];

  // 1. Already disposed?
  if (assignment.lifecycle_status === 'disposed' || assignment.lifecycle_status === 'transferred') {
    reasons.push('ALREADY_DISPOSED');
    details.push(`Record already ${assignment.lifecycle_status}`);
    return { eligible: false, reasons, details, assignment, schedule: null };
  }

  // 2. Schedule assigned?
  if (!assignment.records_schedule_id) {
    reasons.push('NO_SCHEDULE');
    details.push('No records schedule assigned');
    return { eligible: false, reasons, details, assignment, schedule: null };
  }

  const schedule = await findScheduleById(assignment.records_schedule_id);
  if (!schedule) {
    reasons.push('NO_SCHEDULE');
    details.push('Assigned schedule not found');
    return { eligible: false, reasons, details, assignment, schedule: null };
  }

  // 3. Schedule active?
  if (!isScheduleActive(schedule)) {
    reasons.push('SCHEDULE_SUPERSEDED');
    details.push(`Schedule superseded on ${schedule.superseded_date}`);
  }

  // 4. Permanent record?
  if (schedule.record_value === 'permanent') {
    if (schedule.disposition_action === 'transfer') {
      reasons.push('TRANSFER_REQUIRED');
      details.push('Permanent record requires transfer, not destruction');
    } else {
      reasons.push('PERMANENT_RECORD');
      details.push('Permanent records cannot be destroyed');
    }
  }

  // 5. Transfer required?
  if (schedule.disposition_action === 'transfer' && schedule.record_value === 'temporary') {
    reasons.push('TRANSFER_REQUIRED');
    details.push('Schedule requires transfer disposition');
  }

  // 6. Retention trigger known?
  if (!assignment.retention_start_at) {
    reasons.push('NO_CUTOFF');
    details.push('Retention start date not set');
  }

  // 7. Eligible date reached?
  if (assignment.eligible_disposition_at) {
    if (new Date(assignment.eligible_disposition_at) > new Date()) {
      reasons.push('NOT_YET_ELIGIBLE');
      details.push(`Not eligible until ${assignment.eligible_disposition_at}`);
    }
  } else {
    reasons.push('NO_CUTOFF');
    details.push('Eligible disposition date not computed');
  }

  // 8. Effective hold?
  const holdResult = await computeEffectiveHold(
    assignment.project_id,
    assignment.record_type,
    assignment.record_public_id,
  );
  if (holdResult.effective_hold) {
    reasons.push('ACTIVE_HOLD');
    details.push(...holdResult.reasons);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    details,
    assignment,
    schedule,
  };
}

// ═══════════════════════════════════════════════════════════
// EXECUTION (controlled disposition for temporary records)
// ═══════════════════════════════════════════════════════════

/**
 * Execute disposition for an eligible record.
 *
 * For this slice:
 * - Creates an immutable disposition event
 * - Tombstones the assignment (lifecycle_status → 'disposed')
 * - Does NOT hard-delete canonical rows
 * - Records with disposition_action='review' → manual_review_required
 *
 * @param assignmentId - Records management assignment ID
 * @param actor - Slack user ID of the authorized actor
 * @param isOwnerOrAdmin - Whether the actor has owner/admin role
 */
export async function executeDisposition(
  assignmentId: number,
  actor: string,
  isOwnerOrAdmin: boolean,
): Promise<DispositionResult> {
  // Authorization gate
  if (!isOwnerOrAdmin) {
    await createEvent(assignmentId, {
      action: 'destroy',
      authority_code: 'unknown',
      outcome: 'blocked',
      actor,
      details: { reason: 'AUTH_DENIED' },
    });
    return {
      outcome: 'blocked',
      event_public_id: null,
      reasons: ['AUTH_DENIED: Destructive disposition requires owner/admin role'],
    };
  }

  // Evaluate eligibility
  const eligibility = await evaluateEligibility(assignmentId);

  if (!eligibility.eligible) {
    const event = await createEvent(assignmentId, {
      action: eligibility.schedule?.disposition_action === 'transfer' ? 'transfer' : 'destroy',
      authority_code: eligibility.schedule?.authority_code ?? 'none',
      schedule_item: eligibility.assignment.schedule_item,
      outcome: 'blocked',
      actor,
      details: { reasons: eligibility.reasons },
    });
    return {
      outcome: 'blocked',
      event_public_id: event.public_id,
      reasons: eligibility.details,
    };
  }

  const schedule = eligibility.schedule!;
  const assignment = eligibility.assignment;

  // Disposition action routing
  if (schedule.disposition_action === 'review') {
    const event = await createEvent(assignmentId, {
      action: 'destroy',
      authority_code: schedule.authority_code,
      schedule_item: assignment.schedule_item,
      outcome: 'manual_review_required',
      actor,
      details: { reason: 'Schedule requires records officer review before disposition' },
    });
    return {
      outcome: 'manual_review_required',
      event_public_id: event.public_id,
      reasons: ['Schedule requires records officer review before disposition'],
    };
  }

  if (schedule.disposition_action === 'transfer') {
    const event = await createEvent(assignmentId, {
      action: 'transfer',
      authority_code: schedule.authority_code,
      schedule_item: assignment.schedule_item,
      outcome: 'manual_review_required',
      actor,
      details: {
        reason: 'Transfer disposition requires manual records officer action',
        transfer_instructions: schedule.transfer_instructions,
      },
    });

    // Update status to reflect transfer-pending
    await assignmentModel().update(
      { lifecycle_status: 'disposition_eligible', updated_at: new Date() },
      { where: { id: assignmentId } },
    );

    return {
      outcome: 'manual_review_required',
      event_public_id: event.public_id,
      reasons: ['Transfer disposition requires manual records officer action'],
    };
  }

  // Destroy action — route through record-type adapter
  const adapter = DISPOSITION_ADAPTERS[assignment.record_type];

  if (!adapter) {
    // No safe adapter exists for this record type
    const event = await createEvent(assignmentId, {
      action: 'destroy',
      authority_code: schedule.authority_code,
      schedule_item: assignment.schedule_item,
      outcome: 'manual_review_required',
      actor,
      details: {
        reason: `No automated disposition adapter for record type '${assignment.record_type}'`,
        record_type: assignment.record_type,
        record_public_id: assignment.record_public_id,
      },
    });
    return {
      outcome: 'manual_review_required',
      event_public_id: event.public_id,
      reasons: [`No automated disposition adapter for record type '${assignment.record_type}' — manual review required`],
    };
  }

  return db().transaction(async (t: Transaction) => {
    // Execute content suppression via adapter
    const suppression = await adapter(assignment.record_public_id, t);

    const event = await createEvent(
      assignmentId,
      {
        action: 'destroy',
        authority_code: schedule.authority_code,
        schedule_item: assignment.schedule_item,
        outcome: 'completed',
        actor,
        details: {
          record_type: assignment.record_type,
          record_public_id: assignment.record_public_id,
          schedule_title: schedule.title,
          suppressed_fields: suppression.suppressed_fields,
        },
      },
      t,
    );

    await assignmentModel().update(
      { lifecycle_status: 'disposed', updated_at: new Date() },
      { where: { id: assignmentId }, transaction: t },
    );

    return {
      outcome: 'completed' as DispositionEventOutcome,
      event_public_id: event.public_id,
      reasons: [],
    };
  });
}

// ═══════════════════════════════════════════════════════════
// RECORD-TYPE DISPOSITION ADAPTERS
// ═══════════════════════════════════════════════════════════

/**
 * Suppression result returned by each adapter.
 */
interface SuppressionResult {
  suppressed_fields: string[];
}

/**
 * Adapter signature: receives the record's public_id and a transaction,
 * NULLs/clears the destroyable content columns, returns which fields
 * were suppressed. Preserves structural/identity/audit metadata.
 */
type DispositionAdapter = (
  recordPublicId: string,
  transaction: Transaction,
) => Promise<SuppressionResult>;

/**
 * evidence_construct adapter:
 * Suppresses `label` and `payload` (the governed research content).
 * Preserves: public_id, project_id, study_id, construct_type, derivation_type,
 * derivation_context, status, cascade_variable_key, created_by, timestamps.
 */
async function suppressEvidenceConstruct(
  recordPublicId: string,
  transaction: Transaction,
): Promise<SuppressionResult> {
  const Model = db().models.EvidenceConstruct as typeof EvidenceConstruct;
  await Model.update(
    { label: null, payload: null },
    { where: { public_id: recordPublicId }, transaction },
  );
  return { suppressed_fields: ['label', 'payload'] };
}

/**
 * research_artifact adapter:
 * Suppresses `title`, `path`, and `url` (display title and mutable location).
 * Preserves: public_id, project_id, study_id, template_id, template_version,
 * artifact_type, repo, ref, commit_sha, semantic_key, status, created_by, timestamps.
 */
async function suppressResearchArtifact(
  recordPublicId: string,
  transaction: Transaction,
): Promise<SuppressionResult> {
  const Model = db().models.ResearchArtifact as typeof ResearchArtifact;
  await Model.update(
    { title: null, path: null, url: null },
    { where: { public_id: recordPublicId }, transaction },
  );
  return { suppressed_fields: ['title', 'path', 'url'] };
}

/**
 * Registry of record types with safe automated content suppression.
 *
 * Supported (safe to suppress content without breaking FK/semantic integrity):
 * - evidence_construct: NULL label + payload; FK children reference IDs only
 * - research_artifact: NULL title + path + url; FK children reference IDs only
 *
 * NOT supported (→ manual_review_required):
 * - project: name/slug are routing keys; destroying content orphans child studies
 * - study: name used in display paths; destroying content orphans participants/evidence
 * - evidence_source: NOT NULL FK children in survey tables would break on content suppression
 */
const DISPOSITION_ADAPTERS: Partial<Record<AssignableRecordType, DispositionAdapter>> = {
  evidence_construct: suppressEvidenceConstruct,
  research_artifact: suppressResearchArtifact,
};

// ═══════════════════════════════════════════════════════════
// EVENT CREATION (append-only)
// ═══════════════════════════════════════════════════════════

interface CreateEventInput {
  action: DispositionEventAction;
  authority_code: string;
  schedule_item?: string | null;
  outcome: DispositionEventOutcome;
  actor: string;
  details: Record<string, unknown>;
}

async function createEvent(
  assignmentId: number,
  input: CreateEventInput,
  transaction?: Transaction,
): Promise<RecordsDispositionEvent> {
  return eventModel().create(
    {
      assignment_id: assignmentId,
      action: input.action,
      authority_code: input.authority_code,
      schedule_item: input.schedule_item ?? null,
      outcome: input.outcome,
      actor: input.actor,
      details: input.details,
    },
    { transaction },
  );
}

/**
 * Find all disposition events for an assignment.
 */
export async function findEventsByAssignment(assignmentId: number): Promise<RecordsDispositionEvent[]> {
  return eventModel().findAll({
    where: { assignment_id: assignmentId },
    order: [['executed_at', 'ASC']],
  });
}

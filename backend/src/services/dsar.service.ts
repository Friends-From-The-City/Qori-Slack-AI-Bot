/**
 * DSAR (Data Subject Access Request) Service
 *
 * Provides export and deletion of participant data for GDPR/privacy compliance.
 *
 * H7 REMEDIATION:
 * - exportParticipantData(): Assembles all participant data across stores
 * - deleteParticipantDSAR(): Cascade-complete deletion of all participant data
 *
 * KNOWN LIMITATION (documented, not built):
 * - GitHub artifacts (tracker YAML, rendered docs) are NOT deleted
 * - Residual GitHub data requires manual cleanup by study owner
 * - See docs/data-retention.md for full records-management posture
 *
 * INTERIM IMPLEMENTATION NOTE:
 * - study_variables.participant_id is STRING, not FK
 * - Manual DELETE WHERE participant_id='PT-XXX' is used (Option A)
 * - FK conversion tracked in GitHub issue for future (Option B)
 */

import type { StudyParticipant } from '../database/models/study_participant';
import type { StudyNotes } from '../database/models/study_notes';
import type { SessionObserver } from '../database/models/session_observer';
import type { Transaction, Sequelize } from 'sequelize';
import type { WebClient } from '@slack/web-api';

import defaultSequelize from '../database';
import { assertStudyAccess, AuthorizationError } from './authorization.service';

// ═══════════════════════════════════════════════════════════
// TEST INJECTION (for integration tests)
// ═══════════════════════════════════════════════════════════

let _injectedSequelize: Sequelize | null = null;

/**
 * Inject a Sequelize instance for integration tests.
 */
export function injectSequelizeForTest(instance: Sequelize): void {
  _injectedSequelize = instance;
}

/**
 * Clear the injected Sequelize instance after tests.
 */
export function clearInjectedSequelize(): void {
  _injectedSequelize = null;
}

function getSequelize(): Sequelize {
  return _injectedSequelize || defaultSequelize;
}

// Model getters (use injected sequelize for tests)
function getStudyParticipantModel() {
  return getSequelize().models.StudyParticipant as typeof StudyParticipant;
}
function getStudyNotesModel() {
  return getSequelize().models.StudyNotes as typeof StudyNotes;
}
function getSessionObserverModel() {
  return getSequelize().models.SessionObserver as typeof SessionObserver;
}
function getStudyVariableModel() {
  return getSequelize().models.StudyVariable;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ParticipantExport {
  export_date: string;
  participant_code: string;
  study_id: number;
  known_limitation: string;

  /** Core participant record */
  participant_record: {
    id: number;
    participant_code: string;
    participant_name: string | null;
    recruitment_source: string | null;
    scheduled_date: Date | null;
    scheduled_time: string | null;
    status_select: string | null;
    notes_field: string | null;
    demographics_info: Record<string, unknown> | null;
    compensation_amount: number | null;
    outreach_sent_at: Date | null;
    outreach_method: string | null;
    outreach_count: number;
    added_by: string;
    created_at: Date;
    updated_at: Date;
  } | null;

  /** Session notes/transcripts linked to this participant */
  notes: Array<{
    id: number;
    filename: string;
    file_path: string | null;
    file_url: string | null;
    transcript: boolean;
    session_date: Date | null;
    session_time: string | null;
    created_at: Date;
    created_by: string;
  }>;

  /** Observer records for sessions with this participant */
  observer_records: Array<{
    id: number;
    session_id: string;
    requester_id: string[];
    requester_name: string[];
    role: string;
    reason: string | null;
    status: string;
    created_at: Date;
  }>;

  /** Cascade variables (nuggets, session summaries) linked to this participant */
  variables: Array<{
    id: number;
    variable_key: string;
    variable_type: string | null;
    item_key: string | null;
    value: unknown;
    source_template: string;
    source_version: string | null;
    source_date: Date | null;
    confidence: string | null;
    extracted_at: Date;
  }>;

  /** Summary counts */
  summary: {
    notes_count: number;
    observer_records_count: number;
    variables_count: number;
  };
}

export interface DeleteResult {
  success: boolean;
  participant_code: string;
  study_id: number;
  deleted_counts: {
    participant_record: number;
    notes: number;
    observer_records: number;
    variables: number;
  };
  known_limitation: string;
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

/**
 * Export all data for a participant across all stores.
 *
 * Assembles:
 * - study_participants row (core record)
 * - study_notes rows (session transcripts)
 * - session_observers rows (observer records)
 * - study_variables rows (nuggets, quotes, session data)
 *
 * @param participantId - Database ID of the participant
 * @param userId - Slack user ID of the requester (for authorization)
 * @param slackClient - Optional Slack client for channel membership check
 * @throws AuthorizationError if user lacks access
 */
export async function exportParticipantData(
  participantId: number,
  userId: string,
  slackClient?: WebClient,
): Promise<ParticipantExport> {
  // 1. Load participant to get study_id and participant_code
  const participant = await getStudyParticipantModel().findByPk(participantId);
  if (!participant) {
    throw new Error('Participant not found');
  }

  // 2. Authorization check
  await assertStudyAccess(userId, participant.study_id, slackClient);

  const participantCode = participant.participant_code;

  // 3. Gather all data in parallel
  const [notes, observers, variables] = await Promise.all([
    // Notes linked to this participant
    getStudyNotesModel().findAll({
      where: { participant_id: participantId },
      order: [['created_at', 'DESC']],
    }),

    // Observer records for this participant's sessions
    getSessionObserverModel().findAll({
      where: { participant_id: participantId },
      order: [['created_at', 'DESC']],
    }),

    // Variables (nuggets, session data) scoped to this participant
    getStudyVariableModel().findAll({
      where: {
        study_id: participant.study_id,
        participant_id: participantCode,  // STRING match, not FK
      },
      order: [['extracted_at', 'DESC']],
    }),
  ]);

  // 4. Assemble export
  return {
    export_date: new Date().toISOString(),
    participant_code: participantCode,
    study_id: participant.study_id,
    known_limitation: 'GitHub artifacts (tracker YAML, rendered docs) are not included. See docs/data-retention.md.',

    participant_record: {
      id: participant.id,
      participant_code: participant.participant_code,
      participant_name: participant.participant_name,
      recruitment_source: participant.recruitment_source,
      scheduled_date: participant.scheduled_date,
      scheduled_time: participant.scheduled_time,
      status_select: participant.status_select,
      notes_field: participant.notes_field,
      demographics_info: participant.demographics_info,
      compensation_amount: participant.compensation_amount,
      outreach_sent_at: participant.outreach_sent_at,
      outreach_method: participant.outreach_method,
      outreach_count: participant.outreach_count,
      added_by: participant.added_by,
      created_at: participant.created_at,
      updated_at: participant.updated_at,
    },

    notes: notes.map(n => ({
      id: n.id,
      filename: n.filename,
      file_path: n.file_path,
      file_url: n.file_url,
      transcript: n.transcript,
      session_date: n.session_date,
      session_time: n.session_time,
      created_at: n.created_at,
      created_by: n.created_by,
    })),

    observer_records: observers.map(o => ({
      id: o.id,
      session_id: o.session_id,
      requester_id: o.requester_id,
      requester_name: o.requester_name,
      role: o.role,
      reason: o.reason,
      status: o.status,
      created_at: o.created_at,
    })),

    variables: variables.map(v => {
      const row = v as unknown as {
        id: number;
        variable_key: string;
        variable_type: string | null;
        item_key: string | null;
        value: unknown;
        source_template: string;
        source_version: string | null;
        source_date: Date | null;
        confidence: string | null;
        extracted_at: Date;
      };
      return {
        id: row.id,
        variable_key: row.variable_key,
        variable_type: row.variable_type,
        item_key: row.item_key,
        value: row.value,
        source_template: row.source_template,
        source_version: row.source_version,
        source_date: row.source_date,
        confidence: row.confidence,
        extracted_at: row.extracted_at,
      };
    }),

    summary: {
      notes_count: notes.length,
      observer_records_count: observers.length,
      variables_count: variables.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════
// DELETE (DSAR)
// ═══════════════════════════════════════════════════════════

/**
 * Delete all data for a participant (DSAR deletion request).
 *
 * This is a CASCADE-COMPLETE deletion that removes:
 * - study_participants row (triggers CASCADE for session_observers)
 * - study_notes rows (explicit delete, FK is SET NULL not CASCADE)
 * - study_variables rows (manual delete, participant_id is STRING not FK)
 *
 * KNOWN LIMITATION:
 * - GitHub artifacts are NOT deleted (documented residual)
 * - Manual cleanup required for tracker YAML and rendered docs
 *
 * SECURITY:
 * - Gated with assertStudyAccess
 * - Runs in transaction for atomicity
 *
 * @param participantId - Database ID of the participant
 * @param userId - Slack user ID of the requester (for authorization)
 * @param slackClient - Optional Slack client for channel membership check
 * @throws AuthorizationError if user lacks access
 */
export async function deleteParticipantDSAR(
  participantId: number,
  userId: string,
  slackClient?: WebClient,
): Promise<DeleteResult> {
  // 1. Load participant to get study_id and participant_code
  const participant = await getStudyParticipantModel().findByPk(participantId);
  if (!participant) {
    throw new Error('Participant not found');
  }

  // 2. Authorization check
  await assertStudyAccess(userId, participant.study_id, slackClient);

  const studyId = participant.study_id;
  const participantCode = participant.participant_code;

  // 3. Execute deletion in transaction
  const deletedCounts = await getSequelize().transaction(async (t: Transaction) => {
    // A. Delete study_variables (manual, STRING field, no FK cascade)
    // This is the PII-richest data: verbatim quotes, behavioral nuggets
    const variablesDeleted = await getStudyVariableModel().destroy({
      where: {
        study_id: studyId,
        participant_id: participantCode,  // STRING match
      },
      transaction: t,
    });

    // B. Delete study_notes (explicit, FK is SET NULL not CASCADE)
    // Contains session transcripts
    const notesDeleted = await getStudyNotesModel().destroy({
      where: { participant_id: participantId },
      transaction: t,
    });

    // C. Delete study_participants row
    // This triggers CASCADE delete for session_observers (FK is CASCADE)
    const observerCountBefore = await getSessionObserverModel().count({
      where: { participant_id: participantId },
      transaction: t,
    });

    await participant.destroy({ transaction: t });

    return {
      participant_record: 1,
      notes: notesDeleted,
      observer_records: observerCountBefore,  // Cascaded by FK
      variables: variablesDeleted,
    };
  });

  console.log(
    `[DSAR] Deleted participant ${participantCode} from study ${studyId}: ` +
    `${deletedCounts.variables} variables, ${deletedCounts.notes} notes, ` +
    `${deletedCounts.observer_records} observer records`
  );

  return {
    success: true,
    participant_code: participantCode,
    study_id: studyId,
    deleted_counts: deletedCounts,
    known_limitation: 'GitHub artifacts (tracker YAML, rendered docs) require manual cleanup. See docs/data-retention.md.',
  };
}

// ═══════════════════════════════════════════════════════════
// VERIFICATION HELPERS (for integration tests)
// ═══════════════════════════════════════════════════════════

/**
 * Check if any data remains for a participant code.
 * Used by integration tests to verify complete deletion.
 *
 * @param studyId - Study database ID
 * @param participantCode - Participant code (e.g., 'PT-001')
 * @param participantId - Original participant database ID
 * @returns Object with survivor counts per store
 */
export async function findParticipantSurvivors(
  studyId: number,
  participantCode: string,
  participantId: number,
): Promise<{
  study_participants: number;
  study_notes: number;
  session_observers: number;
  study_variables: number;
  total: number;
}> {
  const [participantCount, notesCount, observersCount, variablesCount] = await Promise.all([
    getStudyParticipantModel().count({ where: { id: participantId } }),
    getStudyNotesModel().count({ where: { participant_id: participantId } }),
    getSessionObserverModel().count({ where: { participant_id: participantId } }),
    getStudyVariableModel().count({
      where: {
        study_id: studyId,
        participant_id: participantCode,
      },
    }),
  ]);

  return {
    study_participants: participantCount,
    study_notes: notesCount,
    session_observers: observersCount,
    study_variables: variablesCount,
    total: participantCount + notesCount + observersCount + variablesCount,
  };
}

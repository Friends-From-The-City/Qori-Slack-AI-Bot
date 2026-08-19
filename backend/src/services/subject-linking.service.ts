/**
 * Subject Linking Service (GOV-2A2)
 *
 * Maintains the canonical subject-link foundation for DSAR operations.
 * All operations derive scope from persisted DB state — never from
 * caller-supplied project/study IDs.
 *
 * Invariants enforced:
 * - data_subject.project_id = participant.study.project_id
 * - data_subject.project_id = evidence_source.project_id
 * - participant link study_id = participant.study_id
 * - Deleted subjects cannot receive new links
 * - No partial subject/link state (transactional)
 *
 * All functions accept an optional Sequelize instance for test injection.
 * Production code omits it (uses the default database instance).
 */

import type { Transaction, Sequelize } from 'sequelize';
import defaultSequelize from '../database';
import type { DataSubject } from '../database/models/data_subject';
import type { DataSubjectLink } from '../database/models/data_subject_link';
import type { StudyParticipant } from '../database/models/study_participant';
import type { ResearchStudy } from '../database/models/research_study';
import type { EvidenceSource } from '../database/models/evidence_source';
import type { SurveyQualitativeEntry } from '../database/models/survey_qualitative_entry';

function models(db?: Sequelize) {
  const s = db ?? defaultSequelize;
  return {
    DataSubject: s.models.DataSubject as typeof DataSubject,
    DataSubjectLink: s.models.DataSubjectLink as typeof DataSubjectLink,
    Participant: s.models.StudyParticipant as typeof StudyParticipant,
    Study: s.models.ResearchStudy as typeof ResearchStudy,
    Source: s.models.EvidenceSource as typeof EvidenceSource,
    Entry: s.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry,
    db: s,
  };
}

// ─── Error types ─────────────────────────────────────────────────

export class SubjectLinkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubjectLinkingError';
  }
}

// ─── Core operations ─────────────────────────────────────────────

/**
 * Create a data_subject and participant link for a newly created participant.
 * Must be called within the participant creation transaction.
 */
export async function createSubjectForParticipant(
  participantId: number,
  createdBy: string,
  transaction: Transaction,
  db?: Sequelize,
): Promise<DataSubject> {
  const m = models(db);

  const participant = await m.Participant.findByPk(participantId, { transaction });
  if (!participant) throw new SubjectLinkingError(`Participant ${participantId} not found`);

  const study = await m.Study.findByPk(participant.study_id, { transaction });
  if (!study) throw new SubjectLinkingError(`Study ${participant.study_id} not found for participant ${participantId}`);

  // Idempotent — return existing if already linked
  const existingLink = await m.DataSubjectLink.findOne({
    where: { participant_id: participantId, link_type: 'participant' },
    transaction,
  });
  if (existingLink) {
    const existing = await m.DataSubject.findByPk(existingLink.data_subject_id, { transaction });
    if (existing) return existing;
  }

  const subject = await m.DataSubject.create(
    { project_id: study.project_id, created_by: createdBy },
    { transaction },
  );

  await m.DataSubjectLink.create(
    {
      data_subject_id: subject.id,
      link_type: 'participant',
      participant_id: participantId,
      study_id: participant.study_id,
      linked_by: createdBy,
    },
    { transaction },
  );

  return subject;
}

/**
 * Link an existing data_subject to a participant.
 * Validates all canonical scope invariants.
 */
export async function linkSubjectToParticipant(
  subjectId: number,
  participantId: number,
  linkedBy: string,
  transaction?: Transaction,
  db?: Sequelize,
): Promise<DataSubjectLink> {
  const m = models(db);

  const exec = async (t: Transaction): Promise<DataSubjectLink> => {
    const subject = await m.DataSubject.findByPk(subjectId, { transaction: t });
    if (!subject) throw new SubjectLinkingError(`Data subject ${subjectId} not found`);
    if (subject.status === 'deleted') throw new SubjectLinkingError('Cannot link to a deleted subject');

    const participant = await m.Participant.findByPk(participantId, { transaction: t });
    if (!participant) throw new SubjectLinkingError(`Participant ${participantId} not found`);

    const study = await m.Study.findByPk(participant.study_id, { transaction: t });
    if (!study) throw new SubjectLinkingError(`Study ${participant.study_id} not found`);

    if (subject.project_id !== study.project_id) {
      throw new SubjectLinkingError(
        `Project scope mismatch: subject belongs to project ${subject.project_id}, participant belongs to project ${study.project_id}`,
      );
    }

    return m.DataSubjectLink.create(
      {
        data_subject_id: subjectId,
        link_type: 'participant',
        participant_id: participantId,
        study_id: participant.study_id,
        linked_by: linkedBy,
      },
      { transaction: t },
    );
  };

  if (transaction) return exec(transaction);
  return m.db.transaction(exec);
}

/**
 * Link a data_subject to a survey respondent.
 * Validates source exists, project scope matches, respondent_key exists in entries.
 */
export async function linkSubjectToSurveyRespondent(
  subjectId: number,
  evidenceSourceId: number,
  respondentKey: string,
  linkedBy: string,
  transaction?: Transaction,
  db?: Sequelize,
): Promise<DataSubjectLink> {
  const m = models(db);

  const exec = async (t: Transaction): Promise<DataSubjectLink> => {
    const subject = await m.DataSubject.findByPk(subjectId, { transaction: t });
    if (!subject) throw new SubjectLinkingError(`Data subject ${subjectId} not found`);
    if (subject.status === 'deleted') throw new SubjectLinkingError('Cannot link to a deleted subject');

    const source = await m.Source.findByPk(evidenceSourceId, { transaction: t });
    if (!source) throw new SubjectLinkingError(`Evidence source ${evidenceSourceId} not found`);

    if (subject.project_id !== source.project_id) {
      throw new SubjectLinkingError(
        `Project scope mismatch: subject belongs to project ${subject.project_id}, source belongs to project ${source.project_id}`,
      );
    }

    const entryCount = await m.Entry.count({
      where: { evidence_source_id: evidenceSourceId, respondent_key: respondentKey },
      transaction: t,
    });
    if (entryCount === 0) {
      throw new SubjectLinkingError(
        `Respondent key "${respondentKey}" not found in evidence source ${evidenceSourceId}`,
      );
    }

    return m.DataSubjectLink.create(
      {
        data_subject_id: subjectId,
        link_type: 'survey_respondent',
        evidence_source_id: evidenceSourceId,
        respondent_key: respondentKey,
        linked_by: linkedBy,
      },
      { transaction: t },
    );
  };

  if (transaction) return exec(transaction);
  return m.db.transaction(exec);
}

/**
 * Create a data_subject for an external survey respondent (no Qori participant record).
 * Creates subject + survey_respondent link atomically.
 * Does NOT persist any external identity fields.
 */
export async function createExternalSurveySubject(
  projectId: number,
  evidenceSourceId: number,
  respondentKey: string,
  createdBy: string,
  transaction?: Transaction,
  db?: Sequelize,
): Promise<{ subject: DataSubject; link: DataSubjectLink }> {
  const m = models(db);

  const exec = async (t: Transaction): Promise<{ subject: DataSubject; link: DataSubjectLink }> => {
    const source = await m.Source.findByPk(evidenceSourceId, { transaction: t });
    if (!source) throw new SubjectLinkingError(`Evidence source ${evidenceSourceId} not found`);

    if (projectId !== source.project_id) {
      throw new SubjectLinkingError(
        `Project scope mismatch: supplied project ${projectId}, source belongs to project ${source.project_id}`,
      );
    }

    const entryCount = await m.Entry.count({
      where: { evidence_source_id: evidenceSourceId, respondent_key: respondentKey },
      transaction: t,
    });
    if (entryCount === 0) {
      throw new SubjectLinkingError(
        `Respondent key "${respondentKey}" not found in evidence source ${evidenceSourceId}`,
      );
    }

    const subject = await m.DataSubject.create(
      { project_id: projectId, created_by: createdBy },
      { transaction: t },
    );

    const link = await m.DataSubjectLink.create(
      {
        data_subject_id: subject.id,
        link_type: 'survey_respondent',
        evidence_source_id: evidenceSourceId,
        respondent_key: respondentKey,
        linked_by: createdBy,
      },
      { transaction: t },
    );

    return { subject, link };
  };

  if (transaction) return exec(transaction);
  return m.db.transaction(exec);
}

// ─── Backfill ────────────────────────────────────────────────────

export interface BackfillResult {
  created: number;
  skipped: number;
  errors: Array<{ participantId: number; error: string }>;
}

/**
 * Backfill data_subject + participant link for all existing participants
 * that don't already have a canonical subject link.
 */
export async function backfillExistingParticipants(db?: Sequelize): Promise<BackfillResult> {
  const m = models(db);
  const result: BackfillResult = { created: 0, skipped: 0, errors: [] };

  const [rows] = await m.db.query(
    `SELECT sp.id, sp.study_id
     FROM study_participants sp
     LEFT JOIN data_subject_links dsl
       ON dsl.participant_id = sp.id AND dsl.link_type = 'participant'
     WHERE dsl.id IS NULL
     ORDER BY sp.id`,
  );
  const unlinked = rows as Array<{ id: number; study_id: number }>;

  for (const row of unlinked) {
    try {
      await m.db.transaction(async (t) => {
        const participant = await m.Participant.findByPk(row.id, { transaction: t });
        if (!participant) throw new SubjectLinkingError(`Participant ${row.id} not found`);

        const study = await m.Study.findByPk(participant.study_id, { transaction: t });
        if (!study) throw new SubjectLinkingError(`Study ${participant.study_id} not found`);

        const existingLink = await m.DataSubjectLink.findOne({
          where: { participant_id: row.id, link_type: 'participant' },
          transaction: t,
        });
        if (existingLink) return;

        const subject = await m.DataSubject.create(
          { project_id: study.project_id, created_by: 'SYSTEM_BACKFILL' },
          { transaction: t },
        );

        await m.DataSubjectLink.create(
          {
            data_subject_id: subject.id,
            link_type: 'participant',
            participant_id: row.id,
            study_id: participant.study_id,
            linked_by: 'SYSTEM_BACKFILL',
          },
          { transaction: t },
        );
      });
      result.created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ participantId: row.id, error: message });
    }
  }

  const totalParticipants = await m.Participant.count();
  result.skipped = totalParticipants - result.created - result.errors.length;

  return result;
}

// ─── Query helpers ───────────────────────────────────────────────

export async function getSubjectForParticipant(
  participantId: number,
  db?: Sequelize,
): Promise<DataSubject | null> {
  const m = models(db);
  const link = await m.DataSubjectLink.findOne({
    where: { participant_id: participantId, link_type: 'participant' },
  });
  if (!link) return null;
  return m.DataSubject.findByPk(link.data_subject_id);
}

/**
 * Evidence Attribution Service (GOV-2B)
 *
 * Creates and manages canonical FK-based attributions linking data subjects
 * to evidence constructs. All operations resolve scope from persisted DB
 * state — never from caller-supplied project/study IDs.
 *
 * After G2-B, runtime DSAR traversal uses:
 *   data_subject → evidence_subject_attributions → evidence_constructs
 * No payload/prose matching needed.
 */

import type { Transaction, Sequelize } from 'sequelize';
import defaultSequelize from '../database';
import type { EvidenceSubjectAttribution, AttributionType } from '../database/models/evidence_subject_attribution';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import type { DataSubject } from '../database/models/data_subject';
import type { DataSubjectLink } from '../database/models/data_subject_link';
import type { EvidenceSource } from '../database/models/evidence_source';

function models(db?: Sequelize) {
  const s = db ?? defaultSequelize;
  return {
    Attribution: s.models.EvidenceSubjectAttribution as typeof EvidenceSubjectAttribution,
    Construct: s.models.EvidenceConstruct as typeof EvidenceConstruct,
    Subject: s.models.DataSubject as typeof DataSubject,
    SubjectLink: s.models.DataSubjectLink as typeof DataSubjectLink,
    Source: s.models.EvidenceSource as typeof EvidenceSource,
    db: s,
  };
}

// ─── Error type ──────────────────────────────────────────────────

export class AttributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttributionError';
  }
}

// ─── Core operation ──────────────────────────────────────────────

export interface AttributeInput {
  constructId: number;
  dataSubjectId: number;
  attributionType: AttributionType;
  evidenceSourceId?: number;
}

/**
 * Create a canonical attribution linking a data subject to an evidence construct.
 *
 * Verifies:
 * - construct.project_id = data_subject.project_id
 * - evidence_source.project_id = construct.project_id (if supplied)
 * - data_subject.status != 'deleted'
 *
 * Idempotent: returns existing attribution if (construct, subject, type) already exists.
 */
export async function attributeConstructToSubject(
  input: AttributeInput,
  transaction?: Transaction,
  db?: Sequelize,
): Promise<EvidenceSubjectAttribution> {
  const m = models(db);

  const exec = async (t: Transaction): Promise<EvidenceSubjectAttribution> => {
    const construct = await m.Construct.findByPk(input.constructId, { transaction: t });
    if (!construct) throw new AttributionError(`Construct ${input.constructId} not found`);

    const subject = await m.Subject.findByPk(input.dataSubjectId, { transaction: t });
    if (!subject) throw new AttributionError(`Data subject ${input.dataSubjectId} not found`);
    if (subject.status === 'deleted') throw new AttributionError('Cannot attribute to a deleted subject');

    // Invariant: construct.project_id = subject.project_id
    if (construct.project_id !== subject.project_id) {
      throw new AttributionError(
        `Project scope mismatch: construct belongs to project ${construct.project_id}, subject belongs to project ${subject.project_id}`,
      );
    }

    // If evidence_source_id supplied, verify scope consistency
    if (input.evidenceSourceId) {
      const source = await m.Source.findByPk(input.evidenceSourceId, { transaction: t });
      if (!source) throw new AttributionError(`Evidence source ${input.evidenceSourceId} not found`);
      if (source.project_id !== construct.project_id) {
        throw new AttributionError(
          `Evidence source project mismatch: source belongs to project ${source.project_id}, construct belongs to project ${construct.project_id}`,
        );
      }
    }

    // Idempotent: check for existing
    const existing = await m.Attribution.findOne({
      where: {
        construct_id: input.constructId,
        data_subject_id: input.dataSubjectId,
        attribution_type: input.attributionType,
      },
      transaction: t,
    });
    if (existing) return existing;

    return m.Attribution.create(
      {
        construct_id: input.constructId,
        data_subject_id: input.dataSubjectId,
        attribution_type: input.attributionType,
        evidence_source_id: input.evidenceSourceId ?? null,
      },
      { transaction: t },
    );
  };

  if (transaction) return exec(transaction);
  return m.db.transaction(exec);
}

// ─── Backfill ────────────────────────────────────────────────────

export interface BackfillAttributionResult {
  created: number;
  skipped: number;
  unresolved: number;
  errors: Array<{ constructId: number; reason: string }>;
}

/**
 * One-time legacy backfill: inspect existing nugget constructs for
 * payload.participant (PT-XXX code) and create canonical attribution rows.
 *
 * Rules:
 * - Resolve code through study_participants (exact match only)
 * - Resolve participant through data_subject_links
 * - Verify project/study scope
 * - Create attribution only when resolution is unique and unambiguous
 * - Never use names or fuzzy/prose matching
 * - Unresolved/ambiguous records: skip + report
 *
 * This is BACKFILL-ONLY. Runtime DSAR must use FK-based traversal.
 */
export async function backfillNuggetAttributions(db?: Sequelize): Promise<BackfillAttributionResult> {
  const m = models(db);
  const result: BackfillAttributionResult = { created: 0, skipped: 0, unresolved: 0, errors: [] };

  // Find nugget constructs that:
  // 1. Have a payload with a participant field
  // 2. Don't already have an attribution
  const [rows] = await m.db.query(`
    SELECT ec.id AS construct_id, ec.project_id, ec.study_id,
           ec.payload->>'participant' AS participant_code,
           ec.construct_type
    FROM evidence_constructs ec
    LEFT JOIN evidence_subject_attributions esa
      ON esa.construct_id = ec.id
    WHERE ec.construct_type IN ('nugget', 'survey_individual_observation')
      AND ec.payload IS NOT NULL
      AND ec.payload->>'participant' IS NOT NULL
      AND ec.payload->>'participant' != ''
      AND esa.id IS NULL
    ORDER BY ec.id
  `);
  const nuggets = rows as Array<{
    construct_id: number;
    project_id: number;
    study_id: number | null;
    participant_code: string;
    construct_type: string;
  }>;

  for (const nugget of nuggets) {
    try {
      // Resolve participant by code within the correct study
      const whereClause: Record<string, unknown> = {
        participant_code: nugget.participant_code,
      };
      if (nugget.study_id) {
        whereClause.study_id = nugget.study_id;
      }

      const [participantRows] = await m.db.query(
        `SELECT sp.id AS participant_id
         FROM study_participants sp
         JOIN research_studies rs ON rs.id = sp.study_id
         WHERE sp.participant_code = :code
           AND rs.project_id = :projectId
           ${nugget.study_id ? 'AND sp.study_id = :studyId' : ''}
         ORDER BY sp.id`,
        {
          replacements: {
            code: nugget.participant_code,
            projectId: nugget.project_id,
            ...(nugget.study_id ? { studyId: nugget.study_id } : {}),
          },
        },
      );
      const participants = participantRows as Array<{ participant_id: number }>;

      if (participants.length === 0) {
        result.unresolved++;
        result.errors.push({
          constructId: nugget.construct_id,
          reason: `No participant found for code "${nugget.participant_code}" in project ${nugget.project_id}`,
        });
        continue;
      }

      if (participants.length > 1) {
        result.unresolved++;
        result.errors.push({
          constructId: nugget.construct_id,
          reason: `Ambiguous: ${participants.length} participants match code "${nugget.participant_code}" in project ${nugget.project_id}`,
        });
        continue;
      }

      const participantId = participants[0].participant_id;

      // Resolve data_subject via participant link
      const [subjectRows] = await m.db.query(
        `SELECT dsl.data_subject_id
         FROM data_subject_links dsl
         WHERE dsl.participant_id = :participantId
           AND dsl.link_type = 'participant'`,
        { replacements: { participantId } },
      );
      const subjectLinks = subjectRows as Array<{ data_subject_id: number }>;

      if (subjectLinks.length === 0) {
        result.unresolved++;
        result.errors.push({
          constructId: nugget.construct_id,
          reason: `Participant ${participantId} has no data_subject link`,
        });
        continue;
      }

      const dataSubjectId = subjectLinks[0].data_subject_id;

      // Determine attribution type from construct type/payload
      const attributionType: AttributionType =
        nugget.construct_type === 'survey_individual_observation'
          ? 'survey_response'
          : 'direct_quote'; // nuggets contain verbatim quotes by default

      // Create attribution (idempotent via unique constraint)
      await m.db.transaction(async (t) => {
        await attributeConstructToSubject(
          {
            constructId: nugget.construct_id,
            dataSubjectId,
            attributionType,
          },
          t,
          db,
        );
      });

      result.created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ constructId: nugget.construct_id, reason: message });
    }
  }

  // Count constructs that already had attributions (skipped by the LEFT JOIN filter)
  const [existingRows] = await m.db.query(`
    SELECT COUNT(DISTINCT esa.construct_id)::int AS count
    FROM evidence_subject_attributions esa
    JOIN evidence_constructs ec ON ec.id = esa.construct_id
    WHERE ec.construct_type IN ('nugget', 'survey_individual_observation')
  `);
  result.skipped = (existingRows as Array<{ count: number }>)[0]?.count ?? 0;

  return result;
}

// ─── Query helpers ───────────────────────────────────────────────

/**
 * Get all attributions for a data subject.
 */
export async function getAttributionsForSubject(
  dataSubjectId: number,
  db?: Sequelize,
): Promise<EvidenceSubjectAttribution[]> {
  const m = models(db);
  return m.Attribution.findAll({
    where: { data_subject_id: dataSubjectId },
    order: [['created_at', 'ASC']],
  });
}

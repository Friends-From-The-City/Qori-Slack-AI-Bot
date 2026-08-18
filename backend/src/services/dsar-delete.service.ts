/**
 * DSAR Delete Service (GOV-2D)
 *
 * Subject-rooted deletion, redaction, and downstream staleness marking.
 * Rooted on data_subject.public_id — FK-based traversal only.
 *
 * Transaction order (all-or-nothing):
 *   1. Delete participant-scoped study_variables
 *   2. Delete exact linked survey_qualitative_entries
 *   3. Delete subject-attributable study_notes
 *   4. Redact exact attributed evidence constructs
 *   5. Mark those constructs stale_due_to_disposition=true
 *   6. Recursively mark downstream constructs stale_due_to_disposition=true
 *   7. Delete evidence_subject_attributions
 *   8. Delete survey_respondent links
 *   9. Delete participant records (links + observers cascade)
 *  10. Tombstone data_subject: status='deleted', deleted_at=NOW()
 *
 * Unknown/unrecognized payload shapes fail closed — the entire transaction
 * rolls back and returns manual_review_required with the offending construct IDs.
 */

import { Op, type Sequelize, type Transaction } from 'sequelize';
import defaultSequelize from '../database';
import { assertProjectOwner, AuthorizationError } from './authorization.service';
import { logDispositionAction } from './audit.service';
import type { DataSubject } from '../database/models/data_subject';
import type { DataSubjectLink } from '../database/models/data_subject_link';
import type { StudyParticipant } from '../database/models/study_participant';
import type { StudyNotes } from '../database/models/study_notes';
import type { EvidenceSubjectAttribution } from '../database/models/evidence_subject_attribution';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import type { EvidenceRelationship } from '../database/models/evidence_relationship';
import type { SurveyQualitativeEntry } from '../database/models/survey_qualitative_entry';
import type { ArtifactEvidenceRef } from '../database/models/artifact_evidence_ref';

function models(db?: Sequelize) {
  const s = db ?? defaultSequelize;
  return {
    Subject: s.models.DataSubject as typeof DataSubject,
    Link: s.models.DataSubjectLink as typeof DataSubjectLink,
    Participant: s.models.StudyParticipant as typeof StudyParticipant,
    Notes: s.models.StudyNotes as typeof StudyNotes,
    Attribution: s.models.EvidenceSubjectAttribution as typeof EvidenceSubjectAttribution,
    Construct: s.models.EvidenceConstruct as typeof EvidenceConstruct,
    Relationship: s.models.EvidenceRelationship as typeof EvidenceRelationship,
    Entry: s.models.SurveyQualitativeEntry as typeof SurveyQualitativeEntry,
    Variable: s.models.StudyVariable,
    Observer: s.models.SessionObserver,
    ArtifactRef: s.models.ArtifactEvidenceRef as typeof ArtifactEvidenceRef,
    db: s,
  };
}

// ─── Result types ───────────────────────────────────────────────

export interface DSARDeleteResult {
  outcome: 'success' | 'already_deleted' | 'manual_review_required';
  data_subject_public_id: string;
  project_id: number;
  snapshot: PreDeleteSnapshot;
  redaction_map: RedactionReport;
  staleness: StalenessReport;
  affected_artifacts: AffectedArtifact[];
  known_limitations: string[];
}

export interface PreDeleteSnapshot {
  participant_count: number;
  participant_ids: number[];
  study_variables_count: number;
  study_notes_count: number;
  session_observers_count: number;
  survey_entries_count: number;
  evidence_attributions_count: number;
  attributed_construct_count: number;
  attributed_construct_public_ids: string[];
  downstream_construct_count: number;
  downstream_construct_public_ids: string[];
  affected_artifact_count: number;
}

export interface RedactionReport {
  redacted_constructs: Array<{
    public_id: string;
    construct_type: string;
    attribution_type: string;
    fields_redacted: string[];
  }>;
  failed_constructs: Array<{
    public_id: string;
    reason: string;
  }>;
}

export interface StalenessReport {
  directly_marked: string[];
  downstream_marked: string[];
}

export interface AffectedArtifact {
  artifact_id: number;
  artifact_public_id: string;
  ref_type: string;
  via_construct_public_id: string;
}

// ─── Redaction map ──────────────────────────────────────────────

/**
 * Structured redaction rules per attribution type.
 * Only these fields are touched — no generic JSON walking.
 */
const REDACTION_FIELDS: Record<string, string[]> = {
  direct_quote: ['verbatim_quote', 'text', 'quote'],
  paraphrase: ['paraphrase', 'summary'],
  observation: ['observation', 'behavior', 'note'],
  survey_response: ['response_text', 'entry_text'],
  behavioral_data: ['behavioral_data', 'task_completion'],
};

/** Subject attribution fields removed from payload during redaction. */
const SUBJECT_FIELDS = ['participant', 'participant_code'];

/**
 * Validate that we know how to redact a construct's payload for the given
 * attribution type. Returns the list of fields to redact, or null if the
 * payload shape is unrecognized (fail-closed).
 */
function resolveRedactionFields(
  payload: Record<string, unknown> | null,
  attributionType: string,
): string[] | null {
  const typeFields = REDACTION_FIELDS[attributionType];
  if (!typeFields) return null; // Unknown attribution type

  if (!payload) return []; // Nothing to redact

  // Check that at least one known field exists — if the payload has none
  // of the expected fields AND none of the subject fields, it's an
  // unrecognized shape
  const allKnownFields = [...typeFields, ...SUBJECT_FIELDS];
  const matchingFields = allKnownFields.filter(f => f in payload);

  if (matchingFields.length === 0 && Object.keys(payload).length > 0) {
    // Payload has content but none of our known fields — unrecognized shape
    return null;
  }

  return matchingFields;
}

/**
 * Apply redaction to a construct's payload. Replaces known fields with
 * '[REDACTED]' and removes subject attribution fields.
 * Returns the redacted payload.
 */
function redactPayload(
  payload: Record<string, unknown>,
  fieldsToRedact: string[],
  attributionType: string,
): Record<string, unknown> {
  const typeFields = REDACTION_FIELDS[attributionType] ?? [];
  const redacted = { ...payload };

  for (const field of fieldsToRedact) {
    if (field in redacted) {
      if (SUBJECT_FIELDS.includes(field)) {
        delete redacted[field];
      } else if (typeFields.includes(field)) {
        redacted[field] = '[REDACTED]';
      }
    }
  }

  return redacted;
}

// ─── Downstream traversal ───────────────────────────────────────

/**
 * Recursively find all downstream construct IDs reachable from a set of
 * construct IDs via evidence_relationships.
 * Returns the set of downstream IDs (excluding the input set).
 */
async function traverseDownstream(
  startIds: number[],
  t: Transaction,
  db?: Sequelize,
): Promise<Set<number>> {
  const m = models(db);
  const visited = new Set<number>(startIds);
  const downstream = new Set<number>();
  let frontier = [...startIds];

  while (frontier.length > 0) {
    // Find all relationships where frontier constructs are the FROM side
    const relationships = await m.Relationship.findAll({
      where: { from_construct_id: { [Op.in]: frontier } },
      attributes: ['to_construct_id'],
      transaction: t,
    });

    const nextFrontier: number[] = [];
    for (const rel of relationships) {
      const toId = rel.to_construct_id;
      if (toId !== null && !visited.has(toId)) {
        visited.add(toId);
        downstream.add(toId);
        nextFrontier.push(toId);
      }
    }

    frontier = nextFrontier;
  }

  return downstream;
}

// ─── Pre-delete snapshot ────────────────────────────────────────

async function gatherPreDeleteSnapshot(
  subject: DataSubject,
  links: DataSubjectLink[],
  attributions: EvidenceSubjectAttribution[],
  t: Transaction,
  db?: Sequelize,
): Promise<PreDeleteSnapshot> {
  const m = models(db);
  const participantLinks = links.filter(l => l.link_type === 'participant');
  const surveyLinks = links.filter(l => l.link_type === 'survey_respondent');

  const participantIds = participantLinks
    .map(l => l.participant_id)
    .filter((id): id is number => id !== null);

  // Study variables (participant_id is STRING = participant_code)
  let studyVariablesCount = 0;
  if (participantIds.length > 0) {
    // Get participant codes for variable lookup
    const participants = await m.Participant.findAll({
      where: { id: { [Op.in]: participantIds } },
      attributes: ['id', 'participant_code', 'study_id'],
      transaction: t,
    });
    for (const p of participants) {
      studyVariablesCount += await m.Variable.count({
        where: { study_id: p.study_id, participant_id: p.participant_code },
        transaction: t,
      });
    }
  }

  // Study notes
  let studyNotesCount = 0;
  if (participantIds.length > 0) {
    studyNotesCount = await m.Notes.count({
      where: { participant_id: { [Op.in]: participantIds } },
      transaction: t,
    });
  }

  // Session observers (cascade from participant, count for audit)
  let sessionObserversCount = 0;
  if (participantIds.length > 0) {
    sessionObserversCount = await m.Observer.count({
      where: { participant_id: { [Op.in]: participantIds } },
      transaction: t,
    });
  }

  // Survey entries
  let surveyEntriesCount = 0;
  for (const link of surveyLinks) {
    if (link.evidence_source_id && link.respondent_key) {
      surveyEntriesCount += await m.Entry.count({
        where: {
          evidence_source_id: link.evidence_source_id,
          respondent_key: link.respondent_key,
        },
        transaction: t,
      });
    }
  }

  // Attributed constructs
  const constructIds = attributions.map(a => a.construct_id);
  const constructs = constructIds.length > 0
    ? await m.Construct.findAll({
      where: { id: { [Op.in]: constructIds } },
      attributes: ['id', 'public_id'],
      transaction: t,
    })
    : [];

  // Downstream constructs
  const downstreamIds = constructIds.length > 0
    ? await traverseDownstream(constructIds, t, db)
    : new Set<number>();

  const downstreamConstructs = downstreamIds.size > 0
    ? await m.Construct.findAll({
      where: { id: { [Op.in]: [...downstreamIds] } },
      attributes: ['id', 'public_id'],
      transaction: t,
    })
    : [];

  // Affected artifacts (via both directly attributed + downstream)
  const allAffectedConstructIds = [...constructIds, ...downstreamIds];
  let affectedArtifactCount = 0;
  if (allAffectedConstructIds.length > 0) {
    affectedArtifactCount = await m.ArtifactRef.count({
      where: { construct_id: { [Op.in]: allAffectedConstructIds } },
      transaction: t,
    });
  }

  return {
    participant_count: participantIds.length,
    participant_ids: participantIds,
    study_variables_count: studyVariablesCount,
    study_notes_count: studyNotesCount,
    session_observers_count: sessionObserversCount,
    survey_entries_count: surveyEntriesCount,
    evidence_attributions_count: attributions.length,
    attributed_construct_count: constructs.length,
    attributed_construct_public_ids: constructs.map(c => c.public_id),
    downstream_construct_count: downstreamConstructs.length,
    downstream_construct_public_ids: downstreamConstructs.map(c => c.public_id),
    affected_artifact_count: affectedArtifactCount,
  };
}

// ─── Affected artifact identification ───────────────────────────

async function identifyAffectedArtifacts(
  constructIds: number[],
  downstreamIds: Set<number>,
  t: Transaction,
  db?: Sequelize,
): Promise<AffectedArtifact[]> {
  const m = models(db);
  const allIds = [...constructIds, ...downstreamIds];
  if (allIds.length === 0) return [];

  const refs = await m.ArtifactRef.findAll({
    where: { construct_id: { [Op.in]: allIds } },
    transaction: t,
  });

  // Need construct public_ids and artifact public_ids
  const constructMap = new Map<number, string>();
  if (allIds.length > 0) {
    const constructs = await m.Construct.findAll({
      where: { id: { [Op.in]: allIds } },
      attributes: ['id', 'public_id'],
      transaction: t,
    });
    for (const c of constructs) {
      constructMap.set(c.id, c.public_id);
    }
  }

  const artifactIds = [...new Set(refs.map(r => r.artifact_id))];
  const artifactMap = new Map<number, string>();
  if (artifactIds.length > 0) {
    const ResearchArtifact = m.db.models.ResearchArtifact;
    const artifacts = await ResearchArtifact.findAll({
      where: { id: { [Op.in]: artifactIds } },
      attributes: ['id', 'public_id'],
      transaction: t,
    });
    for (const a of artifacts) {
      artifactMap.set((a as any).id, (a as any).public_id);
    }
  }

  return refs.map(r => ({
    artifact_id: r.artifact_id,
    artifact_public_id: artifactMap.get(r.artifact_id) ?? 'unknown',
    ref_type: r.ref_type,
    via_construct_public_id: constructMap.get(r.construct_id) ?? 'unknown',
  }));
}

// ─── Core delete ────────────────────────────────────────────────

/**
 * Delete all subject-linked data, redact attributed evidence, mark
 * downstream constructs stale, and tombstone the data_subject.
 *
 * Runs entirely within a single Postgres transaction.
 * Fails closed on unknown payload shapes — rolls back entire transaction.
 */
export async function deleteSubjectData(
  subjectPublicId: string,
  projectId: number,
  actorUserId: string,
  db?: Sequelize,
): Promise<DSARDeleteResult> {
  const m = models(db);
  const limitations: string[] = [];

  // ── Resolve subject ──
  const subject = await m.Subject.findOne({
    where: { public_id: subjectPublicId, project_id: projectId },
  });
  if (!subject) {
    throw new Error(`Data subject ${subjectPublicId} not found in project ${projectId}`);
  }

  // ── Idempotency: already deleted ──
  if (subject.status === 'deleted') {
    return {
      outcome: 'already_deleted',
      data_subject_public_id: subjectPublicId,
      project_id: projectId,
      snapshot: {
        participant_count: 0, participant_ids: [],
        study_variables_count: 0, study_notes_count: 0,
        session_observers_count: 0, survey_entries_count: 0,
        evidence_attributions_count: 0, attributed_construct_count: 0,
        attributed_construct_public_ids: [], downstream_construct_count: 0,
        downstream_construct_public_ids: [], affected_artifact_count: 0,
      },
      redaction_map: { redacted_constructs: [], failed_constructs: [] },
      staleness: { directly_marked: [], downstream_marked: [] },
      affected_artifacts: [],
      known_limitations: ['Subject was already deleted. No destructive work performed.'],
    };
  }

  // ── Transaction ──
  const result = await m.db.transaction(async (t: Transaction) => {
    // Resolve all links
    const links = await m.Link.findAll({
      where: { data_subject_id: subject.id },
      transaction: t,
    });

    // Resolve all attributions
    const attributions = await m.Attribution.findAll({
      where: { data_subject_id: subject.id },
      transaction: t,
    });

    // ── Pre-delete snapshot ──
    const snapshot = await gatherPreDeleteSnapshot(subject, links, attributions, t, db);

    // ── Downstream traversal (before mutation) ──
    const attributedConstructIds = attributions.map(a => a.construct_id);
    const downstreamIds = attributedConstructIds.length > 0
      ? await traverseDownstream(attributedConstructIds, t, db)
      : new Set<number>();

    // ── Identify affected artifacts (before mutation) ──
    const affectedArtifacts = await identifyAffectedArtifacts(
      attributedConstructIds, downstreamIds, t, db,
    );

    // ── Prepare redaction ──
    const redactionReport: RedactionReport = {
      redacted_constructs: [],
      failed_constructs: [],
    };

    // Validate all construct payloads BEFORE any mutation (fail-closed)
    const constructsToRedact: Array<{
      construct: EvidenceConstruct;
      attributionType: string;
      fields: string[];
    }> = [];

    for (const attr of attributions) {
      const construct = await m.Construct.findByPk(attr.construct_id, { transaction: t });
      if (!construct) continue;

      const fields = resolveRedactionFields(construct.payload, attr.attribution_type);
      if (fields === null) {
        // Unknown payload shape — fail closed
        redactionReport.failed_constructs.push({
          public_id: construct.public_id,
          reason: `Unrecognized payload shape for attribution type "${attr.attribution_type}"`,
        });
      } else {
        constructsToRedact.push({
          construct,
          attributionType: attr.attribution_type,
          fields,
        });
      }
    }

    // If any constructs failed validation, abort entire transaction
    if (redactionReport.failed_constructs.length > 0) {
      // Return a manual_review_required result — the transaction will be
      // committed but NO mutations were performed (we validated first)
      throw new ManualReviewRequired(snapshot, redactionReport, affectedArtifacts);
    }

    // ═══════════════════════════════════════════════════════════════
    // MUTATIONS BEGIN — point of no return within transaction
    // ═══════════════════════════════════════════════════════════════

    const participantLinks = links.filter(l => l.link_type === 'participant');
    const surveyLinks = links.filter(l => l.link_type === 'survey_respondent');

    const participantIds = participantLinks
      .map(l => l.participant_id)
      .filter((id): id is number => id !== null);

    // 1. Delete participant-scoped study_variables
    if (participantIds.length > 0) {
      const participants = await m.Participant.findAll({
        where: { id: { [Op.in]: participantIds } },
        attributes: ['id', 'participant_code', 'study_id'],
        transaction: t,
      });
      for (const p of participants) {
        await m.Variable.destroy({
          where: { study_id: p.study_id, participant_id: p.participant_code },
          transaction: t,
        });
      }
    }

    // 2. Delete exact linked survey_qualitative_entries
    for (const link of surveyLinks) {
      if (link.evidence_source_id && link.respondent_key) {
        await m.Entry.destroy({
          where: {
            evidence_source_id: link.evidence_source_id,
            respondent_key: link.respondent_key,
          },
          transaction: t,
        });
      }
    }

    // 3. Delete subject-attributable study_notes
    if (participantIds.length > 0) {
      await m.Notes.destroy({
        where: { participant_id: { [Op.in]: participantIds } },
        transaction: t,
      });
    }

    // 4 + 5. Redact exact attributed evidence constructs + mark stale
    const stalenessReport: StalenessReport = {
      directly_marked: [],
      downstream_marked: [],
    };

    for (const { construct, attributionType, fields } of constructsToRedact) {
      let fieldsRedacted: string[] = [];

      if (construct.payload && fields.length > 0) {
        const redactedPayload = redactPayload(construct.payload, fields, attributionType);
        await construct.update(
          {
            payload: redactedPayload,
            stale_due_to_disposition: true,
          },
          { transaction: t },
        );
        fieldsRedacted = fields;
      } else {
        // No payload or no matching fields — just mark stale
        await construct.update(
          { stale_due_to_disposition: true },
          { transaction: t },
        );
      }

      redactionReport.redacted_constructs.push({
        public_id: construct.public_id,
        construct_type: construct.construct_type,
        attribution_type: attributionType,
        fields_redacted: fieldsRedacted,
      });

      stalenessReport.directly_marked.push(construct.public_id);
    }

    // 6. Recursively mark downstream constructs stale
    if (downstreamIds.size > 0) {
      const downstreamConstructs = await m.Construct.findAll({
        where: { id: { [Op.in]: [...downstreamIds] } },
        transaction: t,
      });

      for (const dc of downstreamConstructs) {
        if (!dc.stale_due_to_disposition) {
          await dc.update({ stale_due_to_disposition: true }, { transaction: t });
        }
        stalenessReport.downstream_marked.push(dc.public_id);
      }
    }

    // 7. Delete evidence_subject_attributions
    if (attributions.length > 0) {
      await m.Attribution.destroy({
        where: { data_subject_id: subject.id },
        transaction: t,
      });
    }

    // 8. Delete survey_respondent links explicitly
    if (surveyLinks.length > 0) {
      await m.Link.destroy({
        where: {
          data_subject_id: subject.id,
          link_type: 'survey_respondent',
        },
        transaction: t,
      });
    }

    // 9. Delete participant records (participant links + session_observers cascade via FK)
    if (participantIds.length > 0) {
      // Delete participant links first (CASCADE will not handle data_subject_link → participant)
      await m.Link.destroy({
        where: {
          data_subject_id: subject.id,
          link_type: 'participant',
        },
        transaction: t,
      });

      // Delete participants — session_observers cascade via FK
      await m.Participant.destroy({
        where: { id: { [Op.in]: participantIds } },
        transaction: t,
      });
    }

    // 10. Tombstone data_subject
    await subject.update(
      {
        status: 'deleted' as const,
        deleted_at: new Date(),
      },
      { transaction: t },
    );

    return {
      snapshot,
      redactionReport,
      stalenessReport,
      affectedArtifacts,
    };
  });

  // ── Standard limitations ──
  limitations.push('GitHub artifacts (rendered documents, issues) are not modified. Use G2-E for artifact remediation.');
  limitations.push('Historical records that predate canonical subject attribution are not discoverable via FK traversal.');
  limitations.push('study_variables.participant_id is a STRING column — deletion uses exact participant_code match, not FK.');

  // ── Audit log (outside transaction — records actual outcome) ──
  await logDispositionAction({
    action: 'delete_subject',
    record_type: 'data_subject',
    target_identifier: subjectPublicId,
    project_id: projectId,
    actor_user_id: actorUserId,
    authorization_basis: 'project_owner',
    outcome: 'success',
    records_affected: {
      participants: result.snapshot.participant_count,
      study_variables: result.snapshot.study_variables_count,
      study_notes: result.snapshot.study_notes_count,
      session_observers: result.snapshot.session_observers_count,
      survey_entries: result.snapshot.survey_entries_count,
      evidence_attributions: result.snapshot.evidence_attributions_count,
      constructs_redacted: result.redactionReport.redacted_constructs.length,
      constructs_marked_stale: result.stalenessReport.directly_marked.length + result.stalenessReport.downstream_marked.length,
      affected_artifacts: result.affectedArtifacts.length,
    },
  });

  return {
    outcome: 'success',
    data_subject_public_id: subjectPublicId,
    project_id: projectId,
    snapshot: result.snapshot,
    redaction_map: result.redactionReport,
    staleness: result.stalenessReport,
    affected_artifacts: result.affectedArtifacts,
    known_limitations: limitations,
  };
}

// ─── Authorized entry point ─────────────────────────────────────

/**
 * Delete subject data with authorization check.
 * Only project owners can perform DSAR deletions.
 */
export async function deleteSubjectDataAuthorized(
  subjectPublicId: string,
  projectId: number,
  actorUserId: string,
  db?: Sequelize,
): Promise<DSARDeleteResult> {
  await assertProjectOwner(actorUserId, projectId);
  return deleteSubjectData(subjectPublicId, projectId, actorUserId, db);
}

// ─── Error types ────────────────────────────────────────────────

/**
 * Thrown when a construct has an unrecognized payload shape.
 * The transaction is rolled back and no mutations are performed.
 * Caught at the top level to produce a manual_review_required result.
 */
class ManualReviewRequired extends Error {
  constructor(
    public readonly snapshot: PreDeleteSnapshot,
    public readonly redactionReport: RedactionReport,
    public readonly affectedArtifacts: AffectedArtifact[],
  ) {
    super('Manual review required: unrecognized payload shape');
    this.name = 'ManualReviewRequired';
  }
}

/**
 * Delete subject data with fail-closed handling.
 * Wraps deleteSubjectData to catch ManualReviewRequired and produce the
 * appropriate result instead of throwing.
 */
export async function deleteSubjectDataSafe(
  subjectPublicId: string,
  projectId: number,
  actorUserId: string,
  db?: Sequelize,
): Promise<DSARDeleteResult> {
  try {
    return await deleteSubjectData(subjectPublicId, projectId, actorUserId, db);
  } catch (err) {
    if (err instanceof ManualReviewRequired) {
      // Log the failure
      await logDispositionAction({
        action: 'delete_subject',
        record_type: 'data_subject',
        target_identifier: subjectPublicId,
        project_id: projectId,
        actor_user_id: actorUserId,
        authorization_basis: 'project_owner',
        outcome: 'error',
        outcome_detail: `Manual review required: ${err.redactionReport.failed_constructs.map(f => f.public_id).join(', ')}`,
        records_affected: {
          failed_constructs: err.redactionReport.failed_constructs.length,
        },
      });

      return {
        outcome: 'manual_review_required',
        data_subject_public_id: subjectPublicId,
        project_id: projectId,
        snapshot: err.snapshot,
        redaction_map: err.redactionReport,
        staleness: { directly_marked: [], downstream_marked: [] },
        affected_artifacts: err.affectedArtifacts,
        known_limitations: [
          'Transaction rolled back — no mutations performed.',
          `Constructs requiring manual review: ${err.redactionReport.failed_constructs.map(f => f.public_id).join(', ')}`,
        ],
      };
    }
    throw err;
  }
}

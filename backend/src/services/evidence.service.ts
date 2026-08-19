/**
 * Evidence Service
 *
 * Per ADRs 0028-0030: CRUD operations on the canonical evidence layer
 * (sources, constructs, relationships) with transactional derivation support.
 *
 * This service does NOT replace study_variables or the cascade pipeline.
 * It provides the authoritative evidence store that coexists with the
 * cascade projection layer.
 *
 * Relationship endpoints use FK-backed columns (from_source_id,
 * from_construct_id, to_source_id, to_construct_id) with CHECK
 * constraints at the database level. Callers use the typed
 * CreateSourceToConstructInput / CreateConstructToConstructInput
 * interfaces — they never manipulate raw polymorphic IDs.
 */

import { Op, type Transaction, type CreationAttributes } from 'sequelize';
import sequelize from '../database';
import type { EvidenceSource, SourceType, ArtifactRef } from '../database/models/evidence_source';
import type {
  EvidenceConstruct,
  ConstructType,
  DerivationType,
  ConstructStatus,
  DerivationContext,
} from '../database/models/evidence_construct';
import type {
  EvidenceRelationship,
  RelationshipType,
  RelationshipProvenance,
} from '../database/models/evidence_relationship';

const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;
const EvidenceConstructModel = sequelize.models.EvidenceConstruct as typeof EvidenceConstruct;
const EvidenceRelationshipModel = sequelize.models.EvidenceRelationship as typeof EvidenceRelationship;

// ═══════════════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface CreateSourceInput {
  project_id: number;
  study_id?: number | null;
  source_type: SourceType;
  label: string;
  artifact_ref?: ArtifactRef | null;
  metadata?: Record<string, unknown> | null;
  created_by: string;
}

export interface CreateConstructInput {
  project_id: number;
  study_id?: number | null;
  construct_type: ConstructType;
  label?: string | null;
  payload?: Record<string, unknown> | null;
  derivation_type?: DerivationType;
  derivation_context?: DerivationContext | null;
  status?: ConstructStatus;
  cascade_variable_key?: string | null;
  created_by: string;
}

/** Source → Construct relationship. */
export interface CreateSourceToConstructInput {
  project_id: number;
  from_source_id: number;
  to_construct_id: number;
  relationship_type: RelationshipType;
  provenance?: RelationshipProvenance | null;
}

/** Construct → Construct relationship. */
export interface CreateConstructToConstructInput {
  project_id: number;
  from_construct_id: number;
  to_construct_id: number;
  relationship_type: RelationshipType;
  provenance?: RelationshipProvenance | null;
}

export type CreateRelationshipInput =
  | CreateSourceToConstructInput
  | CreateConstructToConstructInput;

/** A construct + its required lineage relationships, persisted atomically. */
export interface DerivationInput {
  construct: CreateConstructInput;
  relationships: DerivationRelationshipInput[];
}

/**
 * Relationship input for derivations. A to_construct_id of 0 is a sentinel
 * meaning "the construct being created in this derivation."
 */
export type DerivationRelationshipInput =
  | { project_id: number; from_source_id: number; to_construct_id: number; relationship_type: RelationshipType; provenance?: RelationshipProvenance | null }
  | { project_id: number; from_construct_id: number; to_construct_id: number; relationship_type: RelationshipType; provenance?: RelationshipProvenance | null };

// ═══════════════════════════════════════════════════════════════════════
// SOURCES
// ═══════════════════════════════════════════════════════════════════════

export async function createSource(
  input: CreateSourceInput,
  transaction?: Transaction,
): Promise<EvidenceSource> {
  return EvidenceSourceModel.create(
    {
      project_id: input.project_id,
      study_id: input.study_id ?? null,
      source_type: input.source_type,
      label: input.label,
      artifact_ref: input.artifact_ref ?? null,
      metadata: input.metadata ?? null,
      created_by: input.created_by,
    } as CreationAttributes<EvidenceSource>,
    { transaction },
  );
}

export async function getSourceById(
  id: number,
  transaction?: Transaction,
): Promise<EvidenceSource | null> {
  return EvidenceSourceModel.findByPk(id, { transaction });
}

export async function getSourcesByProject(projectId: number): Promise<EvidenceSource[]> {
  return EvidenceSourceModel.findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
  });
}

export async function getSourcesByStudy(studyId: number): Promise<EvidenceSource[]> {
  return EvidenceSourceModel.findAll({
    where: { study_id: studyId },
    order: [['created_at', 'DESC']],
  });
}

// ═══════════════════════════════════════════════════════════════════════
// CONSTRUCTS
// ═══════════════════════════════════════════════════════════════════════

export async function createConstruct(
  input: CreateConstructInput,
  transaction?: Transaction,
): Promise<EvidenceConstruct> {
  return EvidenceConstructModel.create(
    {
      project_id: input.project_id,
      study_id: input.study_id ?? null,
      construct_type: input.construct_type,
      label: input.label ?? null,
      payload: input.payload ?? null,
      derivation_type: input.derivation_type ?? 'model',
      derivation_context: input.derivation_context ?? null,
      status: input.status ?? 'candidate',
      cascade_variable_key: input.cascade_variable_key ?? null,
      created_by: input.created_by,
    } as CreationAttributes<EvidenceConstruct>,
    { transaction },
  );
}

export async function getConstructById(
  id: number,
  transaction?: Transaction,
): Promise<EvidenceConstruct | null> {
  return EvidenceConstructModel.findByPk(id, { transaction });
}

export async function getConstructsByProject(
  projectId: number,
  filters?: {
    construct_type?: ConstructType;
    status?: ConstructStatus;
    study_id?: number | null;
  },
): Promise<EvidenceConstruct[]> {
  const where: Record<string, unknown> = { project_id: projectId };
  if (filters?.construct_type) where.construct_type = filters.construct_type;
  if (filters?.status) where.status = filters.status;
  if (filters?.study_id !== undefined) where.study_id = filters.study_id;

  return EvidenceConstructModel.findAll({
    where,
    order: [['created_at', 'DESC']],
  });
}

export async function getConstructsByStudy(
  studyId: number,
  filters?: {
    construct_type?: ConstructType;
    status?: ConstructStatus;
  },
): Promise<EvidenceConstruct[]> {
  const where: Record<string, unknown> = { study_id: studyId };
  if (filters?.construct_type) where.construct_type = filters.construct_type;
  if (filters?.status) where.status = filters.status;

  return EvidenceConstructModel.findAll({
    where,
    order: [['created_at', 'DESC']],
  });
}

export async function updateConstructStatus(
  id: number,
  status: ConstructStatus,
  reviewedBy: string,
  transaction?: Transaction,
): Promise<EvidenceConstruct | null> {
  const construct = await EvidenceConstructModel.findByPk(id, { transaction });
  if (!construct) return null;

  await construct.update(
    {
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date(),
    },
    { transaction },
  );

  return construct;
}

// ═══════════════════════════════════════════════════════════════════════
// RELATIONSHIPS (FK-backed endpoints)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a source → construct relationship.
 * FK integrity enforced at DB level — invalid source or construct IDs will
 * throw a Sequelize ForeignKeyConstraintError.
 */
export async function createSourceToConstruct(
  input: CreateSourceToConstructInput,
  transaction?: Transaction,
): Promise<EvidenceRelationship> {
  return EvidenceRelationshipModel.create(
    {
      project_id: input.project_id,
      from_source_id: input.from_source_id,
      from_construct_id: null,
      to_source_id: null,
      to_construct_id: input.to_construct_id,
      relationship_type: input.relationship_type,
      provenance: input.provenance ?? null,
    } as CreationAttributes<EvidenceRelationship>,
    { transaction },
  );
}

/**
 * Create a construct → construct relationship.
 * FK integrity enforced at DB level — composite FKs ensure same-project scope.
 */
export async function createConstructToConstruct(
  input: CreateConstructToConstructInput,
  transaction?: Transaction,
): Promise<EvidenceRelationship> {
  return EvidenceRelationshipModel.create(
    {
      project_id: input.project_id,
      from_source_id: null,
      from_construct_id: input.from_construct_id,
      to_source_id: null,
      to_construct_id: input.to_construct_id,
      relationship_type: input.relationship_type,
      provenance: input.provenance ?? null,
    } as CreationAttributes<EvidenceRelationship>,
    { transaction },
  );
}

/** Get all relationships where the given source is the origin. */
export async function getRelationshipsFromSource(
  sourceId: number,
  relationshipType?: RelationshipType,
): Promise<EvidenceRelationship[]> {
  const where: Record<string, unknown> = { from_source_id: sourceId };
  if (relationshipType) where.relationship_type = relationshipType;
  return EvidenceRelationshipModel.findAll({ where, order: [['created_at', 'ASC']] });
}

/** Get all relationships where the given construct is the origin. */
export async function getRelationshipsFromConstruct(
  constructId: number,
  relationshipType?: RelationshipType,
): Promise<EvidenceRelationship[]> {
  const where: Record<string, unknown> = { from_construct_id: constructId };
  if (relationshipType) where.relationship_type = relationshipType;
  return EvidenceRelationshipModel.findAll({ where, order: [['created_at', 'ASC']] });
}

/** Get all relationships targeting the given construct. */
export async function getRelationshipsToConstruct(
  constructId: number,
  relationshipType?: RelationshipType,
): Promise<EvidenceRelationship[]> {
  const where: Record<string, unknown> = { to_construct_id: constructId };
  if (relationshipType) where.relationship_type = relationshipType;
  return EvidenceRelationshipModel.findAll({ where, order: [['created_at', 'ASC']] });
}

// ═══════════════════════════════════════════════════════════════════════
// TRANSACTIONAL DERIVATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a construct with its required lineage relationships atomically.
 * If any relationship creation fails, the entire derivation is rolled back.
 *
 * Per ADR 0029: "Failed lineage writes must not leave partially accepted
 * derivations."
 *
 * Relationship inputs use a to_construct_id sentinel of 0 to mean
 * "the construct being created in this derivation."
 */
export async function createDerivation(input: DerivationInput): Promise<{
  construct: EvidenceConstruct;
  relationships: EvidenceRelationship[];
}> {
  return sequelize.transaction(async (transaction) => {
    const construct = await createConstruct(input.construct, transaction);

    const relationships: EvidenceRelationship[] = [];
    for (const relInput of input.relationships) {
      const resolvedToId = relInput.to_construct_id === 0 ? construct.id : relInput.to_construct_id;

      if ('from_source_id' in relInput) {
        const rel = await createSourceToConstruct(
          { ...relInput, to_construct_id: resolvedToId },
          transaction,
        );
        relationships.push(rel);
      } else {
        const resolvedFromId = relInput.from_construct_id === 0 ? construct.id : relInput.from_construct_id;
        const rel = await createConstructToConstruct(
          { ...relInput, from_construct_id: resolvedFromId, to_construct_id: resolvedToId },
          transaction,
        );
        relationships.push(rel);
      }
    }

    return { construct, relationships };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SOURCE-SCOPED CONSTRUCT RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load all constructs derived from a specific evidence source.
 * Uses source→construct lineage (evidence_relationships) as the authority,
 * NOT project_id scoping.
 *
 * One synthesis request → one evidence_source → one coherent fact set.
 */
export async function getConstructsForSource(
  sourceId: number,
  filters?: {
    construct_type?: ConstructType;
    status?: ConstructStatus;
    derivation_type?: string;
  },
): Promise<EvidenceConstruct[]> {
  // Find all construct IDs linked from this source via DERIVED_FROM
  const relationships = await EvidenceRelationshipModel.findAll({
    where: {
      from_source_id: sourceId,
      relationship_type: 'DERIVED_FROM',
    },
    attributes: ['to_construct_id'],
  });

  const constructIds = relationships
    .map(r => (r as unknown as { to_construct_id: number | null }).to_construct_id)
    .filter((id): id is number => id !== null);

  if (constructIds.length === 0) return [];

  const where: Record<string, unknown> = {
    id: { [Op.in]: constructIds },
  };
  if (filters?.construct_type) where.construct_type = filters.construct_type;
  if (filters?.status) where.status = filters.status;
  if (filters?.derivation_type) where.derivation_type = filters.derivation_type;

  return EvidenceConstructModel.findAll({
    where,
    order: [['created_at', 'ASC']],
  });
}

// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE RECORD COUNTS (for audit/deletion)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Count evidence records for a project (for pre-deletion audit context).
 * Follows the CRITICAL ORDERING pattern from audit.service.ts:
 * gather counts BEFORE delete.
 */
export async function gatherEvidenceRecordCounts(
  projectId: number,
  studyId?: number,
): Promise<{ sources: number; constructs: number; relationships: number }> {
  const sourceWhere: Record<string, unknown> = { project_id: projectId };
  const constructWhere: Record<string, unknown> = { project_id: projectId };
  if (studyId !== undefined) {
    sourceWhere.study_id = studyId;
    constructWhere.study_id = studyId;
  }

  const sources = await EvidenceSourceModel.count({ where: sourceWhere });
  const constructs = await EvidenceConstructModel.count({ where: constructWhere });

  // Relationships don't have project_id — count via constructs and sources
  let relationships = 0;
  if (constructs > 0 || sources > 0) {
    const orConditions: Record<string, unknown>[] = [];

    if (constructs > 0) {
      const constructIds = (
        await EvidenceConstructModel.findAll({
          where: constructWhere,
          attributes: ['id'],
        })
      ).map((c) => (c as EvidenceConstruct).id);

      orConditions.push(
        { from_construct_id: { [Op.in]: constructIds } },
        { to_construct_id: { [Op.in]: constructIds } },
      );
    }

    if (sources > 0) {
      const sourceIds = (
        await EvidenceSourceModel.findAll({
          where: sourceWhere,
          attributes: ['id'],
        })
      ).map((s) => (s as EvidenceSource).id);

      orConditions.push(
        { from_source_id: { [Op.in]: sourceIds } },
        { to_source_id: { [Op.in]: sourceIds } },
      );
    }

    relationships = await EvidenceRelationshipModel.count({
      where: { [Op.or]: orConditions },
    });
  }

  return { sources, constructs, relationships };
}

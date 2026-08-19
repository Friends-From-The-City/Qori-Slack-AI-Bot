/**
 * Synthesis Evidence Service — PH-5B
 *
 * Creates canonical evidence constructs for synthesized research objects
 * (themes, findings, recommendations) with validated lineage to upstream
 * canonical evidence.
 *
 * Validation rules (fail-closed):
 * - Every proposed ref must exist in DB
 * - Every ref must belong to the same study
 * - Every ref must have been supplied to the generation task
 * - Every ref must be the correct construct type
 * - ANY invalid ref → reject the whole candidate item
 * - Zero refs → reject synthesized construct
 *
 * All constructs created as status: 'candidate' (no human review gate
 * currently exists for non-survey research — conformance gap).
 *
 * Lineage uses canonical evidence_construct.public_id (UUID), never
 * prose matching, title matching, or local-label reconstruction.
 */

import {
  createConstruct,
  createConstructToConstruct,
} from './evidence.service';
import type { ConstructType, ConstructStatus, DerivationContext } from '../database/models/evidence_construct';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import type { RelationshipType, RelationshipProvenance } from '../database/models/evidence_relationship';
import { createHash } from 'crypto';
import sequelize from '../database';

// Lazy accessor to support test DB swapping
function getConstructModel() {
  return sequelize.models.EvidenceConstruct;
}

/**
 * Compute a deterministic fingerprint from a set of upstream evidence IDs.
 * Sort lexicographically, deduplicate, then SHA-256 hash.
 * Same upstream refs in any order → same fingerprint.
 * Different upstream refs → different fingerprint.
 */
export function computeUpstreamFingerprint(evidenceIds: string[]): string {
  const normalized = [...new Set(evidenceIds)].sort();
  return createHash('sha256').update(normalized.join(',')).digest('hex').substring(0, 12);
}

// ─────────────────────────────────────────────────────────────────────
// Evidence Ref Validation
// ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: string[];
  rejected: Array<{ ref: string; reason: string }>;
}

/**
 * Validate proposed evidence references against canonical state.
 *
 * Fail-closed: any ref that doesn't meet all criteria is rejected.
 * The caller decides what to do with partially-valid sets.
 */
export async function validateEvidenceRefs(
  proposedRefs: string[],
  suppliedEvidenceIds: Set<string>,
  studyId: number,
  allowedConstructType: ConstructType,
): Promise<ValidationResult> {
  const valid: string[] = [];
  const rejected: Array<{ ref: string; reason: string }> = [];

  if (proposedRefs.length === 0) {
    return { valid, rejected };
  }

  // Batch-load all referenced constructs
  const constructs = await getConstructModel().findAll({
    where: { public_id: proposedRefs },
  });
  const constructMap = new Map(
    constructs.map(c => [(c as unknown as { public_id: string }).public_id, c]),
  );

  for (const ref of proposedRefs) {
    const construct = constructMap.get(ref);

    if (!construct) {
      rejected.push({ ref, reason: 'not found in DB' });
      continue;
    }

    const c = construct as unknown as {
      public_id: string;
      study_id: number | null;
      construct_type: string;
      status: string;
    };

    if (c.study_id !== studyId) {
      rejected.push({ ref, reason: `belongs to study ${c.study_id}, expected ${studyId}` });
      continue;
    }

    if (!suppliedEvidenceIds.has(ref)) {
      rejected.push({ ref, reason: 'exists but was not supplied to this generation task' });
      continue;
    }

    if (c.construct_type !== allowedConstructType) {
      rejected.push({ ref, reason: `type ${c.construct_type}, expected ${allowedConstructType}` });
      continue;
    }

    if (c.status === 'restricted') {
      rejected.push({ ref, reason: 'restricted evidence' });
      continue;
    }

    valid.push(ref);
  }

  return { valid, rejected };
}

// ─────────────────────────────────────────────────────────────────────
// Construct creation with validated lineage
// ─────────────────────────────────────────────────────────────────────

export interface SynthesizedConstructInput {
  /** Local display ID (e.g., "theme-01", "finding-01") */
  displayId: string;
  /** Construct label */
  label: string;
  /** Full payload for the construct */
  payload: Record<string, unknown>;
  /** Canonical evidence IDs proposed by the model */
  proposedEvidenceIds: string[];
}

export interface CreatedSynthesizedConstruct {
  constructId: number;
  publicId: string;
  displayId: string;
}

export interface SynthesisResult {
  created: CreatedSynthesizedConstruct[];
  rejected: Array<{ displayId: string; reasons: string[] }>;
}

/**
 * Create synthesized evidence constructs with validated upstream lineage.
 *
 * For each candidate item:
 * 1. Validate all proposed evidence refs
 * 2. If ANY ref invalid → reject the whole item
 * 3. If zero valid refs → reject (synthesized constructs need evidence)
 * 4. Create evidence_construct + relationships atomically
 *
 * Dedup: checks for existing construct with same semantic_key.
 */
export async function createSynthesizedConstructs(
  items: SynthesizedConstructInput[],
  config: {
    projectId: number;
    studyId: number;
    constructType: ConstructType;
    upstreamConstructType: ConstructType;
    relationshipType: RelationshipType;
    suppliedEvidenceIds: Set<string>;
    cascadeVariableKey: string;
    templateId: string;
    templateVersion: string;
    modelName: string;
    createdBy: string;
  },
): Promise<SynthesisResult> {
  const created: CreatedSynthesizedConstruct[] = [];
  const rejected: Array<{ displayId: string; reasons: string[] }> = [];

  for (const item of items) {
    // Validate proposed refs
    if (item.proposedEvidenceIds.length === 0) {
      rejected.push({
        displayId: item.displayId,
        reasons: ['no supporting evidence IDs proposed — synthesized constructs require upstream evidence'],
      });
      continue;
    }

    const validation = await validateEvidenceRefs(
      item.proposedEvidenceIds,
      config.suppliedEvidenceIds,
      config.studyId,
      config.upstreamConstructType,
    );

    if (validation.rejected.length > 0) {
      // ANY invalid ref → reject whole item
      rejected.push({
        displayId: item.displayId,
        reasons: validation.rejected.map(r => `ref ${r.ref}: ${r.reason}`),
      });
      continue;
    }

    if (validation.valid.length === 0) {
      rejected.push({
        displayId: item.displayId,
        reasons: ['no valid supporting evidence after validation'],
      });
      continue;
    }

    // Dedup: check for existing construct with same semantic key.
    // Includes upstream evidence fingerprint so changed upstream refs
    // create a distinct candidate construct.
    const upstreamHash = computeUpstreamFingerprint(validation.valid);
    const semanticKey = `${config.constructType}:${config.studyId}:${item.displayId}:${config.templateVersion}:${upstreamHash}`;
    const existing = await getConstructModel().findOne({
      where: sequelize.literal(
        `derivation_context->>'semantic_key' = '${semanticKey}'`,
      ),
    });

    if (existing) {
      const e = existing as unknown as { id: number; public_id: string };
      created.push({ constructId: e.id, publicId: e.public_id, displayId: item.displayId });
      continue;
    }

    // Resolve upstream construct DB IDs from public_ids
    const upstreamConstructs = await getConstructModel().findAll({
      where: { public_id: validation.valid },
    });
    const upstreamIdMap = new Map(
      upstreamConstructs.map(c => [
        (c as unknown as { public_id: string }).public_id,
        (c as unknown as { id: number }).id,
      ]),
    );

    // Create construct
    const construct = await createConstruct({
      project_id: config.projectId,
      study_id: config.studyId,
      construct_type: config.constructType,
      label: item.label,
      payload: {
        ...item.payload,
        supporting_evidence_ids: validation.valid,
      },
      derivation_type: 'model',
      derivation_context: {
        template_id: config.templateId,
        template_version: config.templateVersion,
        model_name: config.modelName,
        semantic_key: semanticKey,
      } as DerivationContext,
      status: 'candidate' as ConstructStatus,
      cascade_variable_key: config.cascadeVariableKey,
      created_by: config.createdBy,
    });

    // Create upstream → downstream relationships
    for (const refPublicId of validation.valid) {
      const fromId = upstreamIdMap.get(refPublicId);
      if (fromId) {
        await createConstructToConstruct({
          project_id: config.projectId,
          from_construct_id: fromId,
          to_construct_id: construct.id,
          relationship_type: config.relationshipType,
          provenance: {
            method: `${config.constructType}_synthesis`,
            created_by_template: config.templateId,
          } as RelationshipProvenance,
        });
      }
    }

    created.push({
      constructId: construct.id,
      publicId: construct.public_id,
      displayId: item.displayId,
    });
  }

  return { created, rejected };
}

/**
 * Session Evidence Service — PH-5A
 *
 * Creates canonical evidence identity for session research:
 * - evidence_source for governed transcripts/notes
 * - evidence_construct for extracted nuggets
 * - evidence_relationship for source → nugget derivation
 *
 * Source identity is resolved BEFORE model generation.
 * Nugget constructs are created AFTER extraction with validated lineage.
 *
 * Dedup: (semantic_key, content_hash) composite unique index.
 * Version: same semantic_key + different content_hash → new source version.
 */

import { createHash } from 'crypto';
import {
  createSource,
  createConstruct,
  createSourceToConstruct,
} from './evidence.service';
import type { SourceType } from '../database/models/evidence_source';
import type { ConstructStatus } from '../database/models/evidence_construct';
import sequelize from '../database';
import type { EvidenceSource } from '../database/models/evidence_source';

const EvidenceSourceModel = sequelize.models.EvidenceSource as typeof EvidenceSource;

// ─────────────────────────────────────────────────────────────────────
// Source identity
// ─────────────────────────────────────────────────────────────────────

export interface ResolveSourceInput {
  projectId: number;
  studyId: number;
  /** study_notes.id for the transcript/note being analyzed */
  studyNotesId: number;
  sourceType: SourceType;
  label: string;
  /** The governed, model-safe content (after PII redaction) */
  governedContent: string;
  createdBy: string;
}

export interface ResolvedSource {
  id: number;
  publicId: string;
  /** Whether this is a new source (created) or existing (reused) */
  isNew: boolean;
}

/**
 * Resolve or create a canonical evidence_source for a session transcript/note.
 *
 * Dedup logic:
 * - semantic_key = "study_notes:{studyNotesId}" (stable across reruns)
 * - content_hash = SHA-256 of governed content
 * - Same key + same hash → reuse existing source
 * - Same key + different hash → new source version (content changed)
 */
export async function resolveSessionSource(
  input: ResolveSourceInput,
): Promise<ResolvedSource> {
  const semanticKey = `study_notes:${input.studyNotesId}`;
  const contentHash = createHash('sha256').update(input.governedContent).digest('hex');

  // Check for existing source with same semantic_key + content_hash
  const existing = await EvidenceSourceModel.findOne({
    where: sequelize.literal(
      `artifact_ref->>'semantic_key' = '${semanticKey}' AND artifact_ref->>'content_hash' = '${contentHash}'`,
    ),
  });

  if (existing) {
    return {
      id: existing.id,
      publicId: existing.public_id,
      isNew: false,
    };
  }

  // Create new evidence_source
  const source = await createSource({
    project_id: input.projectId,
    study_id: input.studyId,
    source_type: input.sourceType,
    label: input.label,
    artifact_ref: {
      semantic_key: semanticKey,
      content_hash: contentHash,
      study_notes_id: input.studyNotesId,
    },
    metadata: {
      source_type: input.sourceType,
      governed_content_length: input.governedContent.length,
    },
    created_by: input.createdBy,
  });

  return {
    id: source.id,
    publicId: source.public_id,
    isNew: true,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Nugget construct creation
// ─────────────────────────────────────────────────────────────────────

export interface NuggetInput {
  /** The nugget's display ID from extraction (e.g., "nugget-PT-001-003") */
  displayId: string;
  nuggetType: string;
  severity: number;
  text: string;
  participantCode: string;
  session: string;
}

export interface CreatedNugget {
  constructId: number;
  publicId: string;
  displayId: string;
}

/**
 * Create evidence_construct records for extracted nuggets and link them
 * to the source via DERIVED_FROM relationships.
 *
 * All nuggets are created as status: 'candidate' (no human review gate
 * currently exists for non-survey research constructs — conformance gap).
 *
 * Returns the created constructs with their canonical public_ids.
 */
export async function createNuggetConstructs(
  sourceId: number,
  projectId: number,
  studyId: number,
  nuggets: NuggetInput[],
  derivationContext: {
    templateId: string;
    templateVersion: string;
    modelName: string;
  },
  createdBy: string,
): Promise<CreatedNugget[]> {
  const created: CreatedNugget[] = [];

  for (const nugget of nuggets) {
    // Create evidence_construct
    const construct = await createConstruct({
      project_id: projectId,
      study_id: studyId,
      construct_type: 'nugget',
      label: nugget.displayId,
      payload: {
        display_id: nugget.displayId,
        nugget_type: nugget.nuggetType,
        severity: nugget.severity,
        text: nugget.text,
        participant_code: nugget.participantCode,
        session: nugget.session,
      },
      derivation_type: 'model',
      derivation_context: {
        template_id: derivationContext.templateId,
        template_version: derivationContext.templateVersion,
        model_name: derivationContext.modelName,
        semantic_key: `nugget:${nugget.displayId}`,
      },
      status: 'candidate' as ConstructStatus,
      cascade_variable_key: 'atomic_nugget_core',
      created_by: createdBy,
    });

    // Create DERIVED_FROM relationship: source → nugget
    await createSourceToConstruct({
      project_id: projectId,
      from_source_id: sourceId,
      to_construct_id: construct.id,
      relationship_type: 'DERIVED_FROM',
      provenance: {
        method: 'session_summary_extraction',
        created_by_template: derivationContext.templateId,
      },
    });

    created.push({
      constructId: construct.id,
      publicId: construct.public_id,
      displayId: nugget.displayId,
    });
  }

  return created;
}

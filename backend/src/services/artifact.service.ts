/**
 * Artifact Service — PH-6A
 *
 * Manages canonical artifact identity, derivation fingerprinting,
 * lifecycle (pending→written→failed), and reverse lookup.
 *
 * Key invariants:
 * - public_id is stable identity; GitHub location is mutable metadata
 * - semantic_key = logical_key + derivation_fingerprint (no date)
 * - Last successful location (path/sha/url) is NEVER cleared on retry
 * - Failed retry preserves previous successful location
 * - Navigation resolves to last successfully persisted location
 */

import { createHash } from 'crypto';
import sequelize from '../database';
import type { ResearchArtifact, ArtifactType, ArtifactStatus } from '../database/models/research_artifact';
import type { CreationAttributes } from 'sequelize';

const getArtifactModel = () => sequelize.models.ResearchArtifact as typeof ResearchArtifact;
const getRefModel = () => sequelize.models?.ArtifactEvidenceRef;

// ─────────────────────────────────────────────────────────────────────
// Derivation Fingerprint
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute a derivation fingerprint from canonical upstream inputs.
 *
 * Inputs are sorted, deduplicated, and hashed deterministically.
 * Same canonical input state → same fingerprint.
 * Changed state → different fingerprint.
 *
 * @param inputs - Array of stable identity strings (public_ids, content hashes, etc.)
 * @param templateVersion - Template version (part of derivation identity)
 */
export function computeDerivationFingerprint(
  inputs: string[],
  templateVersion: string,
): string {
  const normalized = [...new Set(inputs)].sort();
  normalized.push(`tv:${templateVersion}`);
  return createHash('sha256').update(normalized.join(',')).digest('hex').substring(0, 16);
}

/**
 * Compute a fingerprint from consumed cascade variable values.
 * Used as transitional fallback when canonical evidence constructs
 * don't exist for a workflow's upstream inputs.
 *
 * Deterministically serializes declared CONSUMES values:
 * - Canonical key ordering
 * - Stable JSON serialization
 * - Excludes UI/transient fields
 */
export function computeCascadeInputFingerprint(
  consumedValues: Record<string, unknown>,
  templateVersion: string,
): string {
  const sortedKeys = Object.keys(consumedValues).sort();
  const canonical: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    canonical[key] = consumedValues[key];
  }
  const serialized = JSON.stringify(canonical);
  const hash = createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  return computeDerivationFingerprint([`cascade:${hash}`], templateVersion);
}

/**
 * Build the full semantic key for an artifact.
 */
export function buildSemanticKey(
  templateId: string,
  projectId: number,
  studyId: number | null,
  artifactType: string,
  derivationFingerprint: string,
): string {
  const scope = studyId != null ? String(studyId) : 'discovery';
  return `${templateId}:${projectId}:${scope}:${artifactType}:${derivationFingerprint}`;
}

// ─────────────────────────────────────────────────────────────────────
// Lifecycle Management
// ─────────────────────────────────────────────────────────────────────

export interface ReserveArtifactInput {
  projectId: number;
  studyId: number | null;
  templateId: string;
  templateVersion: string;
  artifactType: ArtifactType;
  title?: string;
  repo: string;
  semanticKey: string;
  createdBy: string;
}

export interface ReservedArtifact {
  id: number;
  publicId: string;
  isNew: boolean;
  /** Last successful URL if a prior write exists */
  lastSuccessfulUrl: string | null;
}

/**
 * Reserve or reuse an artifact identity.
 *
 * Same semantic_key → reuse existing record (update status to pending).
 * New semantic_key → create new record.
 *
 * CRITICAL: Never clears path/commit_sha/url from a prior successful write.
 */
export async function reserveArtifact(
  input: ReserveArtifactInput,
): Promise<ReservedArtifact> {
  const Model = getArtifactModel();

  const existing = await Model.findOne({
    where: { semantic_key: input.semanticKey },
  });

  if (existing) {
    // Reuse — set to pending but preserve last successful location
    await Model.update(
      {
        status: 'pending' as ArtifactStatus,
        last_write_attempted_at: new Date(),
        updated_at: new Date(),
        // Preserve: path, commit_sha, url (NEVER cleared)
      },
      { where: { id: existing.id } },
    );
    return {
      id: existing.id,
      publicId: existing.public_id,
      isNew: false,
      lastSuccessfulUrl: existing.url,
    };
  }

  const artifact = await Model.create({
    project_id: input.projectId,
    study_id: input.studyId,
    template_id: input.templateId,
    template_version: input.templateVersion,
    artifact_type: input.artifactType,
    title: input.title ?? null,
    repo: input.repo,
    semantic_key: input.semanticKey,
    status: 'pending',
    last_write_attempted_at: new Date(),
    created_by: input.createdBy,
  } as CreationAttributes<ResearchArtifact>);

  return {
    id: artifact.id,
    publicId: artifact.public_id,
    isNew: true,
    lastSuccessfulUrl: null,
  };
}

/**
 * Record successful GitHub write. Updates location metadata.
 */
export async function recordWriteSuccess(
  artifactId: number,
  location: { path: string; commitSha: string; url: string },
): Promise<void> {
  const Model = getArtifactModel();
  await Model.update(
    {
      path: location.path,
      commit_sha: location.commitSha,
      url: location.url,
      status: 'written' as ArtifactStatus,
      last_write_error: null,
      updated_at: new Date(),
    },
    { where: { id: artifactId } },
  );
}

/**
 * Record failed GitHub write. Preserves last successful location.
 */
export async function recordWriteFailure(
  artifactId: number,
  error: string,
): Promise<void> {
  const Model = getArtifactModel();
  await Model.update(
    {
      status: 'failed' as ArtifactStatus,
      last_write_error: error,
      updated_at: new Date(),
      // path/commit_sha/url preserved from last success
    },
    { where: { id: artifactId } },
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reverse Lookup
// ─────────────────────────────────────────────────────────────────────

export async function getArtifactByPublicId(publicId: string): Promise<ResearchArtifact | null> {
  return getArtifactModel().findOne({ where: { public_id: publicId } });
}

export async function getArtifactByLocation(
  repo: string, ref: string, path: string,
): Promise<ResearchArtifact | null> {
  return getArtifactModel().findOne({ where: { repo, ref, path } });
}

export async function getArtifactsByStudy(studyId: number): Promise<ResearchArtifact[]> {
  return getArtifactModel().findAll({
    where: { study_id: studyId },
    order: [['created_at', 'DESC']],
  });
}

export async function getArtifactsByProject(projectId: number): Promise<ResearchArtifact[]> {
  return getArtifactModel().findAll({
    where: { project_id: projectId },
    order: [['created_at', 'DESC']],
  });
}

export async function getArtifactsByTemplate(
  projectId: number, templateId: string,
): Promise<ResearchArtifact[]> {
  return getArtifactModel().findAll({
    where: { project_id: projectId, template_id: templateId },
    order: [['created_at', 'DESC']],
  });
}

// ─────────────────────────────────────────────────────────────────────
// Evidence Attachment
// ─────────────────────────────────────────────────────────────────────

/**
 * Attach canonical evidence construct refs to an artifact.
 * Idempotent: unique constraint on (artifact_id, construct_id, ref_type).
 */
export async function attachEvidenceRefs(
  artifactId: number,
  constructIds: number[],
  refType: string = 'reflects',
  modelOverride?: any,
): Promise<number> {
  const RefModel = modelOverride ?? getRefModel();
  if (!RefModel) return 0;

  let attached = 0;
  for (const constructId of constructIds) {
    try {
      await RefModel.create({
        artifact_id: artifactId,
        construct_id: constructId,
        ref_type: refType,
      });
      attached++;
    } catch (err) {
      // Unique constraint violation = already attached (idempotent)
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('unique') && !msg.includes('duplicate')) throw err;
    }
  }
  return attached;
}

/**
 * PH-6C: Attach evidence refs after verifying preconditions.
 *
 * Verifies:
 * - artifactPublicId exists and resolves to a record
 * - artifact.status === 'written' (GitHub write succeeded)
 * - constructIds is non-empty
 *
 * On failure: emits structured error log with context. Does NOT throw
 * or corrupt canonical evidence/artifact state.
 *
 * Idempotent: safe to call on rerun (same semantic artifact + constructs).
 */
export async function attachEvidenceRefsVerified(
  artifactPublicId: string | undefined,
  constructIds: number[],
  context: {
    projectId: number;
    studyId: number | null;
    templateId: string;
    workflow: string;
  },
  refType: string = 'reflects',
): Promise<{ attached: number; skipped: boolean; reason?: string }> {
  if (!artifactPublicId) {
    return { attached: 0, skipped: true, reason: 'no artifact public_id' };
  }

  if (constructIds.length === 0) {
    return { attached: 0, skipped: true, reason: 'no construct IDs to attach' };
  }

  try {
    const artifact = await getArtifactByPublicId(artifactPublicId);
    if (!artifact) {
      const reason = `artifact ${artifactPublicId} not found`;
      console.error(
        `[artifact-evidence-ref] Attachment skipped: ${reason}` +
        ` | project=${context.projectId} study=${context.studyId}` +
        ` | template=${context.templateId} workflow=${context.workflow}` +
        ` | intended_refs=${constructIds.length}`,
      );
      return { attached: 0, skipped: true, reason };
    }

    if (artifact.status !== 'written') {
      const reason = `artifact ${artifactPublicId} status=${artifact.status}, expected written`;
      console.error(
        `[artifact-evidence-ref] Attachment skipped: ${reason}` +
        ` | project=${context.projectId} study=${context.studyId}` +
        ` | template=${context.templateId} workflow=${context.workflow}` +
        ` | intended_refs=${constructIds.length}`,
      );
      return { attached: 0, skipped: true, reason };
    }

    const attached = await attachEvidenceRefs(artifact.id, constructIds, refType);
    return { attached, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[artifact-evidence-ref] Attachment failed: ${message}` +
      ` | artifact=${artifactPublicId}` +
      ` | project=${context.projectId} study=${context.studyId}` +
      ` | template=${context.templateId} workflow=${context.workflow}` +
      ` | intended_refs=${constructIds.length}`,
    );
    return { attached: 0, skipped: true, reason: message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Evidence Ref Queries (PH-6C)
// ─────────────────────────────────────────────────────────────────────

/**
 * Get all evidence construct refs attached to an artifact.
 */
export async function getEvidenceRefsForArtifact(
  artifactId: number,
): Promise<Array<{ construct_id: number; ref_type: string }>> {
  const RefModel = getRefModel();
  if (!RefModel) return [];
  const refs = await RefModel.findAll({ where: { artifact_id: artifactId } });
  return refs.map(r => ({
    construct_id: (r as unknown as { construct_id: number }).construct_id,
    ref_type: (r as unknown as { ref_type: string }).ref_type,
  }));
}

/**
 * Get all artifacts that reflect a given evidence construct.
 */
export async function getArtifactsForConstruct(
  constructId: number,
): Promise<ResearchArtifact[]> {
  const RefModel = getRefModel();
  if (!RefModel) return [];
  const refs = await RefModel.findAll({ where: { construct_id: constructId } });
  const artifactIds = refs.map(r => (r as unknown as { artifact_id: number }).artifact_id);
  if (artifactIds.length === 0) return [];
  const Model = getArtifactModel();
  return Model.findAll({ where: { id: artifactIds } });
}

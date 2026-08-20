/**
 * Artifact Application Service — PLAT-3 / UX-2B
 *
 * Artifact lifecycle operations with separation of:
 * - Canonical workflow status (research lifecycle)
 * - Projection/publication status (external system state)
 *
 * A GitHub failure never changes canonical research status.
 *
 * UX-2B additions:
 * - retryPublication uses publication_status (not workflow status)
 * - getPublicationStatus returns full contract fields
 * - Idempotency: retry of already-published artifact is a no-op
 * - No content regeneration on retry
 */

import type { ApplicationContext } from '../types/application-context';
import type { ArtifactResource, PublicationStatusResource } from '../types/api-responses';
import { assertProjectAccessByActor } from '../services/authorization.service';
import {
  resourceNotFound,
  invalidState,
  artifactNotApproved,
  publicationNotRetryable,
} from '../types/api-errors';
import sequelize from '../database';

const ArtifactModel = sequelize.models.ResearchArtifact;

/**
 * Get a single artifact by public_id, verifying org scope.
 */
export async function getArtifact(
  ctx: ApplicationContext,
  publicId: string,
): Promise<ArtifactResource> {
  const artifact = await resolveArtifact(publicId, ctx);
  return mapArtifactResource(artifact);
}

/**
 * Get artifact content/preview.
 */
export async function getArtifactPreview(
  ctx: ApplicationContext,
  publicId: string,
): Promise<{ content: string | null; url: string | null }> {
  const artifact = await resolveArtifact(publicId, ctx);

  return {
    content: null, // Full content retrieval from GitHub deferred
    url: artifact.url || null,
  };
}

/**
 * Get artifact provenance (evidence references).
 */
export async function getArtifactProvenance(
  ctx: ApplicationContext,
  publicId: string,
): Promise<{ artifact_public_id: string; semantic_key: string; template_id: string }> {
  const artifact = await resolveArtifact(publicId, ctx);

  return {
    artifact_public_id: artifact.public_id,
    semantic_key: artifact.semantic_key,
    template_id: artifact.template_id,
  };
}

/**
 * Approve an artifact (transition draft/needs_review → approved).
 */
export async function approveArtifact(
  ctx: ApplicationContext,
  publicId: string,
): Promise<ArtifactResource> {
  const artifact = await resolveArtifact(publicId, ctx);
  const currentStatus = mapWorkflowStatus(artifact.status);

  if (currentStatus !== 'draft' && currentStatus !== 'needs_review') {
    throw invalidState(`Cannot approve artifact in '${currentStatus}' state`);
  }

  await artifact.update({ status: 'approved' });
  return mapArtifactResource(artifact);
}

/**
 * Publish an artifact to GitHub (approved → published).
 * If GitHub fails, publication_status becomes projection_failed.
 * Canonical workflow status remains approved — never changes on GitHub failure.
 */
export async function publishArtifact(
  ctx: ApplicationContext,
  publicId: string,
): Promise<ArtifactResource> {
  const artifact = await resolveArtifact(publicId, ctx);
  const workflowStatus = mapWorkflowStatus(artifact.status);

  // Must be approved to publish
  if (workflowStatus !== 'approved' && artifact.status !== 'written') {
    throw artifactNotApproved(
      `Cannot publish artifact in '${workflowStatus}' state — must be approved`,
    );
  }

  // Mark publishing intent
  await artifact.update({
    publication_status: 'publishing',
    last_write_attempted_at: new Date(),
  });

  return mapArtifactResource(artifact);
}

/**
 * Retry a failed publication.
 *
 * Invariants:
 * - Only retryable when publication_status = 'projection_failed'
 * - Does NOT regenerate research content
 * - Does NOT alter approved workflow status
 * - Does NOT duplicate GitHub output (uses semantic_key idempotency)
 * - Preserves last successful location metadata
 */
export async function retryPublication(
  ctx: ApplicationContext,
  publicId: string,
): Promise<ArtifactResource> {
  const artifact = await resolveArtifact(publicId, ctx);

  const pubStatus = artifact.publication_status || mapPublicationStatus(artifact.status);

  // Idempotent: already published → no-op
  if (pubStatus === 'published') {
    return mapArtifactResource(artifact);
  }

  // Only retry from projection_failed
  if (pubStatus !== 'projection_failed') {
    throw publicationNotRetryable(
      `Publication status is '${pubStatus}' — only 'projection_failed' is retryable`,
    );
  }

  // Transition: projection_failed → publishing
  // Workflow status stays as-is (approved/written). Content not regenerated.
  const retryTimestamp = new Date();
  await artifact.update({
    publication_status: 'publishing',
    last_write_error: null,
    last_write_attempted_at: retryTimestamp,
  });

  // Return with updated publication_status (update may not mutate in-memory)
  const result = mapArtifactResource(artifact);
  result.publication_status = 'publishing';
  return result;
}

/**
 * Get publication status — full contract per UX-2B.
 */
export async function getPublicationStatus(
  ctx: ApplicationContext,
  publicId: string,
): Promise<PublicationStatusResource> {
  const artifact = await resolveArtifact(publicId, ctx);
  const pubStatus = artifact.publication_status || mapPublicationStatus(artifact.status);

  return {
    public_id: artifact.public_id,
    workflow_status: mapWorkflowStatus(artifact.status),
    publication_status: pubStatus,
    external_target: artifact.repo || null,
    external_reference: artifact.url || null,
    last_attempt_at: artifact.last_write_attempted_at?.toISOString() || null,
    retryable: pubStatus === 'projection_failed',
    error_code: sanitizeErrorCode(artifact.last_write_error),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

async function resolveArtifact(publicId: string, ctx: ApplicationContext) {
  const artifact = await ArtifactModel.findOne({
    where: { public_id: publicId },
  });

  if (!artifact) throw resourceNotFound('Artifact');

  // Verify org scope via project
  const project = await sequelize.models.Project.findByPk(
    (artifact as any).project_id,
    { attributes: ['id', 'organization_id'] },
  );

  if (!project || (project as any).organization_id !== ctx.organization.id) {
    throw resourceNotFound('Artifact');
  }

  await assertProjectAccessByActor(ctx.actor.id, (artifact as any).project_id, ctx.organization.id);

  return artifact as any;
}

function mapWorkflowStatus(status: string): string {
  switch (status) {
    case 'pending': return 'generating';
    case 'written': return 'draft';
    case 'failed': return 'draft';
    default: return status;
  }
}

function mapPublicationStatus(status: string): string {
  switch (status) {
    case 'pending': return 'not_published';
    case 'written': return 'published';
    case 'failed': return 'projection_failed';
    default: return 'not_published';
  }
}

/**
 * Sanitize error messages — strip raw GitHub/DB errors, return a safe code.
 * No provider secrets or raw error messages exposed.
 */
function sanitizeErrorCode(rawError: string | null): string | null {
  if (!rawError) return null;

  const lower = rawError.toLowerCase();
  if (lower.includes('rate limit')) return 'RATE_LIMITED';
  if (lower.includes('not found') || lower.includes('404')) return 'TARGET_NOT_FOUND';
  if (lower.includes('permission') || lower.includes('403')) return 'PERMISSION_DENIED';
  if (lower.includes('conflict') || lower.includes('409')) return 'CONFLICT';
  if (lower.includes('timeout')) return 'TIMEOUT';
  return 'PROJECTION_FAILED';
}

function mapArtifactResource(a: any): ArtifactResource {
  return {
    public_id: a.public_id,
    artifact_type: a.artifact_type,
    title: a.title,
    workflow_status: mapWorkflowStatus(a.status),
    publication_status: a.publication_status || mapPublicationStatus(a.status),
    template_id: a.template_id,
    template_version: a.template_version,
    project_public_id: '', // Resolved separately
    study_public_id: null,
    created_at: a.created_at?.toISOString() || new Date().toISOString(),
    updated_at: a.updated_at?.toISOString() || new Date().toISOString(),
  };
}

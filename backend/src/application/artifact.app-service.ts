/**
 * Artifact Application Service — PLAT-3
 *
 * Artifact lifecycle operations with separation of:
 * - Canonical workflow status (research lifecycle)
 * - Projection/publication status (external system state)
 *
 * A GitHub failure never changes canonical research status.
 */

import type { ApplicationContext } from '../types/application-context';
import type { ArtifactResource } from '../types/api-responses';
import { assertProjectAccessByActor } from '../services/authorization.service';
import { resourceNotFound, authorizationDenied, invalidState } from '../types/api-errors';
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
 * Approve an artifact (transition needs_review → approved).
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
 * Canonical workflow status remains approved.
 */
export async function publishArtifact(
  ctx: ApplicationContext,
  publicId: string,
): Promise<ArtifactResource> {
  const artifact = await resolveArtifact(publicId, ctx);
  const currentStatus = mapWorkflowStatus(artifact.status);

  if (currentStatus !== 'approved') {
    throw invalidState(`Cannot publish artifact in '${currentStatus}' state — must be approved`);
  }

  // Publication attempt — GitHub write would happen here
  // For now, mark the intent. Actual GitHub write deferred to existing handler flow.
  await artifact.update({
    status: 'approved', // Canonical status unchanged
    // publication_status will be set when the column exists (Phase 6 migration)
  });

  return mapArtifactResource(artifact);
}

/**
 * Retry a failed publication.
 */
export async function retryPublication(
  ctx: ApplicationContext,
  publicId: string,
): Promise<ArtifactResource> {
  const artifact = await resolveArtifact(publicId, ctx);

  // Only retry if publication previously failed
  if (artifact.status !== 'failed') {
    throw invalidState('No failed publication to retry');
  }

  // Reset to approved — a retry mechanism would re-attempt GitHub write
  await artifact.update({ status: 'approved', last_write_error: null });
  return mapArtifactResource(artifact);
}

/**
 * Get publication status.
 */
export async function getPublicationStatus(
  ctx: ApplicationContext,
  publicId: string,
): Promise<{ workflow_status: string; publication_status: string; last_error: string | null; last_attempted_at: string | null }> {
  const artifact = await resolveArtifact(publicId, ctx);

  return {
    workflow_status: mapWorkflowStatus(artifact.status),
    publication_status: (artifact as any).publication_status || mapPublicationStatus(artifact.status),
    last_error: artifact.last_write_error,
    last_attempted_at: artifact.last_write_attempted_at?.toISOString() || null,
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

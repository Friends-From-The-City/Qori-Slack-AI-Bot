/**
 * Study Application Service — PLAT-3
 *
 * Organization-scoped study operations.
 */

import type { ApplicationContext } from '../types/application-context';
import type { StudyResource, ArtifactResource, EvidenceSourceResource, EvidenceConstructResource } from '../types/api-responses';
import { assertStudyAccessByActor } from '../services/authorization.service';
import { resourceNotFound } from '../types/api-errors';
import sequelize from '../database';

/**
 * Get a single study by public_id, verifying org scope and membership.
 */
export async function getStudy(ctx: ApplicationContext, studyPublicId: string): Promise<StudyResource> {
  const study = await resolveStudy(studyPublicId, ctx.organization.id);
  if (!study) throw resourceNotFound('Study');

  await assertStudyAccessByActor(ctx.actor.id, study.id, ctx.organization.id);

  return {
    public_id: study.public_id || String(study.id),
    name: study.name,
    status: study.status || 'active',
    project_public_id: study.project?.slug || '',
    created_at: study.created_at?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Get evidence sources for a study.
 */
export async function getStudySources(
  ctx: ApplicationContext,
  studyPublicId: string,
): Promise<EvidenceSourceResource[]> {
  const study = await resolveStudy(studyPublicId, ctx.organization.id);
  if (!study) throw resourceNotFound('Study');

  await assertStudyAccessByActor(ctx.actor.id, study.id, ctx.organization.id);

  const EvidenceSourceModel = sequelize.models.EvidenceSource;
  if (!EvidenceSourceModel) return [];

  const sources = await EvidenceSourceModel.findAll({
    where: { project_id: study.project_id },
    order: [['created_at', 'DESC']],
  });

  return sources.map((s: any) => ({
    public_id: s.public_id || String(s.id),
    semantic_key: s.semantic_key,
    source_type: s.source_type || 'unknown',
    status: s.status || 'active',
    project_public_id: study.project?.slug || '',
    created_at: s.created_at?.toISOString() || new Date().toISOString(),
  }));
}

/**
 * Get evidence constructs for a study.
 */
export async function getStudyEvidence(
  ctx: ApplicationContext,
  studyPublicId: string,
): Promise<EvidenceConstructResource[]> {
  const study = await resolveStudy(studyPublicId, ctx.organization.id);
  if (!study) throw resourceNotFound('Study');

  await assertStudyAccessByActor(ctx.actor.id, study.id, ctx.organization.id);

  const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
  if (!EvidenceConstructModel) return [];

  const constructs = await EvidenceConstructModel.findAll({
    where: { project_id: study.project_id },
    order: [['created_at', 'DESC']],
  });

  return constructs.map((c: any) => ({
    public_id: c.public_id || String(c.id),
    semantic_key: c.semantic_key,
    construct_type: c.construct_type || 'unknown',
    label: c.label || null,
    status: c.status || 'active',
    source_public_id: '', // Resolved via source_id FK
    created_at: c.created_at?.toISOString() || new Date().toISOString(),
  }));
}

/**
 * Get artifacts for a study.
 */
export async function getStudyArtifacts(
  ctx: ApplicationContext,
  studyPublicId: string,
): Promise<ArtifactResource[]> {
  const study = await resolveStudy(studyPublicId, ctx.organization.id);
  if (!study) throw resourceNotFound('Study');

  await assertStudyAccessByActor(ctx.actor.id, study.id, ctx.organization.id);

  const ArtifactModel = sequelize.models.ResearchArtifact;
  if (!ArtifactModel) return [];

  const artifacts = await ArtifactModel.findAll({
    where: { study_id: study.id },
    order: [['created_at', 'DESC']],
  });

  return artifacts.map((a: any) => ({
    public_id: a.public_id,
    artifact_type: a.artifact_type,
    title: a.title,
    workflow_status: mapWorkflowStatus(a.status),
    publication_status: a.publication_status || mapPublicationStatus(a.status),
    template_id: a.template_id,
    template_version: a.template_version,
    project_public_id: study.project?.slug || '',
    study_public_id: study.public_id || String(study.id),
    created_at: a.created_at?.toISOString() || new Date().toISOString(),
    updated_at: a.updated_at?.toISOString() || new Date().toISOString(),
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────

async function resolveStudy(publicIdOrId: string, organizationId: number) {
  const StudyModel = sequelize.models.ResearchStudy;
  const ProjectModel = sequelize.models.Project;

  // Try by public_id first, then by numeric ID
  let study: any = null;
  study = await StudyModel.findOne({
    where: { public_id: publicIdOrId },
    include: [{ model: ProjectModel, as: 'project', attributes: ['id', 'slug', 'organization_id'] }],
  });

  if (!study) {
    const numId = Number(publicIdOrId);
    if (Number.isFinite(numId) && numId > 0) {
      study = await StudyModel.findByPk(numId, {
        include: [{ model: ProjectModel, as: 'project', attributes: ['id', 'slug', 'organization_id'] }],
      });
    }
  }

  if (!study || !study.project) return null;

  // Verify organization scope
  if (study.project.organization_id !== organizationId) return null;

  return study;
}

function mapWorkflowStatus(status: string): string {
  // Map legacy status values to canonical workflow status
  switch (status) {
    case 'pending': return 'generating';
    case 'written': return 'draft';
    case 'failed': return 'draft'; // Failed write doesn't change research status
    default: return status;
  }
}

function mapPublicationStatus(status: string): string {
  // Derive publication status from legacy status
  switch (status) {
    case 'pending': return 'not_published';
    case 'written': return 'published';
    case 'failed': return 'projection_failed';
    default: return 'not_published';
  }
}

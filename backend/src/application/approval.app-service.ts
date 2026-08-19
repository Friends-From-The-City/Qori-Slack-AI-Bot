/**
 * Approval Application Service — PLAT-3
 *
 * Extracted from approvalFlowHandler.ts and requestChangesHandler.ts
 * Orchestrates document approval workflows: brief approval, plan approval,
 * request-changes flow, and status tracking. Delegates to authorization
 * service for approver identity verification.
 */

import type { ApplicationContext } from '../types/application-context';
import { invalidState, resourceNotFound } from '../types/api-errors';
import { assertProjectAccessByActor } from '../services/authorization.service';
import { addStudyStatus } from '../services/study-status.service';
import sequelize from '../database';

// ─── Input/Output Types ──────────────────────────────────────────

export type DocumentType = 'brief' | 'plan' | 'discussion';
export type ApprovalAction = 'approve' | 'request_changes' | 'mark_complete';

export interface ApprovalInput {
  /** The document type being approved */
  documentType: DocumentType;
  /** Study to approve/reject */
  studyId: number;
  projectId: number;
  studyName: string;
  /** The action to perform */
  action: ApprovalAction;
  /** Feedback note (required for request_changes) */
  comment?: string;
  /** URL of the document being reviewed */
  documentUrl?: string;
}

export interface ApprovalResult {
  /** Study ID that was acted on */
  studyId: number;
  studyName: string;
  /** Document type */
  documentType: DocumentType;
  /** Previous status */
  previousStatus: string;
  /** New status after action */
  newStatus: string;
  /** Action performed */
  action: ApprovalAction;
  /** Who should be notified (the study creator) */
  notifyUserId: string | null;
}

export interface ArtifactApprovalInput {
  /** Artifact public ID */
  artifactPublicId: string;
  /** Action to perform */
  action: ApprovalAction;
  /** Feedback comment */
  comment?: string;
}

export interface ArtifactApprovalResult {
  artifactPublicId: string;
  previousStatus: string;
  newStatus: string;
  action: ApprovalAction;
}

// ─── Study Document Approval ────────────────────────────────────

/**
 * Execute an approval action on a study document (brief or plan).
 *
 * This is the primary approval flow used by researchers/stakeholders.
 * It updates the study's brief_status or plan status and creates
 * a study status record for audit trail.
 */
export async function executeDocumentApproval(
  ctx: ApplicationContext,
  input: ApprovalInput,
): Promise<ApprovalResult> {
  // Authorization: actor must have project access
  await assertProjectAccessByActor(ctx.actor.id, input.projectId, ctx.organization.id);

  // Verify approver identity
  const ProjectMembershipModel = sequelize.models.ProjectMembership;
  if (ProjectMembershipModel) {
    const membership = await ProjectMembershipModel.findOne({
      where: { actor_id: ctx.actor.id, project_id: input.projectId },
    }) as { role: string } | null;

    if (!membership || (membership.role !== 'owner' && membership.role !== 'stakeholder')) {
      throw invalidState('Only project owners or stakeholders can approve documents');
    }
  }

  // Load study
  const ResearchStudyModel = sequelize.models.ResearchStudy;
  const study = await ResearchStudyModel.findByPk(input.studyId) as any;
  if (!study) throw resourceNotFound('Study');

  // Verify study belongs to the project
  if (study.project_id !== input.projectId) {
    throw resourceNotFound('Study');
  }

  let previousStatus: string;
  let newStatus: string;
  const notifyUserId: string | null = study.created_by || null;

  if (input.documentType === 'brief') {
    previousStatus = study.brief_status || 'pending_approval';

    switch (input.action) {
      case 'approve': {
        if (previousStatus === 'approved') {
          throw invalidState('Brief has already been approved');
        }
        if (previousStatus === 'changes_requested') {
          throw invalidState('Changes were requested — wait for researcher to resubmit');
        }
        newStatus = 'approved';
        await study.update({
          brief_status: 'approved',
          brief_approved_at: new Date(),
          brief_approved_by: ctx.actor.publicId,
        });
        break;
      }
      case 'request_changes': {
        if (previousStatus === 'changes_requested') {
          throw invalidState('Changes have already been requested');
        }
        newStatus = 'changes_requested';
        await study.update({
          brief_status: 'changes_requested',
        });
        break;
      }
      default:
        throw invalidState(`Unsupported action '${input.action}' for brief`);
    }
  } else {
    // Plan/discussion approval — uses status field on study_status records
    previousStatus = 'pending_approval';

    switch (input.action) {
      case 'approve':
        newStatus = 'approved';
        break;
      case 'request_changes':
        newStatus = 'changes_requested';
        if (!input.comment) {
          throw invalidState('Comment is required when requesting changes');
        }
        break;
      default:
        throw invalidState(`Unsupported action '${input.action}' for ${input.documentType}`);
    }
  }

  // Create status record for audit trail
  await addStudyStatus({
    study_id: input.studyId,
    path: input.documentUrl || '',
    status: newStatus,
    created_by: ctx.actor.publicId,
  });

  return {
    studyId: input.studyId,
    studyName: input.studyName,
    documentType: input.documentType,
    previousStatus,
    newStatus,
    action: input.action,
    notifyUserId,
  };
}

// ─── Artifact-Level Approval ────────────────────────────────────

/**
 * Execute an approval action on an artifact (research artifact record).
 *
 * This operates on the ResearchArtifact model and is used for
 * artifact lifecycle management independent of study documents.
 */
export async function executeArtifactApproval(
  ctx: ApplicationContext,
  input: ArtifactApprovalInput,
): Promise<ArtifactApprovalResult> {
  const ArtifactModel = sequelize.models.ResearchArtifact;

  const artifact = await ArtifactModel.findOne({
    where: { public_id: input.artifactPublicId },
  }) as any;

  if (!artifact) throw resourceNotFound('Artifact');

  // Verify org scope and membership
  const project = await sequelize.models.Project.findByPk(artifact.project_id, {
    attributes: ['id', 'organization_id'],
  }) as any;

  if (!project || project.organization_id !== ctx.organization.id) {
    throw resourceNotFound('Artifact');
  }

  await assertProjectAccessByActor(ctx.actor.id, project.id, ctx.organization.id);

  const previousStatus = artifact.status;

  switch (input.action) {
    case 'approve': {
      if (previousStatus !== 'written' && previousStatus !== 'pending') {
        throw invalidState(`Cannot approve artifact in '${previousStatus}' state`);
      }
      await artifact.update({ status: 'approved' });
      break;
    }
    case 'request_changes': {
      if (previousStatus !== 'written' && previousStatus !== 'approved') {
        throw invalidState(`Cannot request changes on artifact in '${previousStatus}' state`);
      }
      await artifact.update({ status: 'written' });
      break;
    }
    case 'mark_complete': {
      if (previousStatus !== 'approved') {
        throw invalidState(`Cannot mark complete an artifact in '${previousStatus}' state`);
      }
      // Canonical status stays approved; publication status handled separately
      break;
    }
  }

  return {
    artifactPublicId: input.artifactPublicId,
    previousStatus,
    newStatus: artifact.status,
    action: input.action,
  };
}

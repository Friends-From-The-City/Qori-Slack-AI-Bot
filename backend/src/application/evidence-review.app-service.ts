/**
 * Evidence Review Application Service — UX-2B
 *
 * Review lifecycle for reviewable evidence constructs (findings,
 * recommendations, themes). Enforces:
 *
 * - Only reviewable construct types accepted
 * - Deterministic state transitions (candidate → accepted/rejected)
 * - Project-scoped authorization via actor membership
 * - Audit logging for every review decision
 * - Staleness orthogonal to review status
 *
 * State machine:
 *   candidate → accepted   (accept)
 *   candidate → rejected   (reject)
 *   accepted  → rejected   (reject — re-review, new audit record)
 *   rejected  → accepted   (accept — re-review, new audit record)
 *
 * "overridden" is a terminal state set by governance, not by review.
 */

import type { ApplicationContext } from '../types/application-context';
import type { ReviewResult } from '../types/api-responses';
import type { ConstructType, ConstructStatus } from '../database/models/evidence_construct';
import type { AuditAction } from '../database/models/disposition_audit_log';
import {
  assertProjectAccessByActor,
} from '../services/authorization.service';
import {
  resourceNotFound,
  reviewNotAllowed,
  invalidReviewTransition,
  authorizationDenied,
} from '../types/api-errors';
import sequelize from '../database';

// ─── Constants ─────────────────────────────────────────────────────

/** Construct types that support review operations. */
const REVIEWABLE_TYPES: ReadonlySet<ConstructType> = new Set([
  'finding',
  'recommendation',
  'theme',
]);

/** Valid review decisions. */
export type ReviewDecision = 'accept' | 'reject';

/** Map decision → target status. */
const DECISION_STATUS: Record<ReviewDecision, ConstructStatus> = {
  accept: 'accepted',
  reject: 'rejected',
};

/**
 * States from which a review decision is allowed.
 * "overridden" is excluded — governance overrides are final.
 */
const REVIEWABLE_STATUSES: ReadonlySet<ConstructStatus> = new Set([
  'candidate',
  'accepted',
  'rejected',
]);

/** Map construct_type → audit action. */
const AUDIT_ACTION_MAP: Partial<Record<ConstructType, AuditAction>> = {
  finding: 'review_finding',
  recommendation: 'review_recommendation',
  // theme reviews use review_finding action (closest semantic match)
  theme: 'review_finding',
};

// ─── Public API ────────────────────────────────────────────────────

/**
 * Review a finding — accept or reject.
 */
export async function reviewFinding(
  ctx: ApplicationContext,
  publicId: string,
  decision: ReviewDecision,
): Promise<ReviewResult> {
  return reviewConstruct(ctx, publicId, 'finding', decision);
}

/**
 * Review a recommendation — accept or reject.
 */
export async function reviewRecommendation(
  ctx: ApplicationContext,
  publicId: string,
  decision: ReviewDecision,
): Promise<ReviewResult> {
  return reviewConstruct(ctx, publicId, 'recommendation', decision);
}

// ─── Core Review Logic ─────────────────────────────────────────────

/**
 * Review an evidence construct with full authorization, validation,
 * and audit logging.
 */
async function reviewConstruct(
  ctx: ApplicationContext,
  publicId: string,
  expectedType: ConstructType,
  decision: ReviewDecision,
): Promise<ReviewResult> {
  const EvidenceConstructModel = sequelize.models.EvidenceConstruct;
  const DispositionAuditLogModel = sequelize.models.DispositionAuditLog;

  // 1. Resolve construct by public_id
  const construct = await EvidenceConstructModel.findOne({
    where: { public_id: publicId },
  }) as any;

  if (!construct) {
    throw resourceNotFound('Evidence construct');
  }

  // 2. Verify construct type matches expected
  if (construct.construct_type !== expectedType) {
    throw resourceNotFound('Evidence construct');
  }

  // 3. Verify reviewability
  if (!REVIEWABLE_TYPES.has(construct.construct_type)) {
    throw reviewNotAllowed(
      `Construct type '${construct.construct_type}' does not support review operations`,
    );
  }

  // 4. Verify org scope + project access
  const project = await sequelize.models.Project.findByPk(construct.project_id, {
    attributes: ['id', 'organization_id', 'name'],
  }) as any;

  if (!project || project.organization_id !== ctx.organization.id) {
    throw resourceNotFound('Evidence construct');
  }

  await assertProjectAccessByActor(ctx.actor.id, project.id, ctx.organization.id);

  // 5. Validate state transition
  const currentStatus: ConstructStatus = construct.status;
  const targetStatus = DECISION_STATUS[decision];

  if (!REVIEWABLE_STATUSES.has(currentStatus)) {
    throw invalidReviewTransition(
      `Cannot review construct in '${currentStatus}' state — governance overrides are final`,
    );
  }

  // Idempotent: re-submitting the same decision is a no-op (still logs audit)
  const previousStatus = currentStatus;

  // 6. Apply review within transaction (construct update + audit log)
  const now = new Date();

  await sequelize.transaction(async (transaction) => {
    await construct.update(
      {
        status: targetStatus,
        reviewed_by: ctx.actor.publicId,
        reviewed_at: now,
      },
      { transaction },
    );

    // Audit log
    const auditAction = AUDIT_ACTION_MAP[construct.construct_type as ConstructType] || 'review_finding';

    await DispositionAuditLogModel.create(
      {
        action: auditAction,
        record_type: 'evidence_construct',
        target_id: construct.id,
        target_identifier: construct.public_id,
        project_id: project.id,
        project_name: project.name,
        study_id: construct.study_id,
        study_name: null, // Non-critical denorm; acceptable null
        actor_user_id: ctx.actor.publicId,
        actor_role: null,
        authorization_basis: 'project_membership',
        outcome: 'success',
        outcome_detail: `${decision}: ${previousStatus} → ${targetStatus}`,
      } as any,
      { transaction },
    );
  });

  // 7. Gather traceability summary
  const traceabilitySummary = await gatherTraceabilityCounts(construct.id);

  return {
    public_id: construct.public_id,
    construct_type: construct.construct_type,
    review_status: targetStatus,
    previous_status: previousStatus,
    reviewed_at: now.toISOString(),
    reviewed_by_display_name: ctx.actor.displayName,
    stale_due_to_disposition: construct.stale_due_to_disposition,
    traceability_summary: traceabilitySummary,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Count upstream (sources/constructs pointing to this) and downstream
 * (constructs/artifacts this points to) relationships.
 */
async function gatherTraceabilityCounts(
  constructId: number,
): Promise<{ upstream_count: number; downstream_count: number }> {
  const EvidenceRelationshipModel = sequelize.models.EvidenceRelationship;

  if (!EvidenceRelationshipModel) {
    return { upstream_count: 0, downstream_count: 0 };
  }

  const [upstream, downstream] = await Promise.all([
    EvidenceRelationshipModel.count({
      where: { to_construct_id: constructId },
    }),
    EvidenceRelationshipModel.count({
      where: { from_construct_id: constructId },
    }),
  ]);

  return {
    upstream_count: upstream as number,
    downstream_count: downstream as number,
  };
}

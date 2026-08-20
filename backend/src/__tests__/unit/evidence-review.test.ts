/**
 * Evidence Review Contract Tests — UX-2B
 *
 * Verifies:
 * - Candidate finding can be accepted
 * - Candidate finding can be rejected
 * - Reviewer metadata persisted
 * - Unauthorized review denied
 * - Cross-org review denied
 * - Rejected model output cannot become accepted without explicit review
 * - Stale flag unaffected by review decision
 * - Non-reviewable construct types rejected
 * - Overridden constructs cannot be reviewed
 * - State transitions are deterministic
 * - Audit record created for every review
 * - Idempotent re-review (same decision) succeeds
 * - Re-review (accepted → rejected, rejected → accepted) allowed with audit
 */

import type { ApplicationContext } from '../../types/application-context';
import { ApiErrorCode } from '../../types/api-errors';

// ─── Test fixtures ─────────────────────────────────────────────────

function makeCtx(overrides?: Partial<ApplicationContext>): ApplicationContext {
  return {
    actor: {
      id: 1,
      publicId: 'actor-uuid-1',
      organizationId: 1,
      displayName: 'Test Reviewer',
    },
    organization: {
      id: 1,
      publicId: 'org-uuid-1',
      slug: 'test-org',
      name: 'Test Organization',
    },
    authenticationProvider: 'local_test',
    correlationId: 'corr-uuid-1',
    ...overrides,
  };
}

function makeFinding(overrides?: Record<string, unknown>) {
  return {
    id: 10,
    public_id: 'finding-uuid-1',
    project_id: 1,
    study_id: 1,
    construct_type: 'finding',
    label: 'Veterans prefer simplified navigation',
    status: 'candidate',
    reviewed_by: null,
    reviewed_at: null,
    stale_due_to_disposition: false,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeProject(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    organization_id: 1,
    name: 'Test Project',
    ...overrides,
  };
}

// ─── Mocks ─────────────────────────────────────────────────────────

const mockFindOne = jest.fn();
const mockFindByPk = jest.fn();
const mockCreate = jest.fn();
const mockCount = jest.fn();
const mockTransaction = jest.fn((cb: (t: unknown) => Promise<unknown>) => cb({}));

jest.mock('../../database', () => ({
  __esModule: true,
  default: {
    models: {
      EvidenceConstruct: { findOne: (...args: unknown[]) => mockFindOne(...args) },
      Project: { findByPk: (...args: unknown[]) => mockFindByPk(...args) },
      DispositionAuditLog: { create: (...args: unknown[]) => mockCreate(...args) },
      EvidenceRelationship: { count: (...args: unknown[]) => mockCount(...args) },
    },
    transaction: (cb: (t: unknown) => Promise<unknown>) => mockTransaction(cb),
  },
}));

jest.mock('../../services/authorization.service', () => ({
  assertProjectAccessByActor: jest.fn().mockResolvedValue(undefined),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthorizationError';
    }
  },
}));

const { assertProjectAccessByActor } = jest.requireMock('../../services/authorization.service');

// Import AFTER mocks are set up
import { reviewFinding, reviewRecommendation } from '../../application/evidence-review.app-service';

// ─── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCount.mockResolvedValue(0);
});

describe('Evidence Review — Finding lifecycle', () => {
  it('accepts a candidate finding', async () => {
    const finding = makeFinding();
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'accept');

    expect(result.review_status).toBe('accepted');
    expect(result.previous_status).toBe('candidate');
    expect(result.public_id).toBe('finding-uuid-1');
    expect(finding.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted' }),
      expect.anything(),
    );
  });

  it('rejects a candidate finding', async () => {
    const finding = makeFinding();
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'reject');

    expect(result.review_status).toBe('rejected');
    expect(result.previous_status).toBe('candidate');
    expect(finding.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
      expect.anything(),
    );
  });

  it('persists reviewer metadata', async () => {
    const finding = makeFinding();
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'accept');

    expect(finding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewed_by: 'actor-uuid-1',
        reviewed_at: expect.any(Date),
      }),
      expect.anything(),
    );
    expect(result.reviewed_by_display_name).toBe('Test Reviewer');
    expect(result.reviewed_at).toBeDefined();
  });

  it('creates audit record for review decision', async () => {
    const finding = makeFinding();
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    await reviewFinding(makeCtx(), 'finding-uuid-1', 'accept');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'review_finding',
        record_type: 'evidence_construct',
        target_identifier: 'finding-uuid-1',
        outcome: 'success',
        outcome_detail: 'accept: candidate → accepted',
      }),
      expect.anything(),
    );
  });

  it('stale flag unaffected by review decision', async () => {
    const finding = makeFinding({ stale_due_to_disposition: true });
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'accept');

    expect(result.stale_due_to_disposition).toBe(true);
    // update call should NOT include stale_due_to_disposition
    const updateCall = finding.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('stale_due_to_disposition');
  });
});

describe('Evidence Review — Re-review transitions', () => {
  it('allows accepted → rejected (re-review)', async () => {
    const finding = makeFinding({ status: 'accepted', reviewed_by: 'prev-reviewer' });
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'reject');

    expect(result.review_status).toBe('rejected');
    expect(result.previous_status).toBe('accepted');
  });

  it('allows rejected → accepted (explicit re-review)', async () => {
    const finding = makeFinding({ status: 'rejected', reviewed_by: 'prev-reviewer' });
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'accept');

    expect(result.review_status).toBe('accepted');
    expect(result.previous_status).toBe('rejected');
    // Audit record must capture the re-review
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome_detail: 'accept: rejected → accepted',
      }),
      expect.anything(),
    );
  });

  it('idempotent: same decision on already-decided construct succeeds', async () => {
    const finding = makeFinding({ status: 'accepted' });
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'accept');

    expect(result.review_status).toBe('accepted');
    // Still creates audit record (audit trail for the action)
    expect(mockCreate).toHaveBeenCalled();
  });
});

describe('Evidence Review — Authorization', () => {
  it('denies review when actor lacks project access', async () => {
    const finding = makeFinding();
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    const authError = new Error('Access denied: not a project member');
    authError.name = 'AuthorizationError';
    (assertProjectAccessByActor as jest.Mock).mockRejectedValueOnce(authError);

    await expect(
      reviewFinding(makeCtx(), 'finding-uuid-1', 'accept'),
    ).rejects.toThrow('Access denied');
  });

  it('denies cross-org review (org mismatch)', async () => {
    const finding = makeFinding();
    mockFindOne.mockResolvedValue(finding);
    // Project belongs to org 2, actor belongs to org 1
    mockFindByPk.mockResolvedValue(makeProject({ organization_id: 2 }));

    await expect(
      reviewFinding(makeCtx(), 'finding-uuid-1', 'accept'),
    ).rejects.toThrow();
  });

  it('returns not found for non-existent construct', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(
      reviewFinding(makeCtx(), 'nonexistent-uuid', 'accept'),
    ).rejects.toMatchObject({ code: ApiErrorCode.RESOURCE_NOT_FOUND });
  });
});

describe('Evidence Review — Non-reviewable types', () => {
  it('rejects review of non-reviewable construct type (nugget)', async () => {
    const nugget = makeFinding({ construct_type: 'nugget', public_id: 'nugget-uuid-1' });
    mockFindOne.mockResolvedValue(nugget);

    // The route-level type check: construct_type !== 'finding' → not found
    await expect(
      reviewFinding(makeCtx(), 'nugget-uuid-1', 'accept'),
    ).rejects.toMatchObject({ code: ApiErrorCode.RESOURCE_NOT_FOUND });
  });

  it('rejects review of overridden construct', async () => {
    const finding = makeFinding({ status: 'overridden' });
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());

    await expect(
      reviewFinding(makeCtx(), 'finding-uuid-1', 'accept'),
    ).rejects.toMatchObject({ code: ApiErrorCode.INVALID_REVIEW_TRANSITION });
  });
});

describe('Evidence Review — Recommendation lifecycle', () => {
  it('accepts a candidate recommendation', async () => {
    const rec = makeFinding({
      construct_type: 'recommendation',
      public_id: 'rec-uuid-1',
    });
    mockFindOne.mockResolvedValue(rec);
    mockFindByPk.mockResolvedValue(makeProject());

    const result = await reviewRecommendation(makeCtx(), 'rec-uuid-1', 'accept');

    expect(result.review_status).toBe('accepted');
    expect(result.construct_type).toBe('recommendation');
  });

  it('creates recommendation-specific audit action', async () => {
    const rec = makeFinding({
      construct_type: 'recommendation',
      public_id: 'rec-uuid-1',
    });
    mockFindOne.mockResolvedValue(rec);
    mockFindByPk.mockResolvedValue(makeProject());

    await reviewRecommendation(makeCtx(), 'rec-uuid-1', 'accept');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'review_recommendation',
      }),
      expect.anything(),
    );
  });

  it('rejects review of finding via recommendation endpoint', async () => {
    const finding = makeFinding(); // construct_type: 'finding'
    mockFindOne.mockResolvedValue(finding);

    await expect(
      reviewRecommendation(makeCtx(), 'finding-uuid-1', 'accept'),
    ).rejects.toMatchObject({ code: ApiErrorCode.RESOURCE_NOT_FOUND });
  });
});

describe('Evidence Review — Traceability summary', () => {
  it('returns upstream and downstream counts', async () => {
    const finding = makeFinding();
    mockFindOne.mockResolvedValue(finding);
    mockFindByPk.mockResolvedValue(makeProject());
    mockCount
      .mockResolvedValueOnce(5) // upstream
      .mockResolvedValueOnce(2); // downstream

    const result = await reviewFinding(makeCtx(), 'finding-uuid-1', 'accept');

    expect(result.traceability_summary).toEqual({
      upstream_count: 5,
      downstream_count: 2,
    });
  });
});

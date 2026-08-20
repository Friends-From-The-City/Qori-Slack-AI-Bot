/**
 * Publication Retry Contract Tests — UX-2B
 *
 * Verifies:
 * - Publication failure leaves workflow status unchanged (approved)
 * - Retry transitions publication_status correctly
 * - Retry does not duplicate canonical artifact
 * - Retry idempotency (already published → no-op)
 * - Retry from non-failed state is rejected
 * - Sanitized publication error (no raw GitHub/DB errors)
 * - Publication status API returns deterministic fields
 * - Workflow status ≠ publication status
 */

import type { ApplicationContext } from '../../types/application-context';
import { ApiErrorCode } from '../../types/api-errors';

// ─── Test fixtures ─────────────────────────────────────────────────

function makeCtx(): ApplicationContext {
  return {
    actor: {
      id: 1,
      publicId: 'actor-uuid-1',
      organizationId: 1,
      displayName: 'Test User',
    },
    organization: {
      id: 1,
      publicId: 'org-uuid-1',
      slug: 'test-org',
      name: 'Test Organization',
    },
    authenticationProvider: 'local_test',
    correlationId: 'corr-uuid-1',
  };
}

function makeArtifact(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    public_id: 'artifact-uuid-1',
    project_id: 1,
    study_id: 1,
    artifact_type: 'readout',
    title: 'Research Readout v1',
    template_id: 'research_readout',
    template_version: '5.4.1',
    status: 'written',
    publication_status: 'not_published',
    repo: 'friends-innovation-lab/qori-studies',
    ref: 'main',
    path: 'study-1/readout.md',
    commit_sha: 'abc123',
    url: 'https://github.com/friends-innovation-lab/qori-studies/blob/main/study-1/readout.md',
    semantic_key: 'research_readout:1:1:readout:abc123def456',
    last_write_error: null,
    last_write_attempted_at: null,
    created_by: 'actor-uuid-1',
    created_at: new Date('2026-08-01'),
    updated_at: new Date('2026-08-01'),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeProject() {
  return {
    id: 1,
    organization_id: 1,
    name: 'Test Project',
  };
}

// ─── Mocks ─────────────────────────────────────────────────────────

const mockArtifactFindOne = jest.fn();
const mockProjectFindByPk = jest.fn();

jest.mock('../../database', () => ({
  __esModule: true,
  default: {
    models: {
      ResearchArtifact: { findOne: (...args: unknown[]) => mockArtifactFindOne(...args) },
      Project: { findByPk: (...args: unknown[]) => mockProjectFindByPk(...args) },
    },
  },
}));

jest.mock('../../services/authorization.service', () => ({
  assertProjectAccessByActor: jest.fn().mockResolvedValue(undefined),
}));

import {
  retryPublication,
  getPublicationStatus,
  publishArtifact,
} from '../../application/artifact.app-service';

// ─── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Publication Retry — State transitions', () => {
  it('retries from projection_failed → publishing', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'projection_failed',
      last_write_error: 'GitHub rate limit exceeded',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    const result = await retryPublication(makeCtx(), 'artifact-uuid-1');

    expect(artifact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        publication_status: 'publishing',
        last_write_error: null,
        last_write_attempted_at: expect.any(Date),
      }),
    );
    expect(result.publication_status).toBe('publishing');
  });

  it('workflow status unchanged after failed publication', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'projection_failed',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    const result = await retryPublication(makeCtx(), 'artifact-uuid-1');

    // Workflow status remains 'draft' (mapped from 'written')
    expect(result.workflow_status).toBe('draft');
    // update should NOT change workflow status
    const updateCall = artifact.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('status');
  });

  it('does not duplicate canonical artifact on retry', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'projection_failed',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    await retryPublication(makeCtx(), 'artifact-uuid-1');

    // Only update called, no create — same artifact row reused
    expect(artifact.update).toHaveBeenCalledTimes(1);
    // Preserves location metadata (path, commit_sha, url not cleared)
    const updateCall = artifact.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('path');
    expect(updateCall).not.toHaveProperty('commit_sha');
    expect(updateCall).not.toHaveProperty('url');
  });
});

describe('Publication Retry — Idempotency', () => {
  it('already published → no-op (idempotent)', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'published',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    const result = await retryPublication(makeCtx(), 'artifact-uuid-1');

    expect(artifact.update).not.toHaveBeenCalled();
    expect(result.publication_status).toBe('published');
  });

  it('rejects retry from not_published state', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'not_published',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    await expect(
      retryPublication(makeCtx(), 'artifact-uuid-1'),
    ).rejects.toMatchObject({ code: ApiErrorCode.PUBLICATION_NOT_RETRYABLE });
  });

  it('rejects retry from publishing state', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'publishing',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    await expect(
      retryPublication(makeCtx(), 'artifact-uuid-1'),
    ).rejects.toMatchObject({ code: ApiErrorCode.PUBLICATION_NOT_RETRYABLE });
  });
});

describe('Publication Status — API contract', () => {
  it('returns deterministic fields', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'published',
      last_write_attempted_at: new Date('2026-08-15T10:00:00Z'),
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    const result = await getPublicationStatus(makeCtx(), 'artifact-uuid-1');

    expect(result).toEqual({
      public_id: 'artifact-uuid-1',
      workflow_status: 'draft',
      publication_status: 'published',
      external_target: 'friends-innovation-lab/qori-studies',
      external_reference: 'https://github.com/friends-innovation-lab/qori-studies/blob/main/study-1/readout.md',
      last_attempt_at: '2026-08-15T10:00:00.000Z',
      retryable: false,
      error_code: null,
    });
  });

  it('marks projection_failed as retryable', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'projection_failed',
      last_write_error: 'Request timeout after 30s',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    const result = await getPublicationStatus(makeCtx(), 'artifact-uuid-1');

    expect(result.retryable).toBe(true);
    expect(result.error_code).toBe('TIMEOUT');
  });

  it('sanitizes raw GitHub errors', async () => {
    const artifact = makeArtifact({
      status: 'written',
      publication_status: 'projection_failed',
      last_write_error: 'HttpError: API rate limit exceeded for user-id 12345. (documentation_url: https://docs.github.com/rest/overview/rate-limits-for-the-rest-api)',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    const result = await getPublicationStatus(makeCtx(), 'artifact-uuid-1');

    expect(result.error_code).toBe('RATE_LIMITED');
    // Raw GitHub error string not in response
    expect(JSON.stringify(result)).not.toContain('user-id 12345');
    expect(JSON.stringify(result)).not.toContain('documentation_url');
  });

  it('sanitizes permission errors', async () => {
    const artifact = makeArtifact({
      publication_status: 'projection_failed',
      last_write_error: 'Resource not accessible by personal access token - 403 Forbidden',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    const result = await getPublicationStatus(makeCtx(), 'artifact-uuid-1');

    expect(result.error_code).toBe('PERMISSION_DENIED');
  });
});

describe('Publish — Preconditions', () => {
  it('rejects publish of unapproved artifact', async () => {
    const artifact = makeArtifact({
      status: 'pending',
      publication_status: 'not_published',
    });
    mockArtifactFindOne.mockResolvedValue(artifact);
    mockProjectFindByPk.mockResolvedValue(makeProject());

    await expect(
      publishArtifact(makeCtx(), 'artifact-uuid-1'),
    ).rejects.toMatchObject({ code: ApiErrorCode.ARTIFACT_NOT_APPROVED });
  });
});

/**
 * Application Context Tests — PLAT-3
 *
 * Verifies:
 * - Base ApplicationContext contains identity only (no project/study)
 * - ScopedApplicationContext extends with project/study
 * - Types enforce the separation
 */

import type { ApplicationContext, ScopedApplicationContext } from '../../types/application-context';

describe('ApplicationContext type contracts', () => {
  const baseCtx: ApplicationContext = {
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

  it('base context has actor and organization', () => {
    expect(baseCtx.actor.publicId).toBe('actor-uuid-1');
    expect(baseCtx.organization.slug).toBe('test-org');
  });

  it('base context has authentication provider', () => {
    expect(baseCtx.authenticationProvider).toBe('local_test');
  });

  it('base context has correlation ID', () => {
    expect(baseCtx.correlationId).toBe('corr-uuid-1');
  });

  it('base context does NOT have project or study', () => {
    // TypeScript compile-time check — 'project' does not exist on ApplicationContext
    expect((baseCtx as any).project).toBeUndefined();
    expect((baseCtx as any).study).toBeUndefined();
  });

  it('scoped context extends base with project', () => {
    const scoped: ScopedApplicationContext = {
      ...baseCtx,
      project: {
        id: 1,
        publicId: 'proj-uuid-1',
        slug: 'test-project',
        name: 'Test Project',
      },
    };

    expect(scoped.project.slug).toBe('test-project');
    expect(scoped.actor.publicId).toBe('actor-uuid-1');
  });

  it('scoped context can optionally include study', () => {
    const scoped: ScopedApplicationContext = {
      ...baseCtx,
      project: {
        id: 1,
        publicId: 'proj-uuid-1',
        slug: 'test-project',
        name: 'Test Project',
      },
      study: {
        id: 1,
        publicId: 'study-uuid-1',
        name: 'Test Study',
      },
    };

    expect(scoped.study?.name).toBe('Test Study');
  });
});

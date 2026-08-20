/**
 * Application Context — PLAT-3 adapter-neutral request context.
 *
 * Per ADR 0044: ApplicationContext contains identity/authority only.
 * Requested scope (project, study) is request input resolved per-request
 * through canonical DB state and authorization checks.
 *
 * The client CANNOT create authority by supplying project/study IDs,
 * query parameters, Slack metadata, or browser state.
 */

// ─── Identity Context (established at authentication time) ──────────

export interface ActorContext {
  /** Internal database ID (never exposed to API clients) */
  id: number;
  /** Stable UUID — used in API responses */
  publicId: string;
  /** Organization the actor belongs to */
  organizationId: number;
  /** Human-readable name, may be null */
  displayName: string | null;
}

export interface OrganizationContext {
  /** Internal database ID */
  id: number;
  /** Stable UUID */
  publicId: string;
  /** URL-safe identifier */
  slug: string;
  /** Human-readable name */
  name: string;
}

export type AuthenticationProvider = 'slack' | 'oidc' | 'session' | 'local_test';

/**
 * Base application context — identity and authority only.
 *
 * Created by the auth middleware after identity extraction and
 * canonical actor resolution. Does NOT include project/study scope.
 */
export interface ApplicationContext {
  actor: ActorContext;
  organization: OrganizationContext;
  authenticationProvider: AuthenticationProvider;
  /** Unique request correlation ID for tracing */
  correlationId: string;
}

// ─── Scoped Context (created AFTER canonical resolution + access checks) ──

export interface ProjectContext {
  id: number;
  publicId: string;
  slug: string;
  name: string;
}

export interface StudyContext {
  id: number;
  publicId: string;
  name: string;
}

/**
 * Scoped context — extends ApplicationContext with resolved project/study.
 *
 * Created by application services AFTER:
 * 1. Resolving entity from DB by public ID
 * 2. Verifying entity's organization_id matches ctx.organization.id
 * 3. Checking actor's ProjectMembership
 *
 * Never constructed from raw client input.
 */
export interface ScopedApplicationContext extends ApplicationContext {
  project: ProjectContext;
  study?: StudyContext;
}

// ─── Express augmentation ───────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Application context — set by requireAuth middleware */
      ctx?: ApplicationContext;
    }
  }
}

/**
 * API Error Contract — PLAT-3
 *
 * Deterministic error codes and response shapes for the application API.
 * No raw database errors. No PII leakage. No stack traces in production.
 */

export enum ApiErrorCode {
  /** Request has no valid authentication credentials */
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  /** Authenticated actor lacks permission for this operation */
  AUTHORIZATION_DENIED = 'AUTHORIZATION_DENIED',
  /** Resource belongs to a different organization than the actor */
  ORG_SCOPE_MISMATCH = 'ORG_SCOPE_MISMATCH',
  /** Requested resource does not exist (or is not visible to this actor) */
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  /** Request body or parameters failed validation */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Too many requests — retry after the indicated window */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  /** Operation requires governance review before proceeding */
  GOVERNANCE_REVIEW_REQUIRED = 'GOVERNANCE_REVIEW_REQUIRED',
  /** External projection/publication failed (e.g., GitHub write error) */
  PROJECTION_FAILED = 'PROJECTION_FAILED',
  /** Entity is in a state that does not allow this operation */
  INVALID_STATE = 'INVALID_STATE',
  /** Construct type does not support review operations */
  REVIEW_NOT_ALLOWED = 'REVIEW_NOT_ALLOWED',
  /** Requested status transition is not valid from current state */
  INVALID_REVIEW_TRANSITION = 'INVALID_REVIEW_TRANSITION',
  /** Artifact must be approved before this operation */
  ARTIFACT_NOT_APPROVED = 'ARTIFACT_NOT_APPROVED',
  /** Publication is not in a retryable state */
  PUBLICATION_NOT_RETRYABLE = 'PUBLICATION_NOT_RETRYABLE',
  /** Unexpected server error — details intentionally omitted */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Structured details (e.g., validation field errors). Never contains PII. */
    details?: unknown;
  };
}

/**
 * Application-level error that maps to a specific API error code.
 * Thrown by application services; caught by apiErrorHandler middleware.
 */
export class AppError extends Error {
  public readonly code: ApiErrorCode;
  public readonly httpStatus: number;
  public readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ─── Convenience factories ──────────────────────────────────────────

export function authenticationRequired(message = 'Authentication required'): AppError {
  return new AppError(ApiErrorCode.AUTHENTICATION_REQUIRED, message, 401);
}

export function authorizationDenied(message = 'Access denied'): AppError {
  return new AppError(ApiErrorCode.AUTHORIZATION_DENIED, message, 403);
}

export function orgScopeMismatch(message = 'Resource belongs to a different organization'): AppError {
  return new AppError(ApiErrorCode.ORG_SCOPE_MISMATCH, message, 403);
}

export function resourceNotFound(entity: string): AppError {
  return new AppError(ApiErrorCode.RESOURCE_NOT_FOUND, `${entity} not found`, 404);
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError(ApiErrorCode.VALIDATION_ERROR, message, 400, details);
}

export function invalidState(message: string): AppError {
  return new AppError(ApiErrorCode.INVALID_STATE, message, 409);
}

export function projectionFailed(message: string): AppError {
  return new AppError(ApiErrorCode.PROJECTION_FAILED, message, 502);
}

export function governanceReviewRequired(message = 'Governance review required'): AppError {
  return new AppError(ApiErrorCode.GOVERNANCE_REVIEW_REQUIRED, message, 403);
}

export function reviewNotAllowed(message: string): AppError {
  return new AppError(ApiErrorCode.REVIEW_NOT_ALLOWED, message, 400);
}

export function invalidReviewTransition(message: string): AppError {
  return new AppError(ApiErrorCode.INVALID_REVIEW_TRANSITION, message, 409);
}

export function artifactNotApproved(message = 'Artifact must be approved before publication'): AppError {
  return new AppError(ApiErrorCode.ARTIFACT_NOT_APPROVED, message, 409);
}

export function publicationNotRetryable(message = 'Publication is not in a retryable state'): AppError {
  return new AppError(ApiErrorCode.PUBLICATION_NOT_RETRYABLE, message, 409);
}

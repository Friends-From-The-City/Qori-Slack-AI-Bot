/**
 * API Error Handler — catches all errors on /api routes and maps them
 * to deterministic ApiErrorResponse shapes.
 *
 * Contract:
 * - No raw database errors exposed
 * - No PII leakage
 * - No stack traces in production
 * - AppError instances map directly to their code/status
 * - AuthorizationError maps to AUTHORIZATION_DENIED
 * - Unknown errors map to INTERNAL_ERROR (500)
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError, ApiErrorCode } from '../types/api-errors';
import type { ApiErrorResponse } from '../types/api-errors';

export function apiErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // AppError — known application error with deterministic code
  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  // AuthorizationError from existing authorization.service.ts
  if (err.name === 'AuthorizationError') {
    const body: ApiErrorResponse = {
      error: {
        code: ApiErrorCode.AUTHORIZATION_DENIED,
        message: err.message || 'Access denied',
      },
    };
    res.status(403).json(body);
    return;
  }

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const body: ApiErrorResponse = {
      error: {
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        // Intentionally omit field-level details to prevent schema leakage
      },
    };
    res.status(400).json(body);
    return;
  }

  // Unknown/unexpected error — log and return generic message
  console.error(
    `[API] Unhandled error: ${err.name}: ${err.message}`,
    process.env.NODE_ENV === 'development' ? err.stack : '',
  );

  const body: ApiErrorResponse = {
    error: {
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
  };
  res.status(500).json(body);
}

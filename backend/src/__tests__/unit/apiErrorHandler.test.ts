/**
 * API Error Handler Tests — PLAT-3
 *
 * Verifies:
 * - AppError instances map to their code/status
 * - AuthorizationError maps to AUTHORIZATION_DENIED
 * - Unknown errors map to INTERNAL_ERROR (500)
 * - No raw DB errors exposed
 * - No PII leakage
 */

import { apiErrorHandler } from '../../middleware/apiErrorHandler';
import { AppError, ApiErrorCode, resourceNotFound, authorizationDenied } from '../../types/api-errors';
import type { Request, Response } from 'express';

function mockRes(): Response {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockReq(): Request {
  return {} as Request;
}

describe('apiErrorHandler', () => {
  it('maps AppError to its code and status', () => {
    const err = resourceNotFound('Project');
    const res = mockRes();

    apiErrorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.RESOURCE_NOT_FOUND,
        message: 'Project not found',
      },
    });
  });

  it('maps AuthorizationError to AUTHORIZATION_DENIED', () => {
    const err = new Error('Access denied: not a project member');
    err.name = 'AuthorizationError';
    const res = mockRes();

    apiErrorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.AUTHORIZATION_DENIED,
        message: 'Access denied: not a project member',
      },
    });
  });

  it('maps Sequelize validation errors to VALIDATION_ERROR', () => {
    const err = new Error('notNull Violation: user.email');
    err.name = 'SequelizeValidationError';
    const res = mockRes();

    apiErrorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        // No field-level details leaked
      },
    });
  });

  it('maps unknown errors to INTERNAL_ERROR with no details', () => {
    const err = new Error('Connection refused to postgres:5432');
    const res = mockRes();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    apiErrorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      },
    });

    // Ensure raw DB error is NOT in response
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('postgres');
    expect(JSON.stringify(body)).not.toContain('5432');

    consoleSpy.mockRestore();
  });

  it('includes details from AppError when present', () => {
    const err = new AppError(
      ApiErrorCode.VALIDATION_ERROR,
      'Invalid input',
      400,
      { field: 'name', reason: 'required' },
    );
    const res = mockRes();

    apiErrorHandler(err, mockReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid input',
        details: { field: 'name', reason: 'required' },
      },
    });
  });
});

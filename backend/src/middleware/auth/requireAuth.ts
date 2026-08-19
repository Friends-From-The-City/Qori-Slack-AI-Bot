/**
 * requireAuth — Express middleware for API authentication.
 *
 * Tries auth adapters in order:
 * 1. Bearer token → OIDC adapter
 * 2. X-Test-Actor-PublicId → local test adapter (test env only)
 *
 * On success: attaches ApplicationContext to req.ctx
 * On failure: returns 401 AUTHENTICATION_REQUIRED
 *
 * ApplicationContext contains identity/authority only — no project/study scope.
 */

import type { Request, Response, NextFunction } from 'express';
import { oidcAdapter } from './oidcAdapter';
import { localTestAdapter } from './localTestAdapter';
import { buildApplicationContext } from './contextBuilder';
import { AppError, authenticationRequired, ApiErrorCode } from '../../types/api-errors';
import type { AuthAdapter, IdentityEvidence } from './types';

const adapters: AuthAdapter[] = [oidcAdapter, localTestAdapter];

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let evidence: IdentityEvidence | null = null;

    for (const adapter of adapters) {
      try {
        evidence = await adapter.extractIdentity(req);
        if (evidence) break;
      } catch (error) {
        // If an adapter throws (e.g., invalid JWT), that's a definitive rejection
        if (error instanceof AppError) {
          res.status(error.httpStatus).json({
            error: { code: error.code, message: error.message },
          });
          return;
        }
        throw error;
      }
    }

    if (!evidence) {
      const err = authenticationRequired();
      res.status(err.httpStatus).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }

    const ctx = await buildApplicationContext(evidence);
    req.ctx = ctx;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.httpStatus).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }

    console.error(
      `[AUTH] Unexpected error in requireAuth:`,
      error instanceof Error ? error.message : error,
    );
    res.status(401).json({
      error: {
        code: ApiErrorCode.AUTHENTICATION_REQUIRED,
        message: 'Authentication failed',
      },
    });
  }
}

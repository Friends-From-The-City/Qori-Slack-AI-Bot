/**
 * Source content hash — deterministic identity for survey files.
 *
 * SHA-256 of raw file content. Used for:
 * - Idempotence: detect re-upload of identical file
 * - Respondent identity: stable base for generated respondent keys
 * - Evidence source versioning: same hash = same content
 */

import { createHash } from 'crypto';

/**
 * Compute SHA-256 hash of raw file content.
 * Deterministic: same content always produces identical hash.
 */
export function computeContentHash(content: Buffer | string): string {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Pending CSV Store — Redis-backed temporary staging for survey CSV content.
 *
 * Lifecycle:
 *   upload → Redis SET with TTL
 *   schema confirmation → Redis DEL immediately
 *   cancel → Redis DEL (where Slack lifecycle exposes cancellation)
 *   TTL reached → automatic deletion
 *   expired → clear user-facing error asking researcher to re-upload
 *
 * Key format: survey:pending:{projectId}:{sourcePublicId}:{userId}
 *
 * TTL: 2 hours — schema review typically happens immediately after upload.
 * 2 hours provides margin for researcher interruptions without retaining
 * PII-bearing content indefinitely.
 *
 * PII implications: Survey CSVs may contain respondent names/emails.
 * The TTL guarantees automatic deletion even if the researcher never
 * completes review. On confirmation, content is deleted immediately —
 * no PII persists beyond the review step.
 *
 * The staged CSV is NOT exposed to:
 *   - /qori-ask
 *   - study_variables
 *   - generated artifacts
 *   - model prompts
 *   - evidence metadata
 */

import { createClient, type RedisClientType } from 'redis';

/** TTL for pending CSV staging: 2 hours (7200 seconds). */
const PENDING_CSV_TTL_SECONDS = 7200;

let client: RedisClientType | null = null;

/**
 * Get or create the Redis client. Lazy initialization — only connects
 * when survey upload actually occurs.
 */
async function getClient(): Promise<RedisClientType> {
  if (client && client.isOpen) return client;

  const url = process.env.REDIS_URI
    || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;

  client = createClient({ url });
  client.on('error', (err) => console.error('[survey-pending-csv] Redis error:', err));
  await client.connect();
  return client;
}

function buildKey(projectId: number, sourcePublicId: string, userId: string): string {
  return `survey:pending:${projectId}:${sourcePublicId}:${userId}`;
}

/**
 * Stage raw CSV content in Redis with automatic TTL expiry.
 */
export async function stagePendingCsv(
  projectId: number,
  sourcePublicId: string,
  userId: string,
  csvContent: string,
): Promise<void> {
  const redis = await getClient();
  const key = buildKey(projectId, sourcePublicId, userId);
  await redis.set(key, csvContent, { EX: PENDING_CSV_TTL_SECONDS });
}

/**
 * Retrieve staged CSV content. Returns null if expired or not found.
 */
export async function getPendingCsv(
  projectId: number,
  sourcePublicId: string,
  userId: string,
): Promise<string | null> {
  const redis = await getClient();
  const key = buildKey(projectId, sourcePublicId, userId);
  return redis.get(key);
}

/**
 * Delete staged CSV content immediately (on confirmation or cancellation).
 */
export async function deletePendingCsv(
  projectId: number,
  sourcePublicId: string,
  userId: string,
): Promise<void> {
  const redis = await getClient();
  const key = buildKey(projectId, sourcePublicId, userId);
  await redis.del(key);
}

/**
 * Check remaining TTL for a pending CSV key (for diagnostics/testing).
 * Returns -2 if key doesn't exist, -1 if no TTL, otherwise seconds.
 */
export async function getPendingCsvTtl(
  projectId: number,
  sourcePublicId: string,
  userId: string,
): Promise<number> {
  const redis = await getClient();
  const key = buildKey(projectId, sourcePublicId, userId);
  return redis.ttl(key);
}

/** Exported for testing. */
export const STAGING_TTL_SECONDS = PENDING_CSV_TTL_SECONDS;

/**
 * Close the Redis client (for graceful shutdown / test cleanup).
 */
export async function closePendingCsvStore(): Promise<void> {
  if (client && client.isOpen) {
    await client.quit();
    client = null;
  }
}

#!/usr/bin/env node
/**
 * Qori PostgreSQL Offsite Backup (GOV-5B)
 *
 * Scheduled job that:
 * 1. Connects to PROD Postgres via DATABASE_URL
 * 2. Runs pg_dump (custom format, --no-owner, --no-privileges)
 * 3. Verifies dump integrity (exit code, file size, pg_restore --list)
 * 4. Uploads to external S3-compatible storage
 * 5. Writes metadata sidecar object
 * 6. Cleans up local temp file
 * 7. Exits
 *
 * Designed to run as a Railway Cron Service (run-to-completion).
 *
 * Required environment variables:
 *   DATABASE_URL              — Postgres connection string
 *   BACKUP_S3_BUCKET          — S3 bucket name
 *   BACKUP_S3_REGION          — S3 region
 *   BACKUP_S3_ENDPOINT        — S3-compatible endpoint URL
 *   BACKUP_S3_ACCESS_KEY_ID   — Storage access key (server-side secret)
 *   BACKUP_S3_SECRET_ACCESS_KEY — Storage secret key (server-side secret)
 *
 * Optional:
 *   BACKUP_ENVIRONMENT        — Environment label (default: "production")
 *
 * Storage compatibility:
 *   Uses S3-compatible API with path-style requests (forcePathStyle=true).
 *   Works with Supabase Storage S3, AWS S3, MinIO, and other compatible
 *   providers. No dependency on provider-specific features (lifecycle
 *   policies, versioning, etc.).
 *
 * Retention:
 *   Target retention is 30 days. Automated retention is deferred to
 *   operational hardening. Backups remain until manually deleted or
 *   retention automation is added. The backup job does NOT delete objects.
 *
 * Limitations:
 *   - Object versioning is not assumed (Supabase S3 does not support it)
 *   - Lifecycle expiration is not assumed (Supabase S3 does not expose it)
 *   - Each backup produces a unique timestamped key; overwrites do not occur
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { URL } = require('url');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// --- Configuration ---

const REQUIRED_ENV = [
  'DATABASE_URL',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_REGION',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
];

const ENVIRONMENT = process.env.BACKUP_ENVIRONMENT || 'production';

// --- Credential patterns (used for sanitization) ---

const CREDENTIAL_PATTERNS = [
  // Connection strings: postgresql://..., postgres://...
  /postgres(?:ql)?:\/\/[^\s'"]+/gi,
  // Generic password= in query strings or configs
  /password=[^\s&'"]+/gi,
  // Bearer / Basic auth headers
  /(?:Bearer|Basic)\s+[A-Za-z0-9+/=._~-]+/gi,
  // AWS-style keys (AKIA...)
  /AKIA[A-Z0-9]{16}/g,
  // Long base64-ish secrets (40+ chars, likely tokens)
  /(?:secret|token|key|authorization)[=:\s]["']?[A-Za-z0-9+/=._~-]{20,}["']?/gi,
];

function sanitize(text) {
  if (typeof text !== 'string') return text;
  let sanitized = text;
  for (const pattern of CREDENTIAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// --- Logging ---

function log(event, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    environment: ENVIRONMENT,
    ...meta,
  };
  console.log(JSON.stringify(entry));
}

function logError(event, error, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    environment: ENVIRONMENT,
    error_class: error.constructor.name,
    error_message: sanitize(error.message),
    ...meta,
  };
  console.error(JSON.stringify(entry));
}

// --- Connection string parsing ---

/**
 * Parses a PostgreSQL connection URI into individual libpq env vars.
 * This keeps the full connection string out of argv, preventing credential
 * leakage when Node's execFileSync embeds commands in error messages.
 */
function parseDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const pgEnv = {};
  if (parsed.hostname) pgEnv.PGHOST = parsed.hostname;
  if (parsed.port) pgEnv.PGPORT = parsed.port;
  if (parsed.username) pgEnv.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) pgEnv.PGPASSWORD = decodeURIComponent(parsed.password);
  // pathname is "/dbname", strip the leading slash
  const dbName = parsed.pathname.replace(/^\//, '');
  if (dbName) pgEnv.PGDATABASE = dbName;
  // Pass through sslmode from query params if present
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode) pgEnv.PGSSLMODE = sslmode;
  return pgEnv;
}

// --- Validation ---

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// --- Version preflight ---

/**
 * Extracts the major version number from a pg_dump/pg_restore --version string.
 * Example: "pg_dump (PostgreSQL) 18.4" → 18
 */
function parsePgMajorVersion(versionString) {
  const match = versionString.match(/(\d+)(?:\.\d+)?/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Checks that pg_dump client major version is >= server major version.
 * A client older than the server will produce incompatible dumps.
 * Pass databaseUrl to query the server version via pg_dump's --version output
 * against the server version obtained from a lightweight psql check.
 */
function checkVersionCompatibility(databaseUrl) {
  // Get client version
  const clientVersionStr = execFileSync('pg_dump', ['--version'], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
  const clientMajor = parsePgMajorVersion(clientVersionStr);

  if (clientMajor === null) {
    throw new Error('Could not determine pg_dump client version');
  }

  // Get server version via psql (lightweight, no dump).
  // Connection parsed into individual libpq env vars to avoid argv leakage.
  let serverMajor;
  try {
    const pgEnv = { ...process.env, ...parseDatabaseUrl(databaseUrl) };
    const serverVersionStr = execFileSync('psql', [
      '--no-psqlrc',
      '--tuples-only',
      '--command', 'SHOW server_version;',
    ], {
      encoding: 'utf8',
      timeout: 15000,
      env: pgEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    serverMajor = parsePgMajorVersion(serverVersionStr);
  } catch {
    // If psql is unavailable, skip server check — pg_dump will fail
    // on its own if versions are incompatible
    log('version_check_warning', {
      message: 'Could not query server version; proceeding with client-only check',
      client_major: clientMajor,
    });
    return { clientMajor, serverMajor: null, compatible: true };
  }

  if (serverMajor !== null && clientMajor < serverMajor) {
    throw new Error(
      `pg_dump client major ${clientMajor} is older than PostgreSQL server major ${serverMajor}`
    );
  }

  return { clientMajor, serverMajor, compatible: true };
}

// --- pg_dump ---

function runPgDump(databaseUrl, outputPath) {
  // Connection URI is decomposed into individual libpq env vars (PGHOST,
  // PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE) so it never appears
  // in the argv array. If execFileSync throws, Node embeds the command+args
  // in the error message — keeping credentials out of args prevents leakage.
  const pgEnv = { ...process.env, ...parseDatabaseUrl(databaseUrl) };

  try {
    execFileSync('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file', outputPath,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600000, // 10 minutes
      env: pgEnv,
    });
  } catch (err) {
    // Belt-and-suspenders: sanitize in case stderr still contains credentials
    throw new Error(sanitize(err.message));
  }
}

function verifyDump(dumpPath) {
  // Check file exists
  if (!fs.existsSync(dumpPath)) {
    throw new Error('pg_dump produced no output file');
  }

  // Check non-zero size
  const stats = fs.statSync(dumpPath);
  if (stats.size === 0) {
    throw new Error('pg_dump produced zero-byte file');
  }

  // Verify with pg_restore --list
  execFileSync('pg_restore', ['--list', dumpPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });

  return stats.size;
}

// --- S3 upload ---

function createS3Client() {
  const config = {
    region: process.env.BACKUP_S3_REGION,
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
    },
  };

  return new S3Client(config);
}

function buildObjectKey(timestamp) {
  const d = timestamp;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `qori/postgres/${year}/${month}/${day}/qori-prod-${iso}.dump`;
}

async function uploadToS3(client, bucket, key, filePath, dumpSize) {
  const body = fs.readFileSync(filePath);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/octet-stream',
    ContentLength: dumpSize,
  });
  await client.send(command);
}

async function uploadMetadata(client, bucket, dumpKey, timestamp, dumpSize) {
  let pgVersion = 'unknown';
  try {
    pgVersion = execFileSync('pg_dump', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    // non-critical
  }

  let gitSha = 'unknown';
  try {
    gitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      cwd: __dirname,
    }).trim();
  } catch {
    // non-critical — may not be in a git repo at runtime
  }

  const metadata = {
    backup_timestamp_utc: timestamp.toISOString(),
    environment: ENVIRONMENT,
    database_engine: pgVersion,
    dump_format: 'custom',
    dump_size_bytes: dumpSize,
    dump_object_key: dumpKey,
    backup_job_git_sha: gitSha,
    backup_schema_version: 1,
  };

  const metadataKey = dumpKey.replace(/\.dump$/, '.meta.json');
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: metadataKey,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: 'application/json',
  });
  await client.send(command);

  return metadataKey;
}

// --- Cleanup ---

function cleanup(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logError('cleanup_warning', err, { path: filePath });
  }
}

// --- Main ---

async function main() {
  const startTime = Date.now();
  const timestamp = new Date();
  let dumpPath = null;

  try {
    // 1. Validate environment
    validateEnv();

    // 2. Create temp directory and dump path
    const tempDir = fs.mkdtempSync(join(tmpdir(), 'qori-backup-'));
    dumpPath = join(tempDir, 'backup.dump');

    // 3. Version preflight
    const versionInfo = checkVersionCompatibility(process.env.DATABASE_URL);
    log('version_check_passed', {
      client_major: versionInfo.clientMajor,
      server_major: versionInfo.serverMajor,
    });

    log('backup_started');

    // 4. Run pg_dump
    const dumpStart = Date.now();
    runPgDump(process.env.DATABASE_URL, dumpPath);
    const dumpDuration = Date.now() - dumpStart;
    log('dump_completed', { duration_ms: dumpDuration });

    // 5. Verify dump
    const dumpSize = verifyDump(dumpPath);
    log('dump_verified', { dump_size_bytes: dumpSize });

    // 6. Upload to S3
    const s3Client = createS3Client();
    const bucket = process.env.BACKUP_S3_BUCKET;
    const objectKey = buildObjectKey(timestamp);

    const uploadStart = Date.now();
    await uploadToS3(s3Client, bucket, objectKey, dumpPath, dumpSize);
    const uploadDuration = Date.now() - uploadStart;
    log('upload_completed', {
      object_key: objectKey,
      dump_size_bytes: dumpSize,
      duration_ms: uploadDuration,
    });

    // 7. Upload metadata sidecar
    const metadataKey = await uploadMetadata(s3Client, bucket, objectKey, timestamp, dumpSize);
    log('metadata_uploaded', { metadata_key: metadataKey });

    // 8. Cleanup local dump
    cleanup(dumpPath);
    dumpPath = null;

    const totalDuration = Date.now() - startTime;
    log('backup_completed', {
      object_key: objectKey,
      dump_size_bytes: dumpSize,
      total_duration_ms: totalDuration,
    });

    process.exit(0);
  } catch (err) {
    logError('backup_failed', err);
    cleanup(dumpPath);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  validateEnv,
  parseDatabaseUrl,
  parsePgMajorVersion,
  checkVersionCompatibility,
  runPgDump,
  verifyDump,
  buildObjectKey,
  uploadToS3,
  uploadMetadata,
  cleanup,
  createS3Client,
  sanitize,
  log,
  logError,
  main,
  REQUIRED_ENV,
  CREDENTIAL_PATTERNS,
};

// Run if invoked directly
if (require.main === module) {
  main();
}

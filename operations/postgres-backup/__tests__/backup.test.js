'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock @aws-sdk/client-s3 before requiring backup module
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((params) => params),
}));

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

const backup = require('../backup');

// --- Fake credentials used across secret-leak tests ---
const FAKE_DATABASE_URL = 'postgresql://admin:SuperSecret123@prod-db.example.com:5432/qori_prod?sslmode=require';
const FAKE_S3_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const FAKE_S3_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const FAKE_PASSWORD = 'SuperSecret123';

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('throws when required env vars are missing', () => {
    delete process.env.DATABASE_URL;
    delete process.env.BACKUP_S3_BUCKET;
    expect(() => backup.validateEnv()).toThrow('Missing required environment variables');
    expect(() => backup.validateEnv()).toThrow('DATABASE_URL');
    expect(() => backup.validateEnv()).toThrow('BACKUP_S3_BUCKET');
  });

  test('does not throw when all required env vars are present', () => {
    for (const key of backup.REQUIRED_ENV) {
      process.env[key] = 'test-value';
    }
    expect(() => backup.validateEnv()).not.toThrow();
  });
});

describe('buildObjectKey', () => {
  test('contains UTC timestamp', () => {
    const date = new Date('2026-08-18T07:00:00.000Z');
    const key = backup.buildObjectKey(date);
    expect(key).toContain('20260818T070000Z');
  });

  test('uses date-based directory structure', () => {
    const date = new Date('2026-08-18T07:00:00.000Z');
    const key = backup.buildObjectKey(date);
    expect(key).toBe('qori/postgres/2026/08/18/qori-prod-20260818T070000Z.dump');
  });

  test('pads single-digit months and days', () => {
    const date = new Date('2026-01-05T12:30:00.000Z');
    const key = backup.buildObjectKey(date);
    expect(key).toContain('2026/01/05');
  });
});

describe('parsePgMajorVersion', () => {
  test('parses "pg_dump (PostgreSQL) 18.4"', () => {
    expect(backup.parsePgMajorVersion('pg_dump (PostgreSQL) 18.4')).toBe(18);
  });

  test('parses "pg_dump (PostgreSQL) 15.19"', () => {
    expect(backup.parsePgMajorVersion('pg_dump (PostgreSQL) 15.19')).toBe(15);
  });

  test('parses bare version "18.6"', () => {
    expect(backup.parsePgMajorVersion(' 18.6')).toBe(18);
  });

  test('returns null for unparseable input', () => {
    expect(backup.parsePgMajorVersion('no version here')).toBeNull();
  });
});

describe('sanitize', () => {
  test('redacts postgresql:// connection strings', () => {
    const input = 'Command failed: pg_dump --dbname postgresql://user:pass@host:5432/db';
    const result = backup.sanitize(input);
    expect(result).not.toContain('postgresql://');
    expect(result).not.toContain('pass');
    expect(result).toContain('[REDACTED]');
  });

  test('redacts postgres:// connection strings', () => {
    const input = 'Error connecting to postgres://admin:secret@db.example.com/mydb';
    const result = backup.sanitize(input);
    expect(result).not.toContain('postgres://');
    expect(result).not.toContain('secret');
  });

  test('redacts password= parameters', () => {
    const input = 'connection string: host=db password=MySecret123 dbname=qori';
    const result = backup.sanitize(input);
    expect(result).not.toContain('MySecret123');
  });

  test('redacts AWS-style access keys', () => {
    const result = backup.sanitize(`key is ${FAKE_S3_ACCESS_KEY}`);
    expect(result).not.toContain(FAKE_S3_ACCESS_KEY);
  });

  test('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.payload';
    const result = backup.sanitize(input);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  test('returns non-string values unchanged', () => {
    expect(backup.sanitize(42)).toBe(42);
    expect(backup.sanitize(null)).toBeNull();
    expect(backup.sanitize(undefined)).toBeUndefined();
  });
});

describe('parseDatabaseUrl', () => {
  test('parses full PostgreSQL URI into libpq env vars', () => {
    const result = backup.parseDatabaseUrl(FAKE_DATABASE_URL);
    expect(result.PGHOST).toBe('prod-db.example.com');
    expect(result.PGPORT).toBe('5432');
    expect(result.PGUSER).toBe('admin');
    expect(result.PGPASSWORD).toBe(FAKE_PASSWORD);
    expect(result.PGDATABASE).toBe('qori_prod');
    expect(result.PGSSLMODE).toBe('require');
  });

  test('handles URI without port', () => {
    const result = backup.parseDatabaseUrl('postgresql://user:pass@host/mydb');
    expect(result.PGHOST).toBe('host');
    expect(result.PGPORT).toBeUndefined();
    expect(result.PGUSER).toBe('user');
    expect(result.PGPASSWORD).toBe('pass');
    expect(result.PGDATABASE).toBe('mydb');
  });

  test('handles URL-encoded special characters in password', () => {
    const result = backup.parseDatabaseUrl('postgresql://user:p%40ss%23word@host/db');
    expect(result.PGPASSWORD).toBe('p@ss#word');
  });

  test('result never contains the full connection URI', () => {
    const result = backup.parseDatabaseUrl(FAKE_DATABASE_URL);
    const allValues = Object.values(result).join(' ');
    expect(allValues).not.toContain('postgresql://');
    expect(allValues).not.toContain('postgres://');
  });
});

describe('checkVersionCompatibility', () => {
  beforeEach(() => {
    execFileSync.mockReset();
  });

  test('server 18 / client 18 → permitted', () => {
    // First call: pg_dump --version
    execFileSync.mockReturnValueOnce('pg_dump (PostgreSQL) 18.4');
    // Second call: psql SHOW server_version
    execFileSync.mockReturnValueOnce(' 18.6');

    const result = backup.checkVersionCompatibility(FAKE_DATABASE_URL);
    expect(result.compatible).toBe(true);
    expect(result.clientMajor).toBe(18);
    expect(result.serverMajor).toBe(18);
  });

  test('server 18 / client 15 → blocked before dump', () => {
    execFileSync.mockReturnValueOnce('pg_dump (PostgreSQL) 15.19');
    execFileSync.mockReturnValueOnce(' 18.6');

    expect(() => backup.checkVersionCompatibility(FAKE_DATABASE_URL))
      .toThrow('pg_dump client major 15 is older than PostgreSQL server major 18');
  });

  test('server 18 / client 19 → permitted (newer client ok)', () => {
    execFileSync.mockReturnValueOnce('pg_dump (PostgreSQL) 19.0');
    execFileSync.mockReturnValueOnce(' 18.6');

    const result = backup.checkVersionCompatibility(FAKE_DATABASE_URL);
    expect(result.compatible).toBe(true);
  });

  test('psql unavailable → proceeds with client-only check', () => {
    execFileSync.mockReturnValueOnce('pg_dump (PostgreSQL) 18.4');
    execFileSync.mockImplementationOnce(() => { throw new Error('psql not found'); });

    const result = backup.checkVersionCompatibility(FAKE_DATABASE_URL);
    expect(result.compatible).toBe(true);
    expect(result.clientMajor).toBe(18);
    expect(result.serverMajor).toBeNull();
  });

  test('version check does not leak DATABASE_URL in psql args', () => {
    execFileSync.mockReturnValueOnce('pg_dump (PostgreSQL) 18.4');
    execFileSync.mockReturnValueOnce(' 18.6');

    backup.checkVersionCompatibility(FAKE_DATABASE_URL);

    // psql call is the second invocation
    const psqlCall = execFileSync.mock.calls[1];
    const psqlArgs = psqlCall[1];
    // DATABASE_URL must NOT appear in argv
    for (const arg of psqlArgs) {
      expect(arg).not.toContain('postgresql://');
      expect(arg).not.toContain(FAKE_PASSWORD);
    }
    // Individual libpq env vars should be set instead
    const psqlOpts = psqlCall[2];
    expect(psqlOpts.env.PGHOST).toBe('prod-db.example.com');
    expect(psqlOpts.env.PGPASSWORD).toBe(FAKE_PASSWORD);
    expect(psqlOpts.env.PGDATABASE).toBe('qori_prod');
  });
});

describe('runPgDump', () => {
  beforeEach(() => {
    execFileSync.mockReset();
  });

  test('calls pg_dump without DATABASE_URL in args', () => {
    execFileSync.mockReturnValue(Buffer.from(''));
    backup.runPgDump(FAKE_DATABASE_URL, '/tmp/test.dump');

    const call = execFileSync.mock.calls[0];
    const args = call[1];
    // Connection string must NOT be in the argument array
    for (const arg of args) {
      expect(arg).not.toContain('postgresql://');
      expect(arg).not.toContain(FAKE_PASSWORD);
    }
    // Individual libpq env vars must be set instead
    expect(call[2].env.PGHOST).toBe('prod-db.example.com');
    expect(call[2].env.PGPASSWORD).toBe(FAKE_PASSWORD);
    expect(call[2].env.PGDATABASE).toBe('qori_prod');
  });

  test('calls pg_dump with correct flags', () => {
    execFileSync.mockReturnValue(Buffer.from(''));
    backup.runPgDump(FAKE_DATABASE_URL, '/tmp/test.dump');

    expect(execFileSync).toHaveBeenCalledWith('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file', '/tmp/test.dump',
    ], expect.objectContaining({
      timeout: 600000,
    }));
  });

  test('throws sanitized error on pg_dump failure', () => {
    execFileSync.mockImplementation(() => {
      throw new Error(
        `Command failed: pg_dump --format=custom --file /tmp/test.dump\n` +
        `pg_dump: error: connection to server at "prod-db.example.com" failed: ` +
        `postgresql://admin:SuperSecret123@prod-db.example.com:5432/qori_prod`
      );
    });

    expect(() => backup.runPgDump(FAKE_DATABASE_URL, '/tmp/test.dump')).toThrow();

    try {
      backup.runPgDump(FAKE_DATABASE_URL, '/tmp/test.dump');
    } catch (err) {
      expect(err.message).not.toContain('SuperSecret123');
      expect(err.message).not.toContain('postgresql://admin');
      expect(err.message).toContain('[REDACTED]');
    }
  });
});

describe('verifyDump', () => {
  let existsSyncSpy;
  let statSyncSpy;

  beforeEach(() => {
    execFileSync.mockReset();
    // Spy on the real fs module methods used by backup.js
    existsSyncSpy = jest.spyOn(fs, 'existsSync');
    statSyncSpy = jest.spyOn(fs, 'statSync');
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
  });

  test('throws when file does not exist', () => {
    existsSyncSpy.mockReturnValue(false);
    expect(() => backup.verifyDump('/tmp/nonexistent.dump')).toThrow('no output file');
  });

  test('throws on zero-byte file', () => {
    existsSyncSpy.mockReturnValue(true);
    statSyncSpy.mockReturnValue({ size: 0 });
    expect(() => backup.verifyDump('/tmp/empty.dump')).toThrow('zero-byte');
  });

  test('calls pg_restore --list for verification', () => {
    existsSyncSpy.mockReturnValue(true);
    statSyncSpy.mockReturnValue({ size: 1024 });
    execFileSync.mockReturnValue(Buffer.from(''));

    const size = backup.verifyDump('/tmp/test.dump');

    expect(execFileSync).toHaveBeenCalledWith(
      'pg_restore', ['--list', '/tmp/test.dump'],
      expect.any(Object)
    );
    expect(size).toBe(1024);
  });

  test('throws when pg_restore --list fails', () => {
    existsSyncSpy.mockReturnValue(true);
    statSyncSpy.mockReturnValue({ size: 1024 });
    execFileSync.mockImplementation(() => {
      throw new Error('pg_restore verification failed');
    });
    expect(() => backup.verifyDump('/tmp/corrupt.dump')).toThrow('pg_restore verification failed');
  });
});

describe('uploadToS3', () => {
  let tmpFile;

  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    // Create a real temp file for the readable stream
    tmpFile = path.join(os.tmpdir(), `test-upload-${Date.now()}.dump`);
    fs.writeFileSync(tmpFile, 'test data');
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('upload sends to correct bucket and key', async () => {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const mockClient = { send: mockSend };

    await backup.uploadToS3(mockClient, 'test-bucket', 'test/key.dump', tmpFile, 9);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentCommand = PutObjectCommand.mock.calls[PutObjectCommand.mock.calls.length - 1][0];
    expect(sentCommand.Bucket).toBe('test-bucket');
    expect(sentCommand.Key).toBe('test/key.dump');
  });
});

describe('uploadMetadata', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    execFileSync.mockReset();
    execFileSync.mockReturnValue('pg_dump (PostgreSQL) 18.4');
  });

  test('uploads metadata sidecar with .meta.json extension', async () => {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const mockClient = { send: mockSend };

    const metaKey = await backup.uploadMetadata(
      mockClient, 'test-bucket',
      'qori/postgres/2026/08/18/qori-prod-20260818.dump',
      new Date('2026-08-18T07:00:00Z'), 1024
    );

    expect(metaKey).toBe('qori/postgres/2026/08/18/qori-prod-20260818.meta.json');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // The PutObjectCommand mock captures the raw params
    const params = PutObjectCommand.mock.calls[PutObjectCommand.mock.calls.length - 1][0];
    const body = JSON.parse(params.Body);
    expect(body.environment).toBeDefined();
    expect(body.dump_size_bytes).toBe(1024);
    expect(body.backup_timestamp_utc).toBe('2026-08-18T07:00:00.000Z');
    expect(body.dump_format).toBe('custom');
    expect(body.backup_schema_version).toBe(1);
    // Must NOT contain credentials
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toMatch(/password/i);
    expect(bodyStr).not.toMatch(/secret/i);
    expect(bodyStr).not.toMatch(/DATABASE_URL/);
  });
});

describe('cleanup', () => {
  test('removes file on success', () => {
    const tmpFile = path.join(os.tmpdir(), `test-cleanup-${Date.now()}.dump`);
    fs.writeFileSync(tmpFile, 'data');
    expect(fs.existsSync(tmpFile)).toBe(true);

    backup.cleanup(tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  test('handles cleanup on failure gracefully', () => {
    expect(() => backup.cleanup('/tmp/nonexistent-cleanup-test-99999.dump')).not.toThrow();
  });

  test('handles null path gracefully', () => {
    expect(() => backup.cleanup(null)).not.toThrow();
  });
});

// ============================================================
// SECRET-LEAK REGRESSION TESTS
// ============================================================

describe('secret-leak regression', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: FAKE_DATABASE_URL,
      BACKUP_S3_ACCESS_KEY_ID: FAKE_S3_ACCESS_KEY,
      BACKUP_S3_SECRET_ACCESS_KEY: FAKE_S3_SECRET_KEY,
      BACKUP_S3_BUCKET: 'test-bucket',
      BACKUP_S3_REGION: 'us-east-1',
      BACKUP_S3_ENDPOINT: 'https://s3.example.com',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('DATABASE_URL does not appear in success log output', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    try {
      backup.log('backup_completed', { object_key: 'test/key.dump', dump_size_bytes: 1024 });

      const allOutput = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allOutput).not.toContain(FAKE_DATABASE_URL);
      expect(allOutput).not.toContain('postgresql://');
      expect(allOutput).not.toContain(FAKE_PASSWORD);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test('DATABASE_URL does not appear in command failure logs', () => {
    const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation();
    try {
      // Simulate the exact failure scenario: pg_dump error containing DATABASE_URL
      const fakeError = new Error(
        `Command failed: pg_dump --dbname ${FAKE_DATABASE_URL}\n` +
        `pg_dump: error: server version 18.6; pg_dump version 15.19`
      );

      backup.logError('backup_failed', fakeError);

      const allOutput = consoleErrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allOutput).not.toContain(FAKE_DATABASE_URL);
      expect(allOutput).not.toContain('postgresql://admin');
      expect(allOutput).not.toContain(FAKE_PASSWORD);
    } finally {
      consoleErrSpy.mockRestore();
    }
  });

  test('database password does not appear in sanitized error messages', () => {
    const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation();
    try {
      const fakeError = new Error(
        `connection to server failed: password=SuperSecret123 host=prod-db.example.com`
      );

      backup.logError('backup_failed', fakeError);

      const allOutput = consoleErrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allOutput).not.toContain('SuperSecret123');
    } finally {
      consoleErrSpy.mockRestore();
    }
  });

  test('pg_dump stderr cannot echo connection credentials into structured logs', () => {
    const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation();
    try {
      // Simulate stderr that contains the full connection string
      const stderrError = new Error(
        `pg_dump: error: connection to server at "prod-db.example.com" (1.2.3.4), port 5432 failed: ` +
        `postgresql://admin:SuperSecret123@prod-db.example.com:5432/qori_prod?sslmode=require`
      );

      backup.logError('backup_failed', stderrError);

      const allOutput = consoleErrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allOutput).not.toContain('SuperSecret123');
      expect(allOutput).not.toContain('postgresql://admin');

      // Verify the structured log is valid JSON and has sanitized content
      const parsed = JSON.parse(consoleErrSpy.mock.calls[0][0]);
      expect(parsed.error_message).not.toContain('SuperSecret123');
      expect(parsed.error_message).toContain('[REDACTED]');
      expect(parsed.error_class).toBe('Error');
    } finally {
      consoleErrSpy.mockRestore();
    }
  });

  test('S3 credentials remain absent from log output', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation();
    try {
      backup.log('backup_started');
      backup.log('upload_completed', { object_key: 'test.dump', dump_size_bytes: 100 });
      backup.logError('upload_failed', new Error('S3 timeout'));

      const allOutput = [
        ...consoleSpy.mock.calls,
        ...consoleErrSpy.mock.calls,
      ].map((c) => c.join(' ')).join('\n');

      expect(allOutput).not.toContain(FAKE_S3_ACCESS_KEY);
      expect(allOutput).not.toContain(FAKE_S3_SECRET_KEY);
    } finally {
      consoleSpy.mockRestore();
      consoleErrSpy.mockRestore();
    }
  });

  test('version mismatch produces sanitized error without credentials', () => {
    execFileSync.mockReset();
    execFileSync.mockReturnValueOnce('pg_dump (PostgreSQL) 15.19');
    execFileSync.mockReturnValueOnce(' 18.6');

    const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation();
    try {
      try {
        backup.checkVersionCompatibility(FAKE_DATABASE_URL);
      } catch (err) {
        backup.logError('backup_failed', err);
      }

      const allOutput = consoleErrSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allOutput).not.toContain(FAKE_DATABASE_URL);
      expect(allOutput).not.toContain(FAKE_PASSWORD);

      // Should contain the sanitized version mismatch message
      const parsed = JSON.parse(consoleErrSpy.mock.calls[0][0]);
      expect(parsed.error_message).toContain('client major 15');
      expect(parsed.error_message).toContain('server major 18');
    } finally {
      consoleErrSpy.mockRestore();
    }
  });

  test('runPgDump does not pass DATABASE_URL as a command argument', () => {
    execFileSync.mockReset();
    execFileSync.mockReturnValue(Buffer.from(''));

    backup.runPgDump(FAKE_DATABASE_URL, '/tmp/test.dump');

    const call = execFileSync.mock.calls[0];
    const allArgs = call[1].join(' ');
    expect(allArgs).not.toContain(FAKE_DATABASE_URL);
    expect(allArgs).not.toContain('postgresql://');
    expect(allArgs).not.toContain(FAKE_PASSWORD);
  });
});

describe('credential safety', () => {
  test('log output does not contain credential env var values', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation();

    // Call the module-level log functions directly
    backup.log('test_event', { some_key: 'value' });
    backup.logError('test_error', new Error('test'), { detail: 'info' });

    const allOutput = [...consoleSpy.mock.calls, ...consoleErrSpy.mock.calls]
      .map((c) => c.join(' '))
      .join('\n');

    // Verify structured output doesn't leak env var names as values
    expect(allOutput).not.toContain('DATABASE_URL');
    expect(allOutput).not.toContain('BACKUP_S3_SECRET');
    expect(allOutput).not.toContain('postgresql://');

    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });
});

describe('S3 client configuration', () => {
  const originalEnv = process.env;
  const { S3Client } = require('@aws-sdk/client-s3');

  beforeEach(() => {
    process.env = { ...originalEnv };
    S3Client.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('configures custom endpoint from BACKUP_S3_ENDPOINT', () => {
    process.env.BACKUP_S3_REGION = 'us-east-1';
    process.env.BACKUP_S3_ENDPOINT = 'https://abc123.storage.supabase.co/storage/v1/s3';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'test-key';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'test-secret';

    backup.createS3Client();

    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'https://abc123.storage.supabase.co/storage/v1/s3',
      forcePathStyle: true,
      region: 'us-east-1',
    }));
  });

  test('always uses forcePathStyle for S3-compatible providers', () => {
    process.env.BACKUP_S3_REGION = 'us-west-2';
    process.env.BACKUP_S3_ENDPOINT = 'https://example.com/s3';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';

    backup.createS3Client();

    const config = S3Client.mock.calls[0][0];
    expect(config.forcePathStyle).toBe(true);
  });

  test('does not pass credentials in client config keys', () => {
    process.env.BACKUP_S3_REGION = 'us-east-1';
    process.env.BACKUP_S3_ENDPOINT = 'https://example.com/s3';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

    backup.createS3Client();

    // Credentials are passed inside the credentials object, not at top level
    const config = S3Client.mock.calls[0][0];
    expect(config.credentials.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    expect(config.credentials.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    // Config itself should not have these at top level
    expect(config.accessKeyId).toBeUndefined();
    expect(config.secretAccessKey).toBeUndefined();
  });

  test('BACKUP_S3_ENDPOINT is required', () => {
    expect(backup.REQUIRED_ENV).toContain('BACKUP_S3_ENDPOINT');
  });
});

describe('no DELETE permission required', () => {
  test('backup code does not call DeleteObject', () => {
    const backupSource = fs.readFileSync(path.join(__dirname, '..', 'backup.js'), 'utf8');
    expect(backupSource).not.toContain('DeleteObjectCommand');
    expect(backupSource).not.toContain('deleteObject');
  });
});

describe('no provider-specific lifecycle dependency', () => {
  test('backup code does not reference lifecycle or expiration APIs', () => {
    const backupSource = fs.readFileSync(path.join(__dirname, '..', 'backup.js'), 'utf8');
    expect(backupSource).not.toContain('PutBucketLifecycle');
    expect(backupSource).not.toContain('LifecycleConfiguration');
    expect(backupSource).not.toContain('Expiration');
  });

  test('backup code does not reference object versioning', () => {
    const backupSource = fs.readFileSync(path.join(__dirname, '..', 'backup.js'), 'utf8');
    expect(backupSource).not.toContain('VersioningConfiguration');
    expect(backupSource).not.toContain('PutBucketVersioning');
  });
});

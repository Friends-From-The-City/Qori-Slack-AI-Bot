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

describe('runPgDump', () => {
  beforeEach(() => {
    execFileSync.mockReset();
  });

  test('calls pg_dump with correct flags', () => {
    execFileSync.mockReturnValue(Buffer.from(''));
    backup.runPgDump('postgresql://user:pass@host/db', '/tmp/test.dump');

    expect(execFileSync).toHaveBeenCalledWith('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--dbname', 'postgresql://user:pass@host/db',
      '--file', '/tmp/test.dump',
    ], expect.objectContaining({
      timeout: 600000,
    }));
  });

  test('throws on pg_dump failure', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('pg_dump failed');
    });
    expect(() => backup.runPgDump('postgresql://...', '/tmp/test.dump')).toThrow('pg_dump failed');
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

describe('no DELETE permission required', () => {
  test('backup code does not call DeleteObject', () => {
    const backupSource = fs.readFileSync(path.join(__dirname, '..', 'backup.js'), 'utf8');
    expect(backupSource).not.toContain('DeleteObjectCommand');
    expect(backupSource).not.toContain('deleteObject');
  });
});

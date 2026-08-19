/**
 * Deployment Portability Tests (PLAT-1)
 *
 * Proves that Qori's deployment configuration is not dependent on
 * any specific hosting provider or organization.
 */

import { validateDeployment, ValidationReport } from '../../helpers/deploymentValidator';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Run validator with specific env vars set */
function validateWith(env: Record<string, string>): ValidationReport {
  const original = { ...process.env };
  // Clear all deployment-relevant vars
  const deployVars = [
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_DIALECT',
    'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN',
    'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_CONFIG_REPO',
    'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL_NAME', 'ANTHROPIC_TEMPERATURE', 'ANTHROPIC_MAX_TOKENS',
    'SENTRY_DSN', 'NODE_ENV', 'PORT', 'QORI_RELEASE_ID', 'RAILWAY_GIT_COMMIT_SHA',
  ];
  for (const v of deployVars) {
    delete process.env[v];
  }
  Object.assign(process.env, env);
  try {
    return validateDeployment();
  } finally {
    // Restore
    for (const v of deployVars) {
      delete process.env[v];
    }
    Object.assign(process.env, original);
  }
}

const MINIMAL_VALID_ENV = {
  DB_HOST: 'db.example.gov',
  DB_PORT: '5432',
  DB_NAME: 'qori_prod',
  DB_USER: 'qori_app',
  DB_PASSWORD: 'secret',
  SLACK_BOT_TOKEN: 'xoxb-test-token',
  SLACK_SIGNING_SECRET: 'test-signing-secret',
  SLACK_APP_TOKEN: 'xapp-test-app-token',
  GITHUB_TOKEN: 'ghp_testtoken',
  GITHUB_OWNER: 'agency-org',
  GITHUB_REPO: 'research-studies',
  ANTHROPIC_API_KEY: 'sk-ant-test-key',
};

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('Deployment Validator', () => {
  test('passes with minimal valid configuration', () => {
    const report = validateWith(MINIMAL_VALID_ENV);
    expect(report.passed).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  test('fails when required database config is missing', () => {
    const env = { ...MINIMAL_VALID_ENV };
    delete (env as Record<string, string>).DB_HOST;
    const report = validateWith(env);
    expect(report.passed).toBe(false);
    expect(report.results.some(r => r.variable === 'DB_HOST' && r.severity === 'error')).toBe(true);
  });

  test('fails when required Slack config is missing', () => {
    const env = { ...MINIMAL_VALID_ENV };
    delete (env as Record<string, string>).SLACK_BOT_TOKEN;
    const report = validateWith(env);
    expect(report.passed).toBe(false);
    expect(report.results.some(r => r.variable === 'SLACK_BOT_TOKEN')).toBe(true);
  });

  test('fails when required GitHub config is missing', () => {
    const env = { ...MINIMAL_VALID_ENV };
    delete (env as Record<string, string>).GITHUB_OWNER;
    const report = validateWith(env);
    expect(report.passed).toBe(false);
    expect(report.results.some(r => r.variable === 'GITHUB_OWNER')).toBe(true);
  });

  test('fails when required model provider config is missing', () => {
    const env = { ...MINIMAL_VALID_ENV };
    delete (env as Record<string, string>).ANTHROPIC_API_KEY;
    const report = validateWith(env);
    expect(report.passed).toBe(false);
    expect(report.results.some(r => r.variable === 'ANTHROPIC_API_KEY')).toBe(true);
  });

  test('warns on invalid Slack token format', () => {
    const env = { ...MINIMAL_VALID_ENV, SLACK_BOT_TOKEN: 'invalid-format' };
    const report = validateWith(env);
    expect(report.results.some(r => r.variable === 'SLACK_BOT_TOKEN' && r.severity === 'warning')).toBe(true);
  });

  test('validates DB_PORT is an integer', () => {
    const env = { ...MINIMAL_VALID_ENV, DB_PORT: 'not-a-number' };
    const report = validateWith(env);
    expect(report.results.some(r => r.variable === 'DB_PORT' && r.severity === 'error')).toBe(true);
  });

  test('validates ANTHROPIC_TEMPERATURE range', () => {
    const env = { ...MINIMAL_VALID_ENV, ANTHROPIC_TEMPERATURE: '2.0' };
    const report = validateWith(env);
    expect(report.results.some(r => r.variable === 'ANTHROPIC_TEMPERATURE')).toBe(true);
  });

  test('accepts optional SENTRY_DSN when valid URL', () => {
    const env = { ...MINIMAL_VALID_ENV, SENTRY_DSN: 'https://key@sentry.io/123' };
    const report = validateWith(env);
    expect(report.results.filter(r => r.variable === 'SENTRY_DSN')).toHaveLength(0);
  });

  test('warns on invalid SENTRY_DSN format', () => {
    const env = { ...MINIMAL_VALID_ENV, SENTRY_DSN: 'not-a-url' };
    const report = validateWith(env);
    expect(report.results.some(r => r.variable === 'SENTRY_DSN' && r.severity === 'warning')).toBe(true);
  });

  test('observability is not a required dependency', () => {
    // No SENTRY_DSN set — should still pass
    const report = validateWith(MINIMAL_VALID_ENV);
    expect(report.passed).toBe(true);
  });
});

describe('Portability: no Railway-specific requirements', () => {
  test('validator does not require any RAILWAY_* env vars', () => {
    const report = validateWith(MINIMAL_VALID_ENV);
    expect(report.passed).toBe(true);
    // No result should reference RAILWAY
    expect(report.results.filter(r => r.variable.startsWith('RAILWAY_'))).toHaveLength(0);
  });
});

describe('Portability: no Friends-specific org/repo requirements', () => {
  test('validator accepts any GitHub owner and repo', () => {
    const env = {
      ...MINIMAL_VALID_ENV,
      GITHUB_OWNER: 'department-of-veterans-affairs',
      GITHUB_REPO: 'va-research-studies',
    };
    const report = validateWith(env);
    expect(report.passed).toBe(true);
  });

  test('GitHub configuration is fully env-var driven', () => {
    // Check github.ts for hardcoded org names
    const githubSource = fs.readFileSync(
      path.join(__dirname, '../../helpers/github.ts'),
      'utf-8'
    );
    // Should not contain hardcoded org references in runtime code
    // (comments and JSDoc are fine)
    const codeLines = githubSource.split('\n').filter(
      line => !line.trim().startsWith('//') && !line.trim().startsWith('*')
    );
    const codeOnly = codeLines.join('\n');
    expect(codeOnly).not.toMatch(/['"]Friends-Innovation-Lab['"]/);
    expect(codeOnly).not.toMatch(/['"]Friends-From-The-City['"]/);
    expect(codeOnly).not.toMatch(/['"]friends-innovation-lab['"]/);
  });
});

describe('Portability: configurable S3-compatible backup target', () => {
  test('no hardcoded backup endpoint in application code', () => {
    // Backup is external infrastructure — application code should not
    // contain hardcoded S3/backup endpoints
    const srcDir = path.join(__dirname, '../../');
    const result = execSync(
      `grep -r "s3\\.amazonaws\\.com\\|supabase\\.co" --include="*.ts" --include="*.js" "${srcDir}" 2>/dev/null || true`,
      { encoding: 'utf-8' }
    );
    // Filter out test files and comments
    const meaningful = result.split('\n').filter(line =>
      line.trim() &&
      !line.includes('__tests__') &&
      !line.includes('.test.') &&
      !line.includes('// ') &&
      !line.includes('* ')
    );
    expect(meaningful).toHaveLength(0);
  });
});

describe('Portability: secrets are not logged', () => {
  test('startup script does not log secret values', () => {
    const startScript = fs.readFileSync(
      path.join(__dirname, '../../../scripts/start.sh'),
      'utf-8'
    );
    // start.sh should not echo password or token values
    expect(startScript).not.toMatch(/echo.*\$\{?DB_PASSWORD/);
    expect(startScript).not.toMatch(/echo.*\$\{?SLACK_BOT_TOKEN/);
    expect(startScript).not.toMatch(/echo.*\$\{?SLACK_APP_TOKEN/);
    expect(startScript).not.toMatch(/echo.*\$\{?GITHUB_TOKEN/);
    expect(startScript).not.toMatch(/echo.*\$\{?ANTHROPIC_API_KEY/);
  });

  test('events.ts logs token presence, not values', () => {
    const eventsSource = fs.readFileSync(
      path.join(__dirname, '../../helpers/slack/events.ts'),
      'utf-8'
    );
    // Should log presence (!!process.env.X) not values
    expect(eventsSource).toMatch(/!!process\.env\.SLACK_BOT_TOKEN/);
    expect(eventsSource).toMatch(/!!process\.env\.SLACK_APP_TOKEN/);
  });
});

describe('Portability: missing required config fails closed', () => {
  test('all required vars missing produces errors for each', () => {
    const report = validateWith({});
    expect(report.passed).toBe(false);
    // Should have errors for DB, Slack, GitHub, and model provider
    const errorVars = report.results.filter(r => r.severity === 'error').map(r => r.variable);
    expect(errorVars).toContain('DB_HOST');
    expect(errorVars).toContain('SLACK_BOT_TOKEN');
    expect(errorVars).toContain('GITHUB_TOKEN');
    expect(errorVars).toContain('ANTHROPIC_API_KEY');
  });
});

describe('Portability: Redis is non-authoritative', () => {
  test('Redis client module is fully commented out', () => {
    const redisSource = fs.readFileSync(
      path.join(__dirname, '../../libs/redis.js'),
      'utf-8'
    );
    // Every non-empty line should be a comment
    const codeLines = redisSource.split('\n').filter(
      line => line.trim() && !line.trim().startsWith('//')
    );
    expect(codeLines).toHaveLength(0);
  });
});

describe('Portability: health/readiness is deterministic', () => {
  test('health endpoint exists in app.js', () => {
    const appSource = fs.readFileSync(
      path.join(__dirname, '../../app.js'),
      'utf-8'
    );
    expect(appSource).toMatch(/app\.get\(["']\/health["']/);
  });

  test('readiness endpoint exists in app.js', () => {
    const appSource = fs.readFileSync(
      path.join(__dirname, '../../app.js'),
      'utf-8'
    );
    expect(appSource).toMatch(/app\.get\(["']\/health\/ready["']/);
  });
});

describe('Portability: model provider boundary', () => {
  test('no direct ChatAnthropic import outside modelProvider.ts', () => {
    // This test already exists in modelProviderBoundary.test.ts
    // but we verify the pattern here as a portability concern
    const srcDir = path.join(__dirname, '../../');
    const result = execSync(
      `grep -r "from '@langchain/anthropic'" --include="*.ts" "${srcDir}" 2>/dev/null || true`,
      { encoding: 'utf-8' }
    );
    const importFiles = result.split('\n')
      .filter(line => line.trim())
      .map(line => line.split(':')[0])
      .filter(f => !f.includes('modelProvider.ts') && !f.includes('__tests__') && !f.includes('.test.'));
    expect(importFiles).toHaveLength(0);
  });
});

describe('Portability: Sentry release tag is provider-neutral', () => {
  test('sentry.js reads QORI_RELEASE_ID before RAILWAY_GIT_COMMIT_SHA', () => {
    const sentrySource = fs.readFileSync(
      path.join(__dirname, '../../config/sentry.js'),
      'utf-8'
    );
    expect(sentrySource).toMatch(/process\.env\.QORI_RELEASE_ID/);
    // QORI_RELEASE_ID should come first in the fallback chain
    const releaseMatch = sentrySource.match(/const release = (.+);/);
    expect(releaseMatch).toBeTruthy();
    expect(releaseMatch![1]).toMatch(/QORI_RELEASE_ID.*RAILWAY_GIT_COMMIT_SHA/);
  });
});

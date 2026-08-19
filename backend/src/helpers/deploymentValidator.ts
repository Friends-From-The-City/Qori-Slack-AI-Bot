/**
 * Deployment Validator (PLAT-1)
 *
 * Deterministic configuration validation that checks environment shape
 * without leaking secrets or making network mutations.
 *
 * Used by:
 * - `npm run validate:deployment` (CLI entry point)
 * - Health/readiness endpoint (runtime)
 * - Tests (portability verification)
 */

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  category: string;
  variable: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  passed: boolean;
  timestamp: string;
  results: ValidationResult[];
  summary: {
    errors: number;
    warnings: number;
    categories: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────

function present(name: string): boolean {
  const val = process.env[name];
  return val !== undefined && val !== '';
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isInteger(value: string): boolean {
  return /^\d+$/.test(value);
}

// ─────────────────────────────────────────────────────────────────────
// Validators by category
// ─────────────────────────────────────────────────────────────────────

function validateDatabase(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const category = 'DATABASE';

  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  for (const name of required) {
    if (!present(name)) {
      results.push({ valid: false, category, variable: name, message: `${name} is required`, severity: 'error' });
    }
  }

  if (present('DB_PORT') && !isInteger(process.env.DB_PORT!)) {
    results.push({ valid: false, category, variable: 'DB_PORT', message: 'DB_PORT must be an integer', severity: 'error' });
  }

  if (present('DB_DIALECT') && process.env.DB_DIALECT !== 'postgres') {
    results.push({ valid: false, category, variable: 'DB_DIALECT', message: 'DB_DIALECT must be "postgres" (only PostgreSQL is supported)', severity: 'error' });
  }

  return results;
}

function validateSlack(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const category = 'SLACK';

  const required = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];
  for (const name of required) {
    if (!present(name)) {
      results.push({ valid: false, category, variable: name, message: `${name} is required for Slack adapter`, severity: 'error' });
    }
  }

  // Format checks (without leaking values)
  if (present('SLACK_BOT_TOKEN') && !process.env.SLACK_BOT_TOKEN!.startsWith('xoxb-')) {
    results.push({ valid: false, category, variable: 'SLACK_BOT_TOKEN', message: 'SLACK_BOT_TOKEN should start with "xoxb-"', severity: 'warning' });
  }

  if (present('SLACK_APP_TOKEN') && !process.env.SLACK_APP_TOKEN!.startsWith('xapp-')) {
    results.push({ valid: false, category, variable: 'SLACK_APP_TOKEN', message: 'SLACK_APP_TOKEN should start with "xapp-"', severity: 'warning' });
  }

  return results;
}

function validateGitHub(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const category = 'GITHUB';

  const required = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
  for (const name of required) {
    if (!present(name)) {
      results.push({ valid: false, category, variable: name, message: `${name} is required for GitHub integration`, severity: 'error' });
    }
  }

  return results;
}

function validateModelProvider(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const category = 'MODEL_PROVIDER';

  if (!present('ANTHROPIC_API_KEY')) {
    results.push({ valid: false, category, variable: 'ANTHROPIC_API_KEY', message: 'ANTHROPIC_API_KEY is required for AI generation', severity: 'error' });
  }

  if (present('ANTHROPIC_TEMPERATURE')) {
    const temp = parseFloat(process.env.ANTHROPIC_TEMPERATURE!);
    if (isNaN(temp) || temp < 0 || temp > 1) {
      results.push({ valid: false, category, variable: 'ANTHROPIC_TEMPERATURE', message: 'ANTHROPIC_TEMPERATURE must be a float between 0.0 and 1.0', severity: 'error' });
    }
  }

  if (present('ANTHROPIC_MAX_TOKENS') && !isInteger(process.env.ANTHROPIC_MAX_TOKENS!)) {
    results.push({ valid: false, category, variable: 'ANTHROPIC_MAX_TOKENS', message: 'ANTHROPIC_MAX_TOKENS must be an integer', severity: 'error' });
  }

  return results;
}

function validateObservability(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const category = 'OBSERVABILITY';

  if (present('SENTRY_DSN') && !isValidUrl(process.env.SENTRY_DSN!)) {
    results.push({ valid: false, category, variable: 'SENTRY_DSN', message: 'SENTRY_DSN must be a valid URL', severity: 'warning' });
  }

  return results;
}

function validateApplication(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const category = 'APPLICATION';

  if (present('PORT') && !isInteger(process.env.PORT!)) {
    results.push({ valid: false, category, variable: 'PORT', message: 'PORT must be an integer', severity: 'error' });
  }

  if (present('NODE_ENV') && !['development', 'production', 'test'].includes(process.env.NODE_ENV!)) {
    results.push({ valid: false, category, variable: 'NODE_ENV', message: 'NODE_ENV should be "development", "production", or "test"', severity: 'warning' });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// Main validator
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate deployment configuration.
 * Returns actionable errors without leaking secret values.
 * No network mutations.
 */
export function validateDeployment(): ValidationReport {
  const allResults: ValidationResult[] = [
    ...validateApplication(),
    ...validateDatabase(),
    ...validateSlack(),
    ...validateGitHub(),
    ...validateModelProvider(),
    ...validateObservability(),
  ];

  const errors = allResults.filter(r => r.severity === 'error');
  const warnings = allResults.filter(r => r.severity === 'warning');
  const categories = [...new Set(allResults.map(r => r.category))];

  return {
    passed: errors.length === 0,
    timestamp: new Date().toISOString(),
    results: allResults,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      categories,
    },
  };
}

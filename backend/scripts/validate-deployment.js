#!/usr/bin/env node

/**
 * Deployment configuration validator CLI.
 *
 * Usage: npm run validate:deployment
 *
 * Checks configuration shape without leaking secrets or making network calls.
 * Exit code 0 = all required configuration present.
 * Exit code 1 = missing or invalid required configuration.
 */

require('dotenv').config();

// Import TS module via babel-register (same pattern as .sequelizerc)
require('@babel/register')({
  extensions: ['.ts', '.js'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
});

const { validateDeployment } = require('../src/helpers/deploymentValidator');

const report = validateDeployment();

console.log('=== Qori Deployment Configuration Validation ===\n');

if (report.results.length === 0) {
  console.log('  All configuration checks passed.\n');
} else {
  for (const result of report.results) {
    const icon = result.severity === 'error' ? 'ERROR' : 'WARN ';
    console.log(`  [${icon}] ${result.category} / ${result.variable}: ${result.message}`);
  }
  console.log('');
}

console.log(`Summary: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`);
console.log(`Result: ${report.passed ? 'PASSED' : 'FAILED'}\n`);

process.exit(report.passed ? 0 : 1);

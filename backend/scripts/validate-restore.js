#!/usr/bin/env node
/**
 * Restore Validation Script (GOV-5)
 *
 * Validates a restored PostgreSQL database against Qori's canonical expectations.
 * Used during disaster recovery drills and actual restore operations.
 *
 * Checks:
 *   1. Schema migration count matches expected
 *   2. All canonical tables exist
 *   3. FK and unique constraints are present
 *   4. Evidence graph has valid edges
 *   5. Core entity counts are non-negative
 *   6. WAL/archive settings (informational)
 *
 * Usage:
 *   node scripts/validate-restore.js
 *
 * Environment:
 *   Uses DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_DIALECT
 *   (same as the application)
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - One or more checks failed
 */

require('@babel/register')({
  extensions: ['.js', '.ts'],
  babelrc: false,
  presets: [
    '@babel/preset-env',
    ['@babel/preset-typescript', { allowDeclareFields: true }],
  ],
});

const { Sequelize, QueryTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

const sequelize = new Sequelize({
  dialect: process.env.DB_DIALECT || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'railway',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  logging: false,
});

// Canonical tables that must exist in any valid Qori database.
// This is the minimum set — a fully-migrated DB may have more.
const CORE_TABLES = [
  'SequelizeMeta',
  'projects',
  'research_studies',
  'study_participants',
  'study_variables',
  'evidence_sources',
  'evidence_constructs',
  'evidence_relationships',
  'session_summaries',
  'research_plans',
  'data_subjects',
  'data_subject_links',
];

const results = [];

function pass(check, detail) {
  results.push({ status: 'PASS', check, detail });
  console.log(`  ✓ ${check}: ${detail}`);
}

function fail(check, detail) {
  results.push({ status: 'FAIL', check, detail });
  console.error(`  ✗ ${check}: ${detail}`);
}

function info(check, detail) {
  results.push({ status: 'INFO', check, detail });
  console.log(`  ℹ ${check}: ${detail}`);
}

async function run() {
  console.log('\n=== Qori Restore Validation ===\n');

  try {
    await sequelize.authenticate();
    pass('Connection', 'Database is reachable');
  } catch (err) {
    fail('Connection', `Cannot connect: ${err.message}`);
    process.exit(1);
  }

  // 1. Migration count
  const migrationsDir = path.join(__dirname, '..', 'src', 'database', 'migrations');
  let expectedMigrations = 0;
  try {
    // Count both .js and .ts migration files
    expectedMigrations = fs.readdirSync(migrationsDir)
      .filter(f => /\.(js|ts)$/.test(f) && !f.startsWith('.'))
      .length;
  } catch {
    info('Migration files', 'Could not read migrations directory — skipping count comparison');
  }

  const [{ count: appliedMigrations }] = await sequelize.query(
    'SELECT COUNT(*)::int as count FROM "SequelizeMeta"',
    { type: QueryTypes.SELECT }
  );

  if (expectedMigrations > 0 && appliedMigrations === expectedMigrations) {
    pass('Migration count', `${appliedMigrations} applied = ${expectedMigrations} expected`);
  } else if (expectedMigrations > 0) {
    fail('Migration count', `${appliedMigrations} applied vs ${expectedMigrations} expected`);
  } else {
    info('Migration count', `${appliedMigrations} applied (no local reference to compare)`);
  }

  // 2. Core tables exist
  const tableRows = await sequelize.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    { type: QueryTypes.SELECT }
  );
  const tables = new Set(tableRows.map(r => r.tablename));

  const missingTables = CORE_TABLES.filter(t => !tables.has(t));
  if (missingTables.length === 0) {
    pass('Core tables', `All ${CORE_TABLES.length} core tables present (${tables.size} total)`);
  } else {
    fail('Core tables', `Missing: ${missingTables.join(', ')}`);
  }

  // 3. FK constraints
  const [{ count: fkCount }] = await sequelize.query(
    `SELECT COUNT(*)::int as count FROM information_schema.table_constraints
     WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'`,
    { type: QueryTypes.SELECT }
  );
  if (fkCount > 0) {
    pass('FK constraints', `${fkCount} foreign key constraints present`);
  } else {
    fail('FK constraints', 'No foreign key constraints found');
  }

  // 4. Unique constraints
  const [{ count: uniqueCount }] = await sequelize.query(
    `SELECT COUNT(*)::int as count FROM information_schema.table_constraints
     WHERE constraint_type = 'UNIQUE' AND table_schema = 'public'`,
    { type: QueryTypes.SELECT }
  );
  if (uniqueCount > 0) {
    pass('Unique constraints', `${uniqueCount} unique constraints present`);
  } else {
    fail('Unique constraints', 'No unique constraints found');
  }

  // 5. Row counts (informational — we check they're non-negative and queryable)
  const countTables = [
    'projects', 'research_studies', 'evidence_sources', 'evidence_constructs',
    'evidence_relationships', 'study_participants', 'study_variables',
  ].filter(t => tables.has(t));

  for (const tbl of countTables) {
    const [{ count }] = await sequelize.query(
      `SELECT COUNT(*)::int as count FROM "${tbl}"`,
      { type: QueryTypes.SELECT }
    );
    info(`Row count: ${tbl}`, `${count} rows`);
  }

  // 6. Evidence graph edges
  if (tables.has('evidence_relationships')) {
    const [{ count: edgeCount }] = await sequelize.query(
      `SELECT COUNT(*)::int as count FROM evidence_relationships
       WHERE from_source_id IS NOT NULL AND to_construct_id IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );
    if (edgeCount > 0) {
      pass('Evidence graph', `${edgeCount} source→construct edges`);
    } else {
      info('Evidence graph', 'No source→construct edges (may be expected for empty/new DB)');
    }
  }

  // 7. WAL settings (informational)
  const [walLevel] = await sequelize.query("SHOW wal_level", { type: QueryTypes.SELECT });
  const [archiveMode] = await sequelize.query("SHOW archive_mode", { type: QueryTypes.SELECT });
  info('WAL level', walLevel.wal_level);
  info('Archive mode', archiveMode.archive_mode);

  // Summary
  console.log('\n=== Summary ===\n');
  const failures = results.filter(r => r.status === 'FAIL');
  const passes = results.filter(r => r.status === 'PASS');
  console.log(`  ${passes.length} passed, ${failures.length} failed, ${results.length - passes.length - failures.length} info\n`);

  if (failures.length > 0) {
    console.error('RESTORE VALIDATION FAILED\n');
    process.exit(1);
  } else {
    console.log('RESTORE VALIDATION PASSED\n');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
}).finally(() => {
  sequelize.close();
});

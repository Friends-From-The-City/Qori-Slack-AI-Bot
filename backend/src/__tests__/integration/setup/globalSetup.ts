/**
 * Jest global setup for integration tests.
 *
 * Connects to the test Postgres database and runs all Sequelize migrations.
 *
 * Supports two database modes (controlled by env vars):
 *   1. Docker (docker-compose.test.yml): port 5433, user qori_test/test
 *   2. Local Homebrew Postgres: port 5432, OS user, trust auth
 *
 * Default: local Homebrew (no Docker required for development).
 * Override via TEST_DB_* env vars.
 */

import { Sequelize } from 'sequelize';
import { execSync } from 'child_process';
import path from 'path';

function getDbConfig() {
  return {
    username: process.env.TEST_DB_USER ?? process.env.USER ?? 'qori_test',
    password: process.env.TEST_DB_PASSWORD ?? '',
    database: process.env.TEST_DB_NAME ?? 'qori_test',
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: parseInt(process.env.TEST_DB_PORT ?? '5432', 10),
    dialect: 'postgres' as const,
    logging: false,
  };
}

export default async function globalSetup() {
  const dbConfig = getDbConfig();

  // Verify database is reachable
  const sequelize = new Sequelize(dbConfig);
  try {
    await sequelize.authenticate();
    console.log('\n  ✓ Test database connected');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot connect to test database at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}.\n` +
      `  Local:  brew services start postgresql@18 && createdb qori_test\n` +
      `  Docker: docker compose -f docker-compose.test.yml up -d\n` +
      `Error: ${msg}`
    );
  } finally {
    await sequelize.close();
  }

  // Run migrations using sequelize-cli with test database env vars.
  // Spread process.env first so PATH, HOME, etc. are preserved.
  const backendDir = path.resolve(__dirname, '../../../..');
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  env.DB_HOST = dbConfig.host;
  env.DB_PORT = String(dbConfig.port);
  env.DB_NAME = dbConfig.database;
  env.DB_USER = dbConfig.username;
  env.DB_PASSWORD = dbConfig.password;
  env.DB_DIALECT = 'postgres';

  try {
    execSync('npx sequelize-cli db:migrate', {
      cwd: backendDir,
      env,
      stdio: 'pipe',
    });
    console.log('  ✓ Migrations complete');
  } catch (err) {
    const output = err instanceof Error && 'stderr' in err ? (err as any).stderr?.toString() : String(err);
    throw new Error(`Migration failed:\n${output}`);
  }

  // Store config for test files to use
  process.env.TEST_DB_USER = dbConfig.username;
  process.env.TEST_DB_PASSWORD = dbConfig.password;
  process.env.TEST_DB_NAME = dbConfig.database;
  process.env.TEST_DB_HOST = dbConfig.host;
  process.env.TEST_DB_PORT = String(dbConfig.port);
}

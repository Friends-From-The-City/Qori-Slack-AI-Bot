#!/bin/sh
# Qori Backend Startup Script
# Runs migrations before starting the app, ensuring code+schema deploy together.
# Used by Dockerfile CMD in any deployment environment.

echo ">>> START.SH IS RUNNING <<<"

set -e

echo "=== Qori Backend Startup ==="
echo "Environment: ${NODE_ENV:-development}"
echo "Database: ${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}"

# Wait for database to be ready (managed databases can take a moment to accept connections)
echo "Waiting for database connection..."
MAX_RETRIES=30
RETRY_COUNT=0

until node -e "
const { Sequelize } = require('sequelize');
const seq = new Sequelize({
  dialect: process.env.DB_DIALECT,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  logging: false
});
seq.authenticate().then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: Could not connect to database after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "  Attempt $RETRY_COUNT/$MAX_RETRIES - waiting 2s..."
  sleep 2
done

echo "Database connection verified."

# Run migrations
echo "Running database migrations..."
npx sequelize-cli db:migrate

if [ $? -eq 0 ]; then
  echo "Migrations completed successfully."
else
  echo "ERROR: Migrations failed!"
  exit 1
fi

# Verify migration state (count applied vs expected)
APPLIED_COUNT=$(node -e "
const { Sequelize } = require('sequelize');
const seq = new Sequelize({
  dialect: process.env.DB_DIALECT,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  logging: false
});
seq.query('SELECT COUNT(*) as count FROM \"SequelizeMeta\"', { type: seq.QueryTypes.SELECT })
  .then(r => { console.log(r[0].count); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
")

EXPECTED_COUNT=$(ls -1 src/database/migrations/*.js 2>/dev/null | wc -l | tr -d ' ')

echo "Migration state: $APPLIED_COUNT applied, $EXPECTED_COUNT expected"

if [ "$APPLIED_COUNT" != "$EXPECTED_COUNT" ]; then
  echo "ERROR: Migration count mismatch! Applied: $APPLIED_COUNT, Expected: $EXPECTED_COUNT"
  echo "This may indicate migrations that failed silently or were not committed."
  exit 1
fi

# Validate schema matches models
# This catches the "code expects column that doesn't exist" class of bugs
echo "Validating schema matches model definitions..."
node scripts/validate-schema.js

if [ $? -ne 0 ]; then
  echo "ERROR: Schema validation failed!"
  exit 1
fi

# Start the application
echo "Starting Qori backend..."
exec node ./dist/app.js

#!/usr/bin/env node
/**
 * Schema Validation Script
 *
 * Verifies that all Sequelize model columns exist in the database.
 * Catches the "code expects column that doesn't exist" class of bugs.
 *
 * Run after migrations, before starting the app or running tests.
 *
 * Usage: node scripts/validate-schema.js
 *
 * Exit codes:
 *   0 - Schema valid, all model columns exist in database
 *   1 - Schema invalid, missing columns found
 */

require('@babel/register')({
  extensions: ['.js', '.ts'],
  presets: ['@babel/preset-env', '@babel/preset-typescript'],
});

const { Sequelize } = require('sequelize');

// Import model definers - same list as database/index.ts
const modelDefiners = [
  require('../src/database/models/channel_config').default,
  require('../src/database/models/project').default,
  require('../src/database/models/project_member').default,
  require('../src/database/models/research_study').default,
  require('../src/database/models/research_study_user_role').default,
  require('../src/database/models/study_status').default,
  require('../src/database/models/study_participant').default,
  require('../src/database/models/session_observer').default,
  require('../src/database/models/study_notes').default,
  require('../src/database/models/research_plan').default,
  require('../src/database/models/session_summary').default,
  require('../src/database/models/study_variable').default,
  require('../src/database/models/created_issue').default,
  require('../src/database/models/slack_user_state').default,
  require('../src/database/models/disposition_audit_log').default,
];

async function validateSchema() {
  // Use environment variables for database connection
  const sequelize = new Sequelize({
    dialect: process.env.DB_DIALECT || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'qori_test',
    username: process.env.DB_USER || 'qori_test',
    password: process.env.DB_PASSWORD || 'test',
    logging: false,
  });

  // Register all models
  for (const defineModel of modelDefiners) {
    defineModel(sequelize);
  }

  const errors = [];

  for (const [modelName, model] of Object.entries(sequelize.models)) {
    const tableName = model.getTableName();
    if (typeof tableName !== 'string') continue;

    // Get actual columns from database
    const dbColumns = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const dbColumnNames = new Set(dbColumns.map(c => c.column_name));

    // Check if table exists
    if (dbColumnNames.size === 0) {
      errors.push(`Table "${tableName}" (model ${modelName}) does not exist in database`);
      continue;
    }

    // Get expected columns from model
    const modelAttrs = model.getAttributes();
    for (const [attrName, attrDef] of Object.entries(modelAttrs)) {
      const columnName = attrDef.field || attrName;
      if (!dbColumnNames.has(columnName)) {
        errors.push(`${modelName}.${attrName} expects column "${columnName}" but it does not exist in table "${tableName}"`);
      }
    }
  }

  await sequelize.close();

  if (errors.length > 0) {
    console.error('Schema validation FAILED:');
    errors.forEach(e => console.error(`  - ${e}`));
    console.error('');
    console.error('This means the code expects database columns that do not exist.');
    console.error('Check that all migrations have been run and that model definitions match migrations.');
    process.exit(1);
  }

  console.log(`Schema validation passed: ${Object.keys(sequelize.models).length} models verified`);
  process.exit(0);
}

validateSchema().catch(e => {
  console.error('Schema validation error:', e.message);
  process.exit(1);
});

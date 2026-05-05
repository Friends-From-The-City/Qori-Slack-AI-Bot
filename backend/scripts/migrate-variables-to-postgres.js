#!/usr/bin/env node
/**
 * One-time migration: read study-variables.json and discovery-variables.json
 * from GitHub, parse them, insert rows into Postgres study_variables table.
 *
 * Usage: node scripts/migrate-variables-to-postgres.js
 * Requires: DATABASE_URL, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO env vars
 */
require('dotenv').config();

const sequelize = require('../src/database');
const { fetchFileFromRepoByPath } = require('../src/helpers/github');
const { Octokit } = require('@octokit/rest');

const REPO = process.env.GITHUB_REPO;
const OWNER = process.env.GITHUB_OWNER;

async function main() {
  console.log('🔄 Starting variable migration to Postgres...');
  console.log(`   Repo: ${OWNER}/${REPO}`);

  const StudyVariable = sequelize.models.StudyVariable;
  if (!StudyVariable) {
    console.error('❌ StudyVariable model not found. Run migrations first.');
    process.exit(1);
  }

  // Authenticate sequelize
  await sequelize.authenticate();
  console.log('✅ Database connected');

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  let migrated = 0;
  let skipped = 0;

  // 1. Find all study-variables.json files
  console.log('\n📁 Searching for study-variables.json files...');
  const studyVarFiles = await findFiles(octokit, 'study-variables.json');
  console.log(`   Found ${studyVarFiles.length} study variable files`);

  for (const filePath of studyVarFiles) {
    try {
      const file = await fetchFileFromRepoByPath(REPO, filePath);
      const data = JSON.parse(file.content);
      const studySlug = data.study || filePath.split('/').slice(-4, -3)[0] || 'unknown';

      // Check if already migrated
      const existing = await StudyVariable.count({ where: { study_name: studySlug, scope: 'study', value: { [sequelize.Sequelize.Op.ne]: null } } });
      if (existing > 0) {
        console.log(`   ⏭️  ${studySlug}: already has ${existing} rows in Postgres, skipping`);
        skipped++;
        continue;
      }

      let rowCount = 0;
      await sequelize.transaction(async (t) => {
        for (const [key, variable] of Object.entries(data.variables || {})) {
          if (variable.pool && Array.isArray(variable.value)) {
            for (const item of variable.value) {
              await StudyVariable.create({
                study_name: studySlug,
                variable_key: key,
                variable_type: 'pool',
                item_key: (typeof item === 'object' && item?.id) || null,
                value: typeof item === 'object' ? item : { _raw: item },
                participant_id: (typeof item === 'object' && (item?.participant || item?.participant_id)) || null,
                source_template: variable.source?.template || 'unknown',
                source_version: variable.source?.version || null,
                source_date: variable.source?.date || variable.source?.dates?.[0] || new Date().toISOString(),
                is_pool: true,
                scope: 'study',
                stale: false,
                extracted_at: new Date(),
                updated_at: new Date(),
              }, { transaction: t });
              rowCount++;
            }
          } else {
            await StudyVariable.create({
              study_name: studySlug,
              variable_key: key,
              variable_type: 'singleton',
              item_key: null,
              value: variable.value,
              participant_id: null,
              source_template: variable.source?.template || 'unknown',
              source_version: variable.source?.version || null,
              source_date: variable.source?.date || new Date().toISOString(),
              is_pool: false,
              scope: 'study',
              stale: false,
              extracted_at: new Date(),
              updated_at: new Date(),
            }, { transaction: t });
            rowCount++;
          }
        }
      });

      console.log(`   ✅ ${studySlug}: migrated ${rowCount} rows`);
      migrated++;
    } catch (err) {
      console.error(`   ❌ ${filePath}: ${err.message}`);
    }
  }

  // 2. Find all discovery-variables.json files
  console.log('\n📁 Searching for discovery-variables.json files...');
  const discoveryVarFiles = await findFiles(octokit, 'discovery-variables.json');
  console.log(`   Found ${discoveryVarFiles.length} discovery variable files`);

  for (const filePath of discoveryVarFiles) {
    try {
      const file = await fetchFileFromRepoByPath(REPO, filePath);
      const data = JSON.parse(file.content);
      const team = data.team || 'friends-lab';
      const discoveryType = data.discovery_type || filePath.split('/').slice(-3, -2)[0] || 'unknown';
      const discoveryStudyId = `discovery:${team}:${discoveryType}`;

      // Check if already migrated
      const existing = await StudyVariable.count({ where: { study_name: discoveryStudyId, scope: 'discovery', value: { [sequelize.Sequelize.Op.ne]: null } } });
      if (existing > 0) {
        console.log(`   ⏭️  ${discoveryStudyId}: already migrated, skipping`);
        skipped++;
        continue;
      }

      let rowCount = 0;
      await sequelize.transaction(async (t) => {
        for (const [artifactId, artifactVars] of Object.entries(data.artifacts || {})) {
          for (const [key, variable] of Object.entries(artifactVars)) {
            const values = Array.isArray(variable.value) ? variable.value : [variable.value];
            const isPool = Array.isArray(variable.value);

            for (const item of values) {
              await StudyVariable.create({
                study_name: discoveryStudyId,
                variable_key: key,
                variable_type: isPool ? 'pool' : 'singleton',
                item_key: (typeof item === 'object' && item?.id) || null,
                value: typeof item === 'object' ? item : { _raw: item },
                participant_id: null,
                source_template: variable.source?.template || 'unknown',
                source_version: variable.source?.version || null,
                source_date: variable.source?.date || new Date().toISOString(),
                is_pool: isPool,
                scope: 'discovery',
                discovery_artifact_id: artifactId,
                stale: false,
                extracted_at: new Date(),
                updated_at: new Date(),
              }, { transaction: t });
              rowCount++;
            }
          }
        }
      });

      console.log(`   ✅ ${discoveryStudyId}: migrated ${rowCount} rows`);
      migrated++;
    } catch (err) {
      console.error(`   ❌ ${filePath}: ${err.message}`);
    }
  }

  console.log(`\n🏁 Migration complete: ${migrated} files migrated, ${skipped} skipped`);
  process.exit(0);
}

async function findFiles(octokit, filename) {
  try {
    const { data } = await octokit.rest.git.getTree({
      owner: OWNER,
      repo: REPO,
      tree_sha: 'main',
      recursive: '1',
    });
    return data.tree
      .filter(item => item.type === 'blob' && item.path.endsWith(filename))
      .map(item => item.path);
  } catch (err) {
    console.error(`Error fetching file tree: ${err.message}`);
    return [];
  }
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

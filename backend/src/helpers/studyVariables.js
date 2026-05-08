// studyVariables.js — Authoritative variable store backed by Postgres
// Fallback: reads from GitHub study-variables.json if Postgres has no data (migration period)
const { fetchFileFromRepoByPath, createOrUpdateFileOnGitHub } = require('./github');

const VARIABLES_DIR = '.variables';
const VARIABLES_FILE = 'study-variables.json';
const DISCOVERY_VARIABLES_FILE = 'discovery-variables.json';

// ═══════════════════════════════════════════════════════════
// POSTGRES HELPERS
// ═══════════════════════════════════════════════════════════

function getStudyVariableModel() {
  try {
    const sequelize = require('../database');
    return sequelize.models.StudyVariable;
  } catch (err) {
    console.warn('⚠️ Could not load StudyVariable model:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// STUDY-SCOPED READ/WRITE
// ═══════════════════════════════════════════════════════════

/**
 * Read study variables from Postgres. Falls back to GitHub JSON during migration.
 * Returns a structure compatible with the old JSON format for backward compat.
 */
async function readStudyVariables(studyBasePath) {
  const studySlug = extractStudySlug(studyBasePath);
  const StudyVariable = getStudyVariableModel();

  if (StudyVariable) {
    try {
      const rows = await StudyVariable.findAll({
        where: { study_name: studySlug, scope: 'study' },
      });

      if (rows.length > 0) {
        return rowsToVariablesStructure(rows, studySlug);
      }
    } catch (err) {
      console.warn('⚠️ Postgres read failed, falling back to GitHub:', err.message);
    }
  }

  // Fallback: read from GitHub (migration period or Postgres unavailable)
  return readStudyVariablesFromGitHub(studyBasePath);
}

/**
 * Write study variables to Postgres. Also writes GitHub JSON as debugging artifact.
 */
async function writeStudyVariables(studyBasePath, variablesData) {
  const studySlug = extractStudySlug(studyBasePath);
  const StudyVariable = getStudyVariableModel();

  if (StudyVariable) {
    try {
      await writeVariablesToPostgres(StudyVariable, studySlug, 'study', variablesData);
      console.log(`✅ Variables written to Postgres for ${studySlug}`);
    } catch (err) {
      console.error(`❌ Postgres write failed for ${studySlug}:`, err.message);
      // Fall through to GitHub write as safety net
    }
  }

  // Also write GitHub JSON (debugging artifact, not authoritative)
  try {
    const filePath = `${studyBasePath}/primary-research/${VARIABLES_DIR}/${VARIABLES_FILE}`;
    variablesData.last_updated = new Date().toISOString();
    const content = JSON.stringify(variablesData, null, 2);
    await createOrUpdateFileOnGitHub(filePath, content);
  } catch (err) {
    // Non-blocking: GitHub write failure doesn't affect cascade
    console.warn(`⚠️ GitHub variables artifact write failed (non-blocking): ${err.message}`);
  }
}

/**
 * Merge extracted variables into Postgres using proper transactions.
 * Implements append_or_replace_per_participant atomically.
 */
async function mergeVariables(existing, extracted, sourceTemplate, sourceVersion) {
  const StudyVariable = getStudyVariableModel();
  const now = new Date().toISOString();

  // If Postgres is unavailable, fall back to in-memory merge (old behavior)
  if (!StudyVariable) {
    return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
  }

  const studySlug = existing.study || 'unknown';
  const sequelize = require('../database');

  try {
    await sequelize.transaction(async (t) => {
      for (const [key, extractedVar] of Object.entries(extracted)) {
        const emitSpec = extractedVar._emitSpec;
        const isPool = emitSpec?.pool === true;
        const poolStrategy = emitSpec?.pool_strategy || 'replace';
        const values = extractedVar.value;

        if (isPool && Array.isArray(values)) {
          // Determine participant for per-participant pools
          const participantId = values[0]?.participant || values[0]?.participant_id || null;

          // Delete existing entries for this variable + participant (replace per participant)
          if (poolStrategy === 'append_or_replace_per_participant' && participantId) {
            await StudyVariable.destroy({
              where: {
                study_name: studySlug,
                variable_key: key,
                participant_id: participantId,
                scope: 'study',
              },
              transaction: t,
            });
          } else if (poolStrategy === 'append' && participantId) {
            // Same behavior: replace this participant's entries
            await StudyVariable.destroy({
              where: {
                study_name: studySlug,
                variable_key: key,
                participant_id: participantId,
                scope: 'study',
              },
              transaction: t,
            });
          } else if (poolStrategy === 'replace') {
            // Full replace: delete all entries for this variable
            await StudyVariable.destroy({
              where: {
                study_name: studySlug,
                variable_key: key,
                scope: 'study',
              },
              transaction: t,
            });
          }

          // Insert new pool items
          for (const item of values) {
            const itemKey = item.id || null;
            const itemParticipant = item.participant || item.participant_id || participantId;

            await StudyVariable.create({
              study_name: studySlug,
              variable_key: key,
              variable_type: 'pool',
              item_key: itemKey,
              value: item,
              participant_id: itemParticipant,
              source_template: sourceTemplate,
              source_version: sourceVersion,
              source_date: now,
              is_pool: true,
              confidence: item.confidence || null,
              scope: 'study',
              stale: false,
              extracted_at: now,
              updated_at: now,
            }, { transaction: t });
          }
        } else {
          // Singleton: upsert single row
          await StudyVariable.destroy({
            where: {
              study_name: studySlug,
              variable_key: key,
              scope: 'study',
            },
            transaction: t,
          });

          await StudyVariable.create({
            study_name: studySlug,
            variable_key: key,
            variable_type: 'singleton',
            item_key: null,
            value: values,
            participant_id: null,
            source_template: sourceTemplate,
            source_version: sourceVersion,
            source_date: now,
            is_pool: false,
            scope: 'study',
            stale: false,
            extracted_at: now,
            updated_at: now,
          }, { transaction: t });
        }
      }
    });

    console.log(`✅ mergeVariables: Transaction committed for ${studySlug} (${Object.keys(extracted).length} variables)`);
  } catch (err) {
    console.error(`❌ mergeVariables transaction failed:`, err.message);
    // Fall back to in-memory merge
    return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
  }

  // Also update in-memory structure (for GitHub artifact write)
  return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
}

/**
 * Normalize field names in stored variable data to match current schema.
 * Handles renames across schema versions without requiring DB migrations.
 */
const FIELD_RENAMES = {
  validated_themes: {
    label: 'theme_name',
    description: 'summary',
    nugget_refs: 'supporting_nuggets',
    confidence_rationale: 'confidence_reasoning',
    participants: 'participants_observed',
  },
  personas: {
    archetype_name: 'persona_name',
    based_on: 'based_on_participants',
    key_need: 'summary',
  },
  prioritized_findings: {
    finding_number: 'id',
    title: 'finding',
    affected_count: 'participant_coverage',
    confidence: 'evidence_strength',
  },
  prioritized_recommendations: {
    action: 'recommendation',
    timeframe: 'priority',
    addresses_finding: 'addresses_findings',
  },
};

/**
 * Convert old flat-string arrays to ID'd object arrays.
 * e.g., ["barrier text 1", "barrier text 2"] → [{id: "TB-001", barrier: "barrier text 1"}, ...]
 */
const FLAT_TO_OBJECT_UPGRADES = {
  target_barriers: (str, idx) => ({
    id: `TB-${String(idx + 1).padStart(3, '0')}`,
    barrier: str,
    source: null,
  }),
  research_questions: (str, idx) => ({
    id: `RQ-${String(idx + 1).padStart(3, '0')}`,
    question: str,
    priority: null,
  }),
};

function normalizeVariableFields(key, value) {
  // First: upgrade flat string arrays to ID'd objects
  const upgrader = FLAT_TO_OBJECT_UPGRADES[key];
  if (upgrader && Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value.map((item, idx) => upgrader(item, idx));
  }

  // Then: apply field renames
  const renames = FIELD_RENAMES[key];
  if (!renames) return value;

  const normalize = (item) => {
    if (!item || typeof item !== 'object') return item;
    const normalized = { ...item };
    for (const [oldName, newName] of Object.entries(renames)) {
      if (normalized[oldName] !== undefined && normalized[newName] === undefined) {
        normalized[newName] = normalized[oldName];
        delete normalized[oldName];
      }
    }
    return normalized;
  };

  return Array.isArray(value) ? value.map(normalize) : normalize(value);
}

/**
 * Read specific upstream variables for a template's consumes spec.
 */
async function readUpstreamVariables(studyBasePath, consumesSpec) {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  const studySlug = extractStudySlug(studyBasePath);
  const StudyVariable = getStudyVariableModel();
  const upstream = {};

  if (StudyVariable) {
    try {
      for (const spec of consumesSpec) {
        const rows = await StudyVariable.findAll({
          where: {
            study_name: studySlug,
            variable_key: spec.key,
            scope: 'study',
          },
        });

        if (rows.length > 0) {
          const isPool = rows[0].is_pool;
          const rawValue = isPool ? rows.map(r => r.value) : rows[0].value;
          upstream[spec.key] = {
            value: normalizeVariableFields(spec.key, rawValue),
            source: {
              template: rows[0].source_template,
              version: rows[0].source_version,
              date: rows[0].source_date,
            },
          };
        } else if (spec.required) {
          console.warn(`⚠️ Required upstream variable "${spec.key}" not found for study ${studySlug}`);
        }
      }

      if (Object.keys(upstream).length > 0) return upstream;
    } catch (err) {
      console.warn('⚠️ Postgres upstream read failed, falling back to GitHub:', err.message);
    }
  }

  // Fallback: read from GitHub
  const studyVars = await readStudyVariablesFromGitHub(studyBasePath);
  for (const spec of consumesSpec) {
    const variable = studyVars.variables[spec.key];
    if (variable) {
      upstream[spec.key] = {
        value: normalizeVariableFields(spec.key, variable.value),
        source: variable.source,
        confidence: variable.confidence,
      };
    } else if (spec.required) {
      console.warn(`⚠️ Required upstream variable "${spec.key}" not found for study ${studyBasePath}`);
    }
  }

  return upstream;
}

// ═══════════════════════════════════════════════════════════
// DISCOVERY-SCOPED READ/WRITE
// ═══════════════════════════════════════════════════════════

/**
 * Read discovery variables from Postgres. Falls back to GitHub.
 */
async function readDiscoveryVariables(team, discoveryType) {
  const StudyVariable = getStudyVariableModel();
  const discoveryStudyId = `discovery:${team}:${discoveryType}`;

  if (StudyVariable) {
    try {
      const rows = await StudyVariable.findAll({
        where: { study_name: discoveryStudyId, scope: 'discovery' },
      });

      if (rows.length > 0) {
        return rowsToDiscoveryStructure(rows, team, discoveryType);
      }
    } catch (err) {
      console.warn('⚠️ Postgres discovery read failed, falling back to GitHub:', err.message);
    }
  }

  // Fallback: GitHub
  return readDiscoveryVariablesFromGitHub(team, discoveryType);
}

/**
 * Write discovery variables to Postgres. Also writes GitHub artifact.
 */
async function writeDiscoveryVariables(team, discoveryType, variablesData) {
  const StudyVariable = getStudyVariableModel();
  const discoveryStudyId = `discovery:${team}:${discoveryType}`;

  if (StudyVariable) {
    try {
      await writeDiscoveryToPostgres(StudyVariable, discoveryStudyId, variablesData);
      console.log(`✅ Discovery variables written to Postgres for ${discoveryStudyId}`);
    } catch (err) {
      console.error(`❌ Postgres discovery write failed:`, err.message);
    }
  }

  // Also write GitHub artifact
  try {
    const filePath = `${team}/_discovery/${discoveryType}/${VARIABLES_DIR}/${DISCOVERY_VARIABLES_FILE}`;
    variablesData.last_updated = new Date().toISOString();
    const content = JSON.stringify(variablesData, null, 2);
    await createOrUpdateFileOnGitHub(filePath, content);
  } catch (err) {
    console.warn(`⚠️ GitHub discovery artifact write failed (non-blocking): ${err.message}`);
  }
}

/**
 * Merge discovery variables into Postgres.
 */
function mergeDiscoveryVariables(existing, extracted, discoveryArtifactId, sourceTemplate, sourceVersion) {
  const now = new Date().toISOString();

  if (!existing.artifacts[discoveryArtifactId]) {
    existing.artifacts[discoveryArtifactId] = {};
  }
  const artifact = existing.artifacts[discoveryArtifactId];

  for (const [key, extractedVar] of Object.entries(extracted)) {
    artifact[key] = {
      value: extractedVar.value,
      source: {
        template: sourceTemplate,
        version: sourceVersion,
        date: now,
      },
      discovery_artifact_id: discoveryArtifactId,
    };
  }

  if (!existing.generation_snapshots) {
    existing.generation_snapshots = {};
  }
  existing.generation_snapshots[`${discoveryArtifactId}:${sourceTemplate}`] = {
    last_generated: now,
    variable_hash: hashVariables(extracted),
  };

  return existing;
}

/**
 * Read upstream discovery variables.
 */
async function readUpstreamDiscoveryVariables(team, discoveryType, discoveryArtifactId, consumesSpec) {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  const upstream = {};
  for (const spec of consumesSpec) {
    const sourceType = spec.source_discovery_type || discoveryType;
    const discoveryVars = await readDiscoveryVariables(team, sourceType);
    const artifactVars = discoveryVars.artifacts?.[discoveryArtifactId] || {};
    const variable = artifactVars[spec.key];

    if (variable) {
      upstream[spec.key] = { value: variable.value, source: variable.source };
    } else if (spec.required) {
      console.warn(`⚠️ Required upstream discovery variable "${spec.key}" not found for artifact ${discoveryArtifactId}`);
    }
  }

  return upstream;
}

// ═══════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════

function extractStudySlug(studyBasePath) {
  if (!studyBasePath) return 'unknown';
  return decodeURIComponent(studyBasePath).split('/').pop() || 'unknown';
}

/**
 * Convert Postgres rows back to the old JSON structure (backward compat).
 */
function rowsToVariablesStructure(rows, studySlug) {
  const variables = {};
  for (const row of rows) {
    const key = row.variable_key;
    if (!variables[key]) {
      variables[key] = {
        value: row.is_pool ? [] : null,
        source: {
          template: row.source_template,
          version: row.source_version,
          date: row.source_date,
        },
        pool: row.is_pool,
      };
    }
    if (row.is_pool) {
      variables[key].value.push(row.value);
    } else {
      variables[key].value = row.value;
    }
  }
  return {
    schema_version: '2.0',
    study: studySlug,
    last_updated: rows[0]?.updated_at?.toISOString() || new Date().toISOString(),
    variables,
    generation_snapshots: {},
  };
}

function rowsToDiscoveryStructure(rows, team, discoveryType) {
  const artifacts = {};
  for (const row of rows) {
    const artifactId = row.discovery_artifact_id || 'default';
    if (!artifacts[artifactId]) artifacts[artifactId] = {};
    const key = row.variable_key;
    if (!artifacts[artifactId][key]) {
      artifacts[artifactId][key] = {
        value: row.is_pool ? [] : null,
        source: { template: row.source_template, version: row.source_version, date: row.source_date },
        discovery_artifact_id: artifactId,
      };
    }
    if (row.is_pool) {
      artifacts[artifactId][key].value.push(row.value);
    } else {
      artifacts[artifactId][key].value = row.value;
    }
  }
  return {
    schema_version: '2.0',
    scope: 'discovery',
    team,
    discovery_type: discoveryType,
    last_updated: new Date().toISOString(),
    artifacts,
    generation_snapshots: {},
  };
}

async function writeVariablesToPostgres(StudyVariable, studySlug, scope, variablesData) {
  const sequelize = require('../database');
  const now = new Date().toISOString();

  await sequelize.transaction(async (t) => {
    for (const [key, variable] of Object.entries(variablesData.variables || {})) {
      // Clear existing for this key
      await StudyVariable.destroy({
        where: { study_name: studySlug, variable_key: key, scope },
        transaction: t,
      });

      if (variable.pool && Array.isArray(variable.value)) {
        for (const item of variable.value) {
          await StudyVariable.create({
            study_name: studySlug,
            variable_key: key,
            variable_type: 'pool',
            item_key: item.id || null,
            value: item,
            participant_id: item.participant || item.participant_id || null,
            source_template: variable.source?.template || 'unknown',
            source_version: variable.source?.version || null,
            source_date: variable.source?.date || now,
            is_pool: true,
            scope,
            stale: false,
            extracted_at: now,
            updated_at: now,
          }, { transaction: t });
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
          source_date: variable.source?.date || now,
          is_pool: false,
          scope,
          stale: false,
          extracted_at: now,
          updated_at: now,
        }, { transaction: t });
      }
    }
  });
}

async function writeDiscoveryToPostgres(StudyVariable, discoveryStudyId, variablesData) {
  const sequelize = require('../database');
  const now = new Date().toISOString();

  await sequelize.transaction(async (t) => {
    // Clear all existing for this discovery scope
    await StudyVariable.destroy({
      where: { study_name: discoveryStudyId, scope: 'discovery' },
      transaction: t,
    });

    for (const [artifactId, artifactVars] of Object.entries(variablesData.artifacts || {})) {
      for (const [key, variable] of Object.entries(artifactVars)) {
        const values = Array.isArray(variable.value) ? variable.value : [variable.value];
        const isPool = Array.isArray(variable.value);

        for (const item of values) {
          await StudyVariable.create({
            study_name: discoveryStudyId,
            variable_key: key,
            variable_type: isPool ? 'pool' : 'singleton',
            item_key: (typeof item === 'object' && item?.id) || null,
            value: item,
            participant_id: null,
            source_template: variable.source?.template || 'unknown',
            source_version: variable.source?.version || null,
            source_date: variable.source?.date || now,
            is_pool: isPool,
            scope: 'discovery',
            discovery_artifact_id: artifactId,
            stale: false,
            extracted_at: now,
            updated_at: now,
          }, { transaction: t });
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// GITHUB FALLBACK (migration period)
// ═══════════════════════════════════════════════════════════

async function readStudyVariablesFromGitHub(studyBasePath) {
  const filePath = `${studyBasePath}/primary-research/${VARIABLES_DIR}/${VARIABLES_FILE}`;
  try {
    const file = await fetchFileFromRepoByPath(process.env.GITHUB_REPO, filePath);
    return JSON.parse(file.content);
  } catch (error) {
    if (error.status === 404 || error.message?.includes('Not Found') || error.message?.includes('Could not fetch file')) {
      return createEmptyVariablesFile(studyBasePath);
    }
    throw error;
  }
}

async function readDiscoveryVariablesFromGitHub(team, discoveryType) {
  const filePath = `${team}/_discovery/${discoveryType}/${VARIABLES_DIR}/${DISCOVERY_VARIABLES_FILE}`;
  try {
    const file = await fetchFileFromRepoByPath(process.env.GITHUB_REPO, filePath);
    return JSON.parse(file.content);
  } catch (error) {
    if (error.status === 404 || error.message?.includes('Not Found') || error.message?.includes('Could not fetch file')) {
      return createEmptyDiscoveryVariablesFile(team, discoveryType);
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// IN-MEMORY MERGE (fallback when Postgres unavailable)
// ═══════════════════════════════════════════════════════════

function mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion) {
  const now = new Date().toISOString();

  for (const [key, extractedVar] of Object.entries(extracted)) {
    const emitSpec = extractedVar._emitSpec;
    const isPool = emitSpec?.pool === true;
    const poolStrategy = emitSpec?.pool_strategy || 'replace';

    const newEntry = {
      value: extractedVar.value,
      source: { template: sourceTemplate, version: sourceVersion, date: now },
      pool: isPool,
    };

    if (isPool && (poolStrategy === 'append' || poolStrategy === 'append_or_replace_per_participant') && existing.variables[key]) {
      const existingValues = existing.variables[key].value || [];
      const newValues = extractedVar.value || [];

      if (Array.isArray(existingValues) && Array.isArray(newValues)) {
        const participantId = newValues[0]?.participant || newValues[0]?.participant_id;
        const filtered = participantId
          ? existingValues.filter(item => item && typeof item === 'object' && (item.participant || item.participant_id) !== participantId)
          : existingValues.filter(item => item != null);
        newEntry.value = [...filtered, ...newValues];

        const existingDates = existing.variables[key].source?.dates || [];
        newEntry.source.dates = [...new Set([...existingDates, now])];
        delete newEntry.source.date;
      }
    }

    delete newEntry._emitSpec;
    existing.variables[key] = newEntry;
  }

  if (!existing.generation_snapshots) existing.generation_snapshots = {};
  existing.generation_snapshots[sourceTemplate] = {
    last_generated: now,
    variable_hash: hashVariables(extracted),
  };

  return existing;
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function hashVariables(variables) {
  const str = JSON.stringify(variables, Object.keys(variables).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(16);
}

function createEmptyVariablesFile(studyBasePath) {
  const studySlug = extractStudySlug(studyBasePath);
  return {
    schema_version: '1.0',
    study: studySlug,
    last_updated: new Date().toISOString(),
    variables: {},
    generation_snapshots: {},
  };
}

function createEmptyDiscoveryVariablesFile(team, discoveryType) {
  return {
    schema_version: '1.0',
    scope: 'discovery',
    team,
    discovery_type: discoveryType,
    last_updated: new Date().toISOString(),
    artifacts: {},
    generation_snapshots: {},
  };
}

// ═══════════════════════════════════════════════════════════
// CROSS-STUDY SEARCH (used by /qori-ask)
// ═══════════════════════════════════════════════════════════

/**
 * Search variables across all studies (or one study) by variable keys and text terms.
 * Returns up to `limit` rows, sorted by source_date DESC.
 *
 * @param {string[]} variableKeys — e.g., ['atomic_nugget_core', 'validated_themes']
 * @param {string[]} searchTerms — free-text terms to ILIKE match against value::text
 * @param {Object} options
 * @param {string} [options.studyName] — scope to a single study (omit for all studies)
 * @param {number} [options.limit=30] — max rows
 * @param {number} [options.offset=0] — for pagination
 */
async function searchVariablesAcrossStudies(variableKeys, searchTerms, options = {}) {
  const { studyName, limit = 30, offset = 0 } = options;
  const StudyVariable = getStudyVariableModel();
  if (!StudyVariable) return { rows: [], total: 0 };

  const { Op, literal } = require('sequelize');

  // Build WHERE clause
  const where = {
    variable_key: { [Op.in]: variableKeys },
    scope: 'study',
  };
  if (studyName) {
    where.study_name = studyName;
  }

  // Text matching: OR across all search terms against value::text
  if (searchTerms && searchTerms.length > 0) {
    where[Op.and] = searchTerms.map(term => literal(
      `"value"::text ILIKE '%${term.replace(/'/g, "''")}%'`
    ));
  }

  const [rows, total] = await Promise.all([
    StudyVariable.findAll({
      where,
      order: [['source_date', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    }),
    StudyVariable.count({ where }),
  ]);

  return { rows, total };
}

module.exports = {
  readStudyVariables,
  writeStudyVariables,
  mergeVariables,
  readUpstreamVariables,
  hashVariables,
  readDiscoveryVariables,
  writeDiscoveryVariables,
  mergeDiscoveryVariables,
  readUpstreamDiscoveryVariables,
  searchVariablesAcrossStudies,
};

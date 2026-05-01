// studyVariables.js — Read/write study-variables.json in qori-studies repo
const { fetchFileFromRepoByPath, createOrUpdateFileOnGitHub } = require('./github');

const VARIABLES_DIR = '.variables';
const VARIABLES_FILE = 'study-variables.json';

/**
 * Read the study variables file from GitHub.
 * Returns parsed JSON or a fresh empty structure if file doesn't exist.
 */
async function readStudyVariables(studyBasePath) {
  const filePath = `${studyBasePath}/primary-research/${VARIABLES_DIR}/${VARIABLES_FILE}`;
  try {
    const file = await fetchFileFromRepoByPath(process.env.GITHUB_REPO, filePath);
    return JSON.parse(file.content);
  } catch (error) {
    // File doesn't exist yet — return empty structure
    if (error.status === 404 || error.message?.includes('Not Found')) {
      return createEmptyVariablesFile(studyBasePath);
    }
    throw error;
  }
}

/**
 * Write the study variables file to GitHub.
 */
async function writeStudyVariables(studyBasePath, variablesData) {
  const filePath = `${studyBasePath}/primary-research/${VARIABLES_DIR}/${VARIABLES_FILE}`;
  variablesData.last_updated = new Date().toISOString();
  const content = JSON.stringify(variablesData, null, 2);
  return createOrUpdateFileOnGitHub(filePath, content);
}

/**
 * Merge extracted variables into the existing study variables.
 * Handles pool variables (append) vs. replace variables.
 */
function mergeVariables(existing, extracted, sourceTemplate, sourceVersion) {
  const now = new Date().toISOString();

  for (const [key, extractedVar] of Object.entries(extracted)) {
    const emitSpec = extractedVar._emitSpec;
    const isPool = emitSpec?.pool === true;
    const poolStrategy = emitSpec?.pool_strategy || 'replace';

    const newEntry = {
      value: extractedVar.value,
      source: {
        template: sourceTemplate,
        version: sourceVersion,
        date: now,
      },
      pool: isPool,
    };

    if (isPool && poolStrategy === 'append' && existing.variables[key]) {
      // Append to existing pool — deduplicate by id if items have ids
      const existingValues = existing.variables[key].value || [];
      const newValues = extractedVar.value || [];

      if (Array.isArray(existingValues) && Array.isArray(newValues)) {
        // For pool append: remove items from same source (re-extraction replaces same-source items)
        const sourceTemplate_ = sourceTemplate;
        const filtered = existingValues.filter(item => {
          // Keep items from other sources; replace items from this source+participant
          if (item.participant && newValues.length > 0 && newValues[0].participant) {
            return item.participant !== newValues[0].participant;
          }
          return true;
        });
        newEntry.value = [...filtered, ...newValues];

        // Track all source dates for pools
        const existingDates = existing.variables[key].source?.dates || [];
        newEntry.source.dates = [...new Set([...existingDates, now])];
        delete newEntry.source.date;
      }
    }

    // Remove internal _emitSpec before storing
    delete newEntry._emitSpec;
    existing.variables[key] = newEntry;
  }

  // Update generation snapshot
  if (!existing.generation_snapshots) {
    existing.generation_snapshots = {};
  }
  existing.generation_snapshots[sourceTemplate] = {
    last_generated: now,
    variable_hash: hashVariables(extracted),
  };

  return existing;
}

/**
 * Simple hash for variable comparison (staleness detection).
 */
function hashVariables(variables) {
  const str = JSON.stringify(variables, Object.keys(variables).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Create an empty study variables structure.
 */
function createEmptyVariablesFile(studyBasePath) {
  const studySlug = studyBasePath.split('/').pop() || 'unknown';
  return {
    schema_version: '1.0',
    study: studySlug,
    last_updated: new Date().toISOString(),
    variables: {},
    generation_snapshots: {},
  };
}

/**
 * Read specific upstream variables needed by a template's consumes spec.
 * Returns an object of { key: value } for injection into the Generate prompt.
 */
async function readUpstreamVariables(studyBasePath, consumesSpec) {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  const studyVars = await readStudyVariables(studyBasePath);
  const upstream = {};

  for (const spec of consumesSpec) {
    const variable = studyVars.variables[spec.key];
    if (variable) {
      upstream[spec.key] = {
        value: variable.value,
        source: variable.source,
        confidence: variable.confidence,
      };
    } else if (spec.required) {
      console.warn(`⚠️ Required upstream variable "${spec.key}" not found for study ${studyBasePath}`);
    }
  }

  return upstream;
}

module.exports = {
  readStudyVariables,
  writeStudyVariables,
  mergeVariables,
  readUpstreamVariables,
  hashVariables,
};

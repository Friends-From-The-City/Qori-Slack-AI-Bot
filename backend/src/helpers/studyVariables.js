// studyVariables.js — Read/write study-variables.json in qori-studies repo
const { fetchFileFromRepoByPath, createOrUpdateFileOnGitHub } = require('./github');

const VARIABLES_DIR = '.variables';
const VARIABLES_FILE = 'study-variables.json';
const DISCOVERY_VARIABLES_FILE = 'discovery-variables.json';

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
    // fetchFileFromRepoByPath wraps 404s as "Could not fetch file ..." so check for that too
    if (error.status === 404 || error.message?.includes('Not Found') || error.message?.includes('Could not fetch file')) {
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

// ═══════════════════════════════════════════════════════════
// DISCOVERY-SCOPED VARIABLE STORE
// ═══════════════════════════════════════════════════════════

/**
 * Build the GitHub path for a discovery variables file.
 * @param {string} discoveryType - e.g., 'desk-research', 'stakeholder-interviews', 'survey-synthesis'
 */
function discoveryVariablesPath(discoveryType) {
  return `_discovery/${discoveryType}/${VARIABLES_DIR}/${DISCOVERY_VARIABLES_FILE}`;
}

/**
 * Read discovery variables from GitHub.
 * Returns parsed JSON or a fresh empty structure if file doesn't exist.
 * @param {string} discoveryType - e.g., 'desk-research'
 */
async function readDiscoveryVariables(discoveryType) {
  const filePath = discoveryVariablesPath(discoveryType);
  try {
    const file = await fetchFileFromRepoByPath(process.env.GITHUB_REPO, filePath);
    return JSON.parse(file.content);
  } catch (error) {
    if (error.status === 404 || error.message?.includes('Not Found') || error.message?.includes('Could not fetch file')) {
      return createEmptyDiscoveryVariablesFile(discoveryType);
    }
    throw error;
  }
}

/**
 * Write discovery variables to GitHub.
 * @param {string} discoveryType - e.g., 'desk-research'
 * @param {object} variablesData - the variables structure to write
 */
async function writeDiscoveryVariables(discoveryType, variablesData) {
  const filePath = discoveryVariablesPath(discoveryType);
  variablesData.last_updated = new Date().toISOString();
  const content = JSON.stringify(variablesData, null, 2);
  return createOrUpdateFileOnGitHub(filePath, content);
}

/**
 * Create an empty discovery variables structure.
 * @param {string} discoveryType - e.g., 'desk-research'
 */
function createEmptyDiscoveryVariablesFile(discoveryType) {
  return {
    schema_version: '1.0',
    scope: 'discovery',
    discovery_type: discoveryType,
    last_updated: new Date().toISOString(),
    artifacts: {},
    generation_snapshots: {},
  };
}

/**
 * Merge extracted variables into discovery store, keyed by artifact ID (topic slug).
 * @param {object} existing - current discovery variables structure
 * @param {object} extracted - variables extracted from this run
 * @param {string} discoveryArtifactId - the topic slug identifying this artifact
 * @param {string} sourceTemplate - which YAML template produced this
 * @param {string} sourceVersion - version of the template
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
 * Read upstream discovery variables for a template's consumes spec.
 * @param {string} discoveryType - e.g., 'stakeholder-interviews'
 * @param {string} discoveryArtifactId - the topic slug
 * @param {Array} consumesSpec - consumes spec from YAML
 */
async function readUpstreamDiscoveryVariables(discoveryType, discoveryArtifactId, consumesSpec) {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  // Discovery consumes may come from a different discovery type
  // (e.g., stakeholder-interviews consumes from desk-research)
  const upstream = {};

  for (const spec of consumesSpec) {
    const sourceType = spec.source_discovery_type || discoveryType;
    const discoveryVars = await readDiscoveryVariables(sourceType);
    const artifactVars = discoveryVars.artifacts?.[discoveryArtifactId] || {};
    const variable = artifactVars[spec.key];

    if (variable) {
      upstream[spec.key] = {
        value: variable.value,
        source: variable.source,
      };
    } else if (spec.required) {
      console.warn(`⚠️ Required upstream discovery variable "${spec.key}" not found for artifact ${discoveryArtifactId} in ${sourceType}`);
    }
  }

  return upstream;
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
  // Discovery-scoped
  readDiscoveryVariables,
  writeDiscoveryVariables,
  mergeDiscoveryVariables,
  readUpstreamDiscoveryVariables,
};

/**
 * discoveryLoader.js — Load available discovery artifacts for a team.
 *
 * Reads {team}/_discovery/{type}/.variables/discovery-variables.json
 * for each discovery type and returns a flat list of artifacts with
 * metadata suitable for modal display and variable aggregation.
 */
const { readDiscoveryVariables } = require('./studyVariables');

const DISCOVERY_TYPES = [
  { type: 'desk-research', icon: '📄', label: 'desk research' },
  { type: 'stakeholder-interviews', icon: '🎙', label: 'stakeholder' },
  { type: 'survey-synthesis', icon: '📊', label: 'survey' },
];

/**
 * Load all discovery artifacts for a team.
 * Returns a flat array sorted by date (newest first):
 * [{ slug, type, icon, label, variableCount, date, variables }]
 *
 * @param {string} team - team slug
 * @returns {Promise<Array>}
 */
async function loadDiscoveryArtifacts(team) {
  const artifacts = [];

  for (const { type, icon, label } of DISCOVERY_TYPES) {
    try {
      const data = await readDiscoveryVariables(team, type);
      if (!data.artifacts || Object.keys(data.artifacts).length === 0) continue;

      for (const [slug, variables] of Object.entries(data.artifacts)) {
        // Count variables that have values
        const variableKeys = Object.keys(variables);
        const variableCount = variableKeys.length;

        // Get date from generation snapshot or first variable source
        let date = '';
        const snapshotKey = Object.keys(data.generation_snapshots || {}).find(k => k.startsWith(`${slug}:`));
        if (snapshotKey && data.generation_snapshots[snapshotKey]?.last_generated) {
          date = data.generation_snapshots[snapshotKey].last_generated.split('T')[0];
        } else {
          // Fall back to first variable's source date
          const firstVar = variables[variableKeys[0]];
          if (firstVar?.source?.date) {
            date = firstVar.source.date.split('T')[0];
          }
        }

        artifacts.push({
          slug,
          type,
          icon,
          label,
          variableCount,
          date,
          variables,
        });
      }
    } catch (error) {
      // Type has no variables yet — skip silently
      console.log(`📂 Discovery: no variables for ${team}/_discovery/${type} (${error.message})`);
    }
  }

  // Sort newest first
  artifacts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return artifacts;
}

/**
 * Aggregate variables from selected discovery artifacts into upstream_* format.
 * Merges arrays, keeps latest single values.
 *
 * @param {Array} selectedArtifacts - artifacts from loadDiscoveryArtifacts
 * @returns {Object} - { upstream_discovered_barriers: ..., upstream_stakeholder_constraints: ..., etc. }
 */
function aggregateDiscoveryVariables(selectedArtifacts) {
  const aggregated = {};

  for (const artifact of selectedArtifacts) {
    for (const [key, variable] of Object.entries(artifact.variables)) {
      const upstreamKey = `upstream_${key}`;

      if (Array.isArray(variable.value)) {
        // Merge arrays
        if (!aggregated[upstreamKey]) {
          aggregated[upstreamKey] = [];
        }
        aggregated[upstreamKey] = [...aggregated[upstreamKey], ...variable.value];
      } else if (typeof variable.value === 'string') {
        // For strings, join with newline separator (preserves all sources)
        if (aggregated[upstreamKey]) {
          aggregated[upstreamKey] += `\n\n${variable.value}`;
        } else {
          aggregated[upstreamKey] = variable.value;
        }
      } else {
        // Objects or other — keep latest
        aggregated[upstreamKey] = variable.value;
      }
    }
  }

  // Stringify non-string values for template injection
  for (const [key, value] of Object.entries(aggregated)) {
    if (typeof value !== 'string') {
      aggregated[key] = JSON.stringify(value, null, 2);
    }
  }

  return aggregated;
}

module.exports = {
  loadDiscoveryArtifacts,
  aggregateDiscoveryVariables,
  DISCOVERY_TYPES,
};

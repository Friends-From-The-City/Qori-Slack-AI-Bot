/**
 * discoveryLoader.ts — Load available discovery artifacts for a project.
 *
 * Phase 2D: Uses projectId instead of team string.
 *
 * Reads discovery variables from Postgres for each discovery type
 * and returns a flat list of artifacts with metadata suitable for
 * modal display and variable aggregation.
 */
import {
  readDiscoveryVariablesByProject,
  type DiscoveryVariablesStructure,
  type StoredVariable,
} from './studyVariables';

interface DiscoveryTypeConfig {
  type: string;
  icon: string;
  label: string;
}

export interface DiscoveryArtifact {
  slug: string;
  type: string;
  icon: string;
  label: string;
  variableCount: number;
  date: string;
  variables: Record<string, StoredVariable>;
}

export const DISCOVERY_TYPES: DiscoveryTypeConfig[] = [
  { type: 'desk-research', icon: '\u{1F4C4}', label: 'desk research' },
  { type: 'stakeholder-interviews', icon: '\u{1F399}', label: 'stakeholder' },
  { type: 'survey-synthesis', icon: '\u{1F4CA}', label: 'survey' },
];

/**
 * Load all discovery artifacts for a project.
 * Returns a flat array sorted by date (newest first).
 *
 * Phase 2D: Uses projectId instead of team string.
 */
export async function loadDiscoveryArtifacts(projectId: number): Promise<DiscoveryArtifact[]> {
  const artifacts: DiscoveryArtifact[] = [];

  for (const { type, icon, label } of DISCOVERY_TYPES) {
    try {
      const data: DiscoveryVariablesStructure = await readDiscoveryVariablesByProject(projectId, type);
      if (!data.artifacts || Object.keys(data.artifacts).length === 0) continue;

      for (const [slug, variables] of Object.entries(data.artifacts)) {
        const variableKeys = Object.keys(variables);
        const variableCount = variableKeys.length;

        let date = '';
        const snapshotKey = Object.keys(data.generation_snapshots || {}).find((k) =>
          k.startsWith(`${slug}:`),
        );
        if (
          snapshotKey &&
          (data.generation_snapshots as Record<string, { last_generated?: string }>)[snapshotKey]
            ?.last_generated
        ) {
          date =
            (
              data.generation_snapshots as Record<string, { last_generated?: string }>
            )[snapshotKey].last_generated!.split('T')[0];
        } else {
          const firstVar = variables[variableKeys[0]];
          if (firstVar?.source?.date) {
            // source.date may be a Date object (from Sequelize) or string at runtime
            // despite the type saying string — Sequelize returns Date for date columns
            const dateValue = firstVar.source.date as unknown;
            const dateStr = dateValue instanceof Date ? dateValue.toISOString() : String(dateValue);
            date = dateStr.split('T')[0];
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Discovery: no variables for project ${projectId}, type ${type} (${message})`);
    }
  }

  artifacts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return artifacts;
}

/**
 * Format a deeply-structured object as readable markdown (no curly braces).
 * Preserves verbatim quotes, multi-field context, and nested arrays.
 */
function formatObjectAsMarkdown(obj: Record<string, unknown>, index?: number): string {
  if (!obj || typeof obj !== 'object') return String(obj);

  const lines: string[] = [];

  const primaryKeys = [
    'barrier',
    'finding',
    'constraint',
    'priority',
    'gap',
    'journey',
    'theme',
    'label',
    'metric',
    'method', // methodology_recommendation.method — human-readable method name
  ];
  const primaryKey = primaryKeys.find((k) => obj[k]) || Object.keys(obj)[0];
  const primaryValue = obj[primaryKey];

  if (index) {
    lines.push(`**${index}.** ${primaryValue}`);
  } else {
    lines.push(`- **${primaryValue}**`);
  }

  for (const [k, v] of Object.entries(obj)) {
    if (k === primaryKey || v == null) continue;

    if (k === 'verbatim_quote' || k === 'verbatim_evidence') {
      lines.push(`  > "${v}"`);
    } else if (k === 'representative_quotes' && Array.isArray(v)) {
      for (const q of v) {
        if (typeof q === 'object' && q !== null && 'quote' in q) {
          const qObj = q as Record<string, string>;
          lines.push(
            `  > "${qObj.quote}" — ${qObj.respondent || qObj.participant || 'unknown'}`,
          );
        } else if (typeof q === 'string') {
          lines.push(`  > "${q}"`);
        }
      }
    } else if (Array.isArray(v)) {
      lines.push(`  ${k}: ${v.join(', ')}`);
    } else {
      lines.push(`  ${k}: ${v}`);
    }
  }

  return lines.join('\n');
}

/**
 * Aggregate variables from selected discovery artifacts into upstream_* format.
 * Merges arrays, keeps latest single values.
 */
export function aggregateDiscoveryVariables(
  selectedArtifacts: DiscoveryArtifact[],
): Record<string, string> {
  const aggregated: Record<string, unknown> = {};

  for (const artifact of selectedArtifacts) {
    for (const [key, variable] of Object.entries(artifact.variables)) {
      const upstreamKey = `upstream_${key}`;

      if (Array.isArray(variable.value)) {
        if (!aggregated[upstreamKey]) {
          aggregated[upstreamKey] = [];
        }
        aggregated[upstreamKey] = [
          ...(aggregated[upstreamKey] as unknown[]),
          ...variable.value,
        ];
      } else if (typeof variable.value === 'string') {
        if (aggregated[upstreamKey]) {
          aggregated[upstreamKey] += `\n\n${variable.value}`;
        } else {
          aggregated[upstreamKey] = variable.value;
        }
      } else {
        aggregated[upstreamKey] = variable.value;
      }
    }
  }

  // Format non-string values as plain text for template injection.
  // IMPORTANT: Cannot use JSON.stringify — curly braces break LangChain's
  // f-string parser (INVALID_PROMPT_INPUT). Format as rich markdown instead.
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(aggregated)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value
        .map((item, i) => {
          if (typeof item === 'string') return `- ${item}`;
          if (typeof item === 'object' && item !== null) {
            return formatObjectAsMarkdown(item as Record<string, unknown>, i + 1);
          }
          return `- ${String(item)}`;
        })
        .join('\n\n');
    } else if (typeof value === 'object' && value !== null) {
      result[key] = formatObjectAsMarkdown(value as Record<string, unknown>);
    } else {
      result[key] = String(value);
    }
  }

  return result;
}

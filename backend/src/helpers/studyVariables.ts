// studyVariables.ts — Authoritative variable store backed by Postgres
// Fallback: reads from GitHub study-variables.json if Postgres has no data (migration period)

import { Op, literal } from 'sequelize';
import type { Model, ModelStatic, Sequelize } from 'sequelize';
import { fetchFileFromRepoByPath, createOrUpdateFileOnGitHub, getContentRepo } from './github';

const VARIABLES_DIR = '.variables';
const VARIABLES_FILE = 'study-variables.json';
const DISCOVERY_VARIABLES_FILE = 'discovery-variables.json';

// ═══════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════

export interface VariableSource {
  template: string;
  version: string | null;
  date?: string;
  dates?: string[];
}

export interface StoredVariable {
  value: unknown;
  source: VariableSource;
  pool?: boolean;
  confidence?: string;
  _emitSpec?: EmitSpec;
}

export interface StudyVariablesStructure {
  schema_version: string;
  study: string;
  last_updated: string;
  variables: Record<string, StoredVariable>;
  generation_snapshots: Record<string, unknown>;
}

export interface UpstreamVariable {
  value: unknown;
  source: VariableSource;
  confidence?: string;
}

export type UpstreamVariables = Record<string, UpstreamVariable>;

export interface DiscoveryVariable {
  value: unknown;
  source: VariableSource;
  discovery_artifact_id: string;
}

export interface DiscoveryVariablesStructure {
  schema_version: string;
  scope: 'discovery';
  team: string;
  discovery_type: string;
  last_updated: string;
  artifacts: Record<string, Record<string, DiscoveryVariable>>;
  generation_snapshots: Record<string, unknown>;
}

export interface ConsumeSpec {
  key: string;
  required: boolean;
  inject_as?: string;
  source?: string;
  source_discovery_type?: string;
}

interface EmitSpec {
  pool?: boolean;
  pool_strategy?: string;
}

interface ExtractedVariable {
  value: unknown;
  _emitSpec?: EmitSpec;
}

interface SearchOptions {
  studyName?: string;
  limit?: number;
  offset?: number;
}

interface SearchResult {
  rows: unknown[];
  total: number;
}

// Sequelize model type alias — we access it dynamically so we use a loose type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StudyVariableModel = ModelStatic<Model<any, any>>;

// ═══════════════════════════════════════════════════════════
// FIELD NORMALIZATION
// ═══════════════════════════════════════════════════════════

/**
 * Normalize field names in stored variable data to match current schema.
 * Handles renames across schema versions without requiring DB migrations.
 */
const FIELD_RENAMES: Record<string, Record<string, string>> = {
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
 * e.g., ["barrier text 1", "barrier text 2"] -> [{id: "TB-001", barrier: "barrier text 1"}, ...]
 */
const FLAT_TO_OBJECT_UPGRADES: Record<string, (str: string, idx: number) => Record<string, unknown>> = {
  target_barriers: (str: string, idx: number) => ({
    id: `TB-${String(idx + 1).padStart(3, '0')}`,
    barrier: str,
    source: null,
  }),
  research_questions: (str: string, idx: number) => ({
    id: `RQ-${String(idx + 1).padStart(3, '0')}`,
    question: str,
    priority: null,
  }),
};

function normalizeVariableFields(key: string, value: unknown): unknown {
  // First: upgrade flat string arrays to ID'd objects
  const upgrader = FLAT_TO_OBJECT_UPGRADES[key];
  if (upgrader && Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return (value as string[]).map((item, idx) => upgrader(item, idx));
  }

  // Then: apply field renames
  const renames = FIELD_RENAMES[key];
  if (!renames) return value;

  const normalize = (item: unknown): unknown => {
    if (!item || typeof item !== 'object') return item;
    const normalized = { ...(item as Record<string, unknown>) };
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

// ═══════════════════════════════════════════════════════════
// POSTGRES HELPERS
// ═══════════════════════════════════════════════════════════

function getStudyVariableModel(): StudyVariableModel | null {
  try {
    // Dynamic import to avoid circular dependencies and handle missing DB gracefully
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sequelize = require('../database').default as Sequelize;
    return (sequelize.models.StudyVariable as StudyVariableModel) || null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️ Could not load StudyVariable model:', message);
    return null;
  }
}

function getSequelizeInstance(): Sequelize {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../database').default as Sequelize;
}

// ═══════════════════════════════════════════════════════════
// STUDY-SCOPED READ/WRITE
// ═══════════════════════════════════════════════════════════

/**
 * Read study variables from Postgres. Falls back to GitHub JSON during migration.
 * Returns a structure compatible with the old JSON format for backward compat.
 */
export async function readStudyVariables(studyBasePath: string): Promise<StudyVariablesStructure> {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Postgres read failed, falling back to GitHub:', message);
    }
  }

  // Fallback: read from GitHub (migration period or Postgres unavailable)
  return readStudyVariablesFromGitHub(studyBasePath);
}

/**
 * Write study variables to Postgres. Also writes GitHub JSON as debugging artifact.
 */
export async function writeStudyVariables(studyBasePath: string, variablesData: StudyVariablesStructure): Promise<void> {
  const studySlug = extractStudySlug(studyBasePath);
  const StudyVariable = getStudyVariableModel();

  if (StudyVariable) {
    try {
      await writeVariablesToPostgres(StudyVariable, studySlug, 'study', variablesData);
      console.log(`✅ Variables written to Postgres for ${studySlug}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Postgres write failed for ${studySlug}:`, message);
      // Fall through to GitHub write as safety net
    }
  }

  // Also write GitHub JSON (debugging artifact, not authoritative)
  try {
    const filePath = `${studyBasePath}/primary-research/${VARIABLES_DIR}/${VARIABLES_FILE}`;
    variablesData.last_updated = new Date().toISOString();
    const content = JSON.stringify(variablesData, null, 2);
    await createOrUpdateFileOnGitHub(filePath, content);
  } catch (err: unknown) {
    // Non-blocking: GitHub write failure doesn't affect cascade
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ GitHub variables artifact write failed (non-blocking): ${message}`);
  }
}

/**
 * Merge extracted variables into Postgres using proper transactions.
 * Implements append_or_replace_per_participant atomically.
 */
export async function mergeVariables(
  existing: StudyVariablesStructure,
  extracted: Record<string, ExtractedVariable>,
  sourceTemplate: string,
  sourceVersion: string,
): Promise<StudyVariablesStructure> {
  const StudyVariable = getStudyVariableModel();
  const now = new Date().toISOString();

  // If Postgres is unavailable, fall back to in-memory merge (old behavior)
  if (!StudyVariable) {
    return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
  }

  const studySlug = existing.study || 'unknown';
  const sequelize = getSequelizeInstance();

  try {
    await sequelize.transaction(async (t) => {
      for (const [key, extractedVar] of Object.entries(extracted)) {
        const emitSpec = extractedVar._emitSpec;
        const isPool = emitSpec?.pool === true;
        const poolStrategy = emitSpec?.pool_strategy || 'replace';
        const values = extractedVar.value;

        if (isPool && Array.isArray(values)) {
          // Determine participant for per-participant pools
          const firstItem = values[0] as Record<string, unknown> | undefined;
          const participantId = (firstItem?.participant || firstItem?.participant_id || null) as string | null;

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
            const itemObj = item as Record<string, unknown>;
            const itemKey = (itemObj.id as string) || null;
            const itemParticipant = (itemObj.participant || itemObj.participant_id || participantId) as string | null;

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
              confidence: (itemObj.confidence as string) || null,
              scope: 'study',
              stale: false,
              extracted_at: now,
              updated_at: now,
            } as Record<string, unknown>, { transaction: t });
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
          } as Record<string, unknown>, { transaction: t });
        }
      }
    });

    console.log(`✅ mergeVariables: Transaction committed for ${studySlug} (${Object.keys(extracted).length} variables)`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ mergeVariables transaction failed:', message);
    // Fall back to in-memory merge
    return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
  }

  // Also update in-memory structure (for GitHub artifact write)
  return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
}

/**
 * Read specific upstream variables for a template's consumes spec.
 */
export async function readUpstreamVariables(studyBasePath: string, consumesSpec: ConsumeSpec[]): Promise<UpstreamVariables> {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  const studySlug = extractStudySlug(studyBasePath);
  const StudyVariable = getStudyVariableModel();
  const upstream: UpstreamVariables = {};

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
          const isPool = (rows[0] as unknown as { is_pool: boolean }).is_pool;
          const rawValue = isPool
            ? rows.map((r: unknown) => (r as { value: unknown }).value)
            : (rows[0] as unknown as { value: unknown }).value;
          upstream[spec.key] = {
            value: normalizeVariableFields(spec.key, rawValue),
            source: {
              template: (rows[0] as unknown as { source_template: string }).source_template,
              version: (rows[0] as unknown as { source_version: string | null }).source_version,
              date: (rows[0] as unknown as { source_date: string }).source_date,
            },
          };
        } else if (spec.required) {
          console.warn(`⚠️ Required upstream variable "${spec.key}" not found for study ${studySlug}`);
        }
      }

      if (Object.keys(upstream).length > 0) return upstream;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Postgres upstream read failed, falling back to GitHub:', message);
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
export async function readDiscoveryVariables(team: string, discoveryType: string): Promise<DiscoveryVariablesStructure> {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Postgres discovery read failed, falling back to GitHub:', message);
    }
  }

  // Fallback: GitHub
  return readDiscoveryVariablesFromGitHub(team, discoveryType);
}

/**
 * Write discovery variables to Postgres. Also writes GitHub artifact.
 */
export async function writeDiscoveryVariables(team: string, discoveryType: string, variablesData: DiscoveryVariablesStructure): Promise<void> {
  const StudyVariable = getStudyVariableModel();
  const discoveryStudyId = `discovery:${team}:${discoveryType}`;

  if (StudyVariable) {
    try {
      await writeDiscoveryToPostgres(StudyVariable, discoveryStudyId, variablesData);
      console.log(`✅ Discovery variables written to Postgres for ${discoveryStudyId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Postgres discovery write failed:', message);
    }
  }

  // Also write GitHub artifact
  try {
    const filePath = `${team}/_discovery/${discoveryType}/${VARIABLES_DIR}/${DISCOVERY_VARIABLES_FILE}`;
    variablesData.last_updated = new Date().toISOString();
    const content = JSON.stringify(variablesData, null, 2);
    await createOrUpdateFileOnGitHub(filePath, content);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ GitHub discovery artifact write failed (non-blocking): ${message}`);
  }
}

/**
 * Merge discovery variables into Postgres.
 */
export function mergeDiscoveryVariables(
  existing: DiscoveryVariablesStructure,
  extracted: Record<string, ExtractedVariable>,
  discoveryArtifactId: string,
  sourceTemplate: string,
  sourceVersion: string,
): DiscoveryVariablesStructure {
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
export async function readUpstreamDiscoveryVariables(
  team: string,
  discoveryType: string,
  discoveryArtifactId: string,
  consumesSpec: ConsumeSpec[],
): Promise<UpstreamVariables> {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  const upstream: UpstreamVariables = {};
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
// CROSS-STUDY SEARCH (used by /qori-ask)
// ═══════════════════════════════════════════════════════════

/**
 * Search variables across all studies (or one study) by variable keys and text terms.
 * Returns up to `limit` rows, sorted by source_date DESC.
 */
export async function searchVariablesAcrossStudies(
  variableKeys: string[],
  searchTerms: string[],
  options: SearchOptions = {},
): Promise<SearchResult> {
  const { studyName, limit = 30, offset = 0 } = options;
  const StudyVariable = getStudyVariableModel();
  if (!StudyVariable) return { rows: [], total: 0 };

  // Build WHERE clause
  const where: Record<string, unknown> = {
    variable_key: { [Op.in]: variableKeys },
    scope: 'study',
  };
  if (studyName) {
    where.study_name = studyName;
  }

  // Text matching: any search term matches against value::text
  if (searchTerms && searchTerms.length > 0) {
    where[Op.and as unknown as string] = [
      { [Op.or as unknown as string]: searchTerms.map(term => literal(
        `"value"::text ILIKE '%${term.replace(/'/g, "''") }%'`
      )) },
    ];
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

// ═══════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════

function extractStudySlug(studyBasePath: string): string {
  if (!studyBasePath) return 'unknown';
  return decodeURIComponent(studyBasePath).split('/').pop() || 'unknown';
}

/**
 * Convert Postgres rows back to the old JSON structure (backward compat).
 */
function rowsToVariablesStructure(rows: Model[], studySlug: string): StudyVariablesStructure {
  const variables: Record<string, StoredVariable> = {};
  for (const row of rows) {
    const r = row as unknown as {
      variable_key: string;
      is_pool: boolean;
      value: unknown;
      source_template: string;
      source_version: string | null;
      source_date: string;
      updated_at: Date | null;
    };
    const key = r.variable_key;
    if (!variables[key]) {
      variables[key] = {
        value: r.is_pool ? [] : null,
        source: {
          template: r.source_template,
          version: r.source_version,
          date: r.source_date,
        },
        pool: r.is_pool,
      };
    }
    if (r.is_pool) {
      (variables[key].value as unknown[]).push(r.value);
    } else {
      variables[key].value = r.value;
    }
  }

  const firstRow = rows[0] as unknown as { updated_at?: Date };
  return {
    schema_version: '2.0',
    study: studySlug,
    last_updated: firstRow?.updated_at?.toISOString() || new Date().toISOString(),
    variables,
    generation_snapshots: {},
  };
}

function rowsToDiscoveryStructure(rows: Model[], team: string, discoveryType: string): DiscoveryVariablesStructure {
  const artifacts: Record<string, Record<string, DiscoveryVariable>> = {};
  for (const row of rows) {
    const r = row as unknown as {
      discovery_artifact_id: string | null;
      variable_key: string;
      is_pool: boolean;
      value: unknown;
      source_template: string;
      source_version: string | null;
      source_date: string;
    };
    const artifactId = r.discovery_artifact_id || 'default';
    if (!artifacts[artifactId]) artifacts[artifactId] = {};
    const key = r.variable_key;
    if (!artifacts[artifactId][key]) {
      artifacts[artifactId][key] = {
        value: r.is_pool ? [] : null,
        source: { template: r.source_template, version: r.source_version, date: r.source_date },
        discovery_artifact_id: artifactId,
      };
    }
    if (r.is_pool) {
      (artifacts[artifactId][key].value as unknown[]).push(r.value);
    } else {
      artifacts[artifactId][key].value = r.value;
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

async function writeVariablesToPostgres(
  StudyVariable: StudyVariableModel,
  studySlug: string,
  scope: string,
  variablesData: StudyVariablesStructure,
): Promise<void> {
  const sequelize = getSequelizeInstance();
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
          const itemObj = item as Record<string, unknown>;
          await StudyVariable.create({
            study_name: studySlug,
            variable_key: key,
            variable_type: 'pool',
            item_key: (itemObj.id as string) || null,
            value: item,
            participant_id: (itemObj.participant || itemObj.participant_id || null) as string | null,
            source_template: variable.source?.template || 'unknown',
            source_version: variable.source?.version || null,
            source_date: variable.source?.date || now,
            is_pool: true,
            scope,
            stale: false,
            extracted_at: now,
            updated_at: now,
          } as Record<string, unknown>, { transaction: t });
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
        } as Record<string, unknown>, { transaction: t });
      }
    }
  });
}

async function writeDiscoveryToPostgres(
  StudyVariable: StudyVariableModel,
  discoveryStudyId: string,
  variablesData: DiscoveryVariablesStructure,
): Promise<void> {
  const sequelize = getSequelizeInstance();
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
            item_key: (typeof item === 'object' && item !== null && (item as Record<string, unknown>).id as string) || null,
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
          } as Record<string, unknown>, { transaction: t });
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// GITHUB FALLBACK (migration period)
// ═══════════════════════════════════════════════════════════

async function readStudyVariablesFromGitHub(studyBasePath: string): Promise<StudyVariablesStructure> {
  const filePath = `${studyBasePath}/primary-research/${VARIABLES_DIR}/${VARIABLES_FILE}`;
  try {
    const file = await fetchFileFromRepoByPath(getContentRepo(), filePath);
    return JSON.parse(file.content) as StudyVariablesStructure;
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status === 404 || err.message?.includes('Not Found') || err.message?.includes('Could not fetch file')) {
      return createEmptyVariablesFile(studyBasePath);
    }
    throw error;
  }
}

async function readDiscoveryVariablesFromGitHub(team: string, discoveryType: string): Promise<DiscoveryVariablesStructure> {
  const filePath = `${team}/_discovery/${discoveryType}/${VARIABLES_DIR}/${DISCOVERY_VARIABLES_FILE}`;
  try {
    const file = await fetchFileFromRepoByPath(getContentRepo(), filePath);
    return JSON.parse(file.content) as DiscoveryVariablesStructure;
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status === 404 || err.message?.includes('Not Found') || err.message?.includes('Could not fetch file')) {
      return createEmptyDiscoveryVariablesFile(team, discoveryType);
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// IN-MEMORY MERGE (fallback when Postgres unavailable)
// ═══════════════════════════════════════════════════════════

function mergeVariablesInMemory(
  existing: StudyVariablesStructure,
  extracted: Record<string, ExtractedVariable>,
  sourceTemplate: string,
  sourceVersion: string,
): StudyVariablesStructure {
  const now = new Date().toISOString();

  for (const [key, extractedVar] of Object.entries(extracted)) {
    const emitSpec = extractedVar._emitSpec;
    const isPool = emitSpec?.pool === true;
    const poolStrategy = emitSpec?.pool_strategy || 'replace';

    const newEntry: StoredVariable = {
      value: extractedVar.value,
      source: { template: sourceTemplate, version: sourceVersion, date: now },
      pool: isPool,
    };

    if (isPool && (poolStrategy === 'append' || poolStrategy === 'append_or_replace_per_participant') && existing.variables[key]) {
      const existingValues = existing.variables[key].value as unknown[] | undefined;
      const newValues = extractedVar.value as unknown[] | undefined;

      if (Array.isArray(existingValues) && Array.isArray(newValues)) {
        const firstNew = newValues[0] as Record<string, unknown> | undefined;
        const participantId = firstNew?.participant || firstNew?.participant_id;
        const filtered = participantId
          ? existingValues.filter(item => item && typeof item === 'object' && ((item as Record<string, unknown>).participant || (item as Record<string, unknown>).participant_id) !== participantId)
          : existingValues.filter(item => item != null);
        newEntry.value = [...filtered, ...newValues];

        const existingDates = existing.variables[key].source?.dates || [];
        newEntry.source.dates = [...new Set([...existingDates, now])];
        delete newEntry.source.date;
      }
    }

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

export function hashVariables(variables: Record<string, unknown>): string {
  const str = JSON.stringify(variables, Object.keys(variables).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(16);
}

function createEmptyVariablesFile(studyBasePath: string): StudyVariablesStructure {
  const studySlug = extractStudySlug(studyBasePath);
  return {
    schema_version: '1.0',
    study: studySlug,
    last_updated: new Date().toISOString(),
    variables: {},
    generation_snapshots: {},
  };
}

function createEmptyDiscoveryVariablesFile(team: string, discoveryType: string): DiscoveryVariablesStructure {
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

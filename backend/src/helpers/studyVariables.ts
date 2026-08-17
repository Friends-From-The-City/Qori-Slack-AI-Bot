// studyVariables.ts — Authoritative cascade variable store backed by Postgres.
// Phase 2B refactor: Uses project_id + study_id FKs instead of study_name string.
// PH-1: GitHub .variables reads/writes removed. Postgres is sole runtime authority.

import { Op, literal } from 'sequelize';
import type { Model, ModelStatic, Sequelize } from 'sequelize';
// GitHub imports removed (PH-1 / ADR 0033) — no runtime variable reads/writes to GitHub.

// GitHub path constants removed (PH-1) — no longer written.

/**
 * Maps YAML template IDs (used in consumes.source) to Postgres discovery_type values.
 * When a template declares `consumes: [{source: 'desk_research', ...}]`, we need to
 * look up variables stored under discovery_type 'desk-research'.
 */
const TEMPLATE_TO_DISCOVERY_TYPE: Record<string, string> = {
  'desk_research': 'desk-research',
  'stakeholder_synthesis': 'stakeholder-interviews',
  'survey_synthesis': 'survey-synthesis',
};

// Reverse mapping: discovery type → source_template for filtering queries
const DISCOVERY_TYPE_TO_TEMPLATE: Record<string, string> = {
  'desk-research': 'desk_research',
  'stakeholder-interviews': 'stakeholder_synthesis',
  'survey-synthesis': 'survey_synthesis',
};

// ═══════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════

export interface VariableSource {
  template: string;
  version: string | null;
  date?: string;
  dates?: string[];
  artifact_ids?: string[];  // For aggregated sources from multiple discovery artifacts
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
  projectId?: number;
  studyId?: number | null;
  limit?: number;
  offset?: number;
}

interface SearchResult {
  rows: unknown[];
  total: number;
}

/**
 * Context for variable operations. Prefer using this over path-based lookups.
 */
export interface VariableContext {
  projectId: number;
  studyId?: number | null;
  projectSlug?: string;
  studySlug?: string;
}

// Sequelize model type alias — we access it dynamically so we use a loose type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StudyVariableModel = ModelStatic<Model<any, any>>;

// ═══════════════════════════════════════════════════════════
// TEST INJECTION (for integration tests)
// ═══════════════════════════════════════════════════════════

/**
 * Injected Sequelize instance for integration tests.
 * When set, getSequelizeInstance() returns this instead of require('../database').
 * This allows tests to seed data and have studyVariables.ts read from the same instance.
 */
let _injectedSequelize: Sequelize | null = null;

/**
 * Inject a Sequelize instance for integration tests.
 * Call this in beforeAll() with getTestDb() to unify the database connection.
 */
export function injectSequelizeForTest(instance: Sequelize): void {
  _injectedSequelize = instance;
}

/**
 * Clear the injected Sequelize instance after tests.
 * Call this in afterAll() to restore normal behavior.
 */
export function clearInjectedSequelize(): void {
  _injectedSequelize = null;
}

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
    const sequelize = getSequelizeInstance();
    return (sequelize.models.StudyVariable as StudyVariableModel) || null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('⚠️ Could not load StudyVariable model:', message);
    return null;
  }
}

function getSequelizeInstance(): Sequelize {
  // Use injected instance for integration tests (see injectSequelizeForTest)
  if (_injectedSequelize) {
    return _injectedSequelize;
  }
  // Dynamic import to avoid circular dependencies and handle missing DB gracefully
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require('../database');
  // Handle both ES module default export and CommonJS
  return (db.default || db) as Sequelize;
}

// ═══════════════════════════════════════════════════════════
// STUDY-SCOPED READ/WRITE
// ═══════════════════════════════════════════════════════════

/**
 * Read study variables from Postgres using FK-based lookup.
 * Preferred method for new code.
 */
export async function readStudyVariablesByContext(ctx: VariableContext): Promise<StudyVariablesStructure> {
  const StudyVariable = getStudyVariableModel();
  const studySlug = ctx.studySlug || `study-${ctx.studyId}`;

  if (StudyVariable) {
    try {
      const rows = await StudyVariable.findAll({
        where: {
          project_id: ctx.projectId,
          study_id: ctx.studyId ?? null,
          scope: 'study',
        },
      });

      if (rows.length > 0) {
        return rowsToVariablesStructure(rows, studySlug);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Postgres read failed:', message);
    }
  }

  // No data found — return empty structure
  return createEmptyVariablesFile(studySlug);
}

/**
 * @deprecated REMOVED in Phase 2B. Use readStudyVariablesByContext instead.
 * @throws Always throws — path-based lookups are no longer supported.
 */
export async function readStudyVariables(_studyBasePath: string): Promise<StudyVariablesStructure> {
  throw new Error(
    'readStudyVariables(path) removed in Phase 2B. ' +
    'Use readStudyVariablesByContext({ projectId, studyId }) instead.'
  );
}

/**
 * Write study variables — GitHub artifact write REMOVED (PH-1 / ADR 0033).
 *
 * Postgres write handled by mergeVariablesByContext(). This function existed
 * only for the GitHub debugging artifact, which is no longer written.
 * Retained as no-op for callers that still reference it during migration.
 */
export async function writeStudyVariablesByContext(
  _ctx: VariableContext,
  _variablesData: StudyVariablesStructure,
  _studyBasePath?: string
): Promise<void> {
  // No-op: GitHub .variables write removed (PH-1 / ADR 0033).
  // Postgres is sole authority, written by mergeVariablesByContext().
}

/**
 * @deprecated REMOVED in Phase 2B. Use writeStudyVariablesByContext instead.
 * @throws Always throws — path-based lookups are no longer supported.
 */
export async function writeStudyVariables(_studyBasePath: string, _variablesData: StudyVariablesStructure): Promise<void> {
  throw new Error(
    'writeStudyVariables(path, data) removed in Phase 2B. ' +
    'Use writeStudyVariablesByContext(ctx, data) instead.'
  );
}

/**
 * Merge extracted variables into Postgres using FK-based context.
 * Implements append_or_replace_per_participant atomically.
 * Preferred method for new code.
 */
export async function mergeVariablesByContext(
  ctx: VariableContext,
  existing: StudyVariablesStructure,
  extracted: Record<string, ExtractedVariable>,
  sourceTemplate: string,
  sourceVersion: string,
): Promise<StudyVariablesStructure> {
  const StudyVariable = getStudyVariableModel();
  const now = new Date().toISOString();

  if (!StudyVariable) {
    return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
  }

  const sequelize = getSequelizeInstance();

  try {
    await sequelize.transaction(async (t) => {
      for (const [key, extractedVar] of Object.entries(extracted)) {
        const emitSpec = extractedVar._emitSpec;
        const isPool = emitSpec?.pool === true;
        const poolStrategy = emitSpec?.pool_strategy || 'replace';
        const values = extractedVar.value;

        if (isPool && Array.isArray(values)) {
          const firstItem = values[0] as Record<string, unknown> | undefined;
          const participantId = (firstItem?.participant || firstItem?.participant_id || null) as string | null;

          // Delete existing entries based on strategy
          if (poolStrategy === 'append_or_replace_per_participant' && participantId) {
            await StudyVariable.destroy({
              where: {
                project_id: ctx.projectId,
                study_id: ctx.studyId ?? null,
                variable_key: key,
                participant_id: participantId,
                scope: 'study',
              },
              transaction: t,
            });
          } else if (poolStrategy === 'append' && participantId) {
            await StudyVariable.destroy({
              where: {
                project_id: ctx.projectId,
                study_id: ctx.studyId ?? null,
                variable_key: key,
                participant_id: participantId,
                scope: 'study',
              },
              transaction: t,
            });
          } else if (poolStrategy === 'replace') {
            await StudyVariable.destroy({
              where: {
                project_id: ctx.projectId,
                study_id: ctx.studyId ?? null,
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
              project_id: ctx.projectId,
              study_id: ctx.studyId ?? null,
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
              project_id: ctx.projectId,
              study_id: ctx.studyId ?? null,
              variable_key: key,
              scope: 'study',
            },
            transaction: t,
          });

          await StudyVariable.create({
            project_id: ctx.projectId,
            study_id: ctx.studyId ?? null,
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

    console.log(`✅ mergeVariablesByContext: Transaction committed for project:${ctx.projectId}/study:${ctx.studyId} (${Object.keys(extracted).length} variables)`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ mergeVariablesByContext transaction failed:', message);
    return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
  }

  return mergeVariablesInMemory(existing, extracted, sourceTemplate, sourceVersion);
}

/**
 * @deprecated REMOVED in Phase 2B. Use mergeVariablesByContext instead.
 * @throws Always throws — path-based lookups are no longer supported.
 */
export async function mergeVariables(
  _existing: StudyVariablesStructure,
  _extracted: Record<string, ExtractedVariable>,
  _sourceTemplate: string,
  _sourceVersion: string,
): Promise<StudyVariablesStructure> {
  throw new Error(
    'mergeVariables(existing, extracted, ...) removed in Phase 2B. ' +
    'Use mergeVariablesByContext(ctx, existing, extracted, ...) instead.'
  );
}

/**
 * Read specific upstream variables using FK-based context.
 * Preferred method for new code.
 */
export async function readUpstreamVariablesByContext(ctx: VariableContext, consumesSpec: ConsumeSpec[]): Promise<UpstreamVariables> {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  const StudyVariable = getStudyVariableModel();
  const upstream: UpstreamVariables = {};

  if (StudyVariable) {
    try {
      for (const spec of consumesSpec) {
        const rows = await StudyVariable.findAll({
          where: {
            project_id: ctx.projectId,
            study_id: ctx.studyId ?? null,
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
          console.warn(`⚠️ Required upstream variable "${spec.key}" not found for project:${ctx.projectId}/study:${ctx.studyId}`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Postgres upstream read failed:', message);
    }
  }

  return upstream;
}

/**
 * @deprecated REMOVED in Phase 2B. Use readUpstreamVariablesByContext instead.
 * @throws Always throws — path-based lookups are no longer supported.
 */
export async function readUpstreamVariables(_studyBasePath: string, _consumesSpec: ConsumeSpec[]): Promise<UpstreamVariables> {
  throw new Error(
    'readUpstreamVariables(path, consumesSpec) removed in Phase 2B. ' +
    'Use readUpstreamVariablesByContext(ctx, consumesSpec) instead.'
  );
}

// ═══════════════════════════════════════════════════════════
// DISCOVERY-SCOPED READ/WRITE
// ═══════════════════════════════════════════════════════════

/**
 * Read discovery variables by project ID (study_id = NULL for discovery scope).
 * Preferred method for new code.
 */
export async function readDiscoveryVariablesByProject(projectId: number, discoveryType: string): Promise<DiscoveryVariablesStructure> {
  const StudyVariable = getStudyVariableModel();

  if (StudyVariable) {
    try {
      // Map discovery type to source_template for filtering
      // e.g., 'desk-research' → 'desk_research'
      const sourceTemplate = DISCOVERY_TYPE_TO_TEMPLATE[discoveryType];
      if (!sourceTemplate) {
        console.warn(`⚠️ Unknown discovery type "${discoveryType}", returning empty`);
        return createEmptyDiscoveryVariablesFile(`project-${projectId}`, discoveryType);
      }

      const rows = await StudyVariable.findAll({
        where: {
          project_id: projectId,
          study_id: null,
          scope: 'discovery',
          source_template: sourceTemplate,
        },
      });

      if (rows.length > 0) {
        return rowsToDiscoveryStructure(rows, `project-${projectId}`, discoveryType);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ Postgres discovery read failed:', message);
    }
  }

  // Return empty structure if no data
  return createEmptyDiscoveryVariablesFile(`project-${projectId}`, discoveryType);
}

/**
 * @deprecated REMOVED in Phase 2B. Use readDiscoveryVariablesByProject instead.
 * @throws Always throws — team-based lookups are no longer supported.
 */
export async function readDiscoveryVariables(_team: string, _discoveryType: string): Promise<DiscoveryVariablesStructure> {
  throw new Error(
    'readDiscoveryVariables(team, type) removed in Phase 2B. ' +
    'Use readDiscoveryVariablesByProject(projectId, type) instead.'
  );
}

/**
 * Write discovery variables by project ID.
 *
 * Architecture (Phase 2D):
 * - Postgres is authoritative for cascade variables (what brief modal reads)
 * - GitHub is a readable backup/debugging artifact
 * - Postgres write failure = hard fail (cascade would break invisibly)
 * - GitHub write failure = soft warning (Postgres is authoritative)
 */
export async function writeDiscoveryVariablesByProject(
  projectId: number,
  discoveryType: string,
  variablesData: DiscoveryVariablesStructure,
  projectPath?: string
): Promise<void> {
  const StudyVariable = getStudyVariableModel();

  // Hard-fail if database unavailable — discovery without cascade is broken
  if (!StudyVariable) {
    throw new Error(
      'Database unavailable — cannot persist discovery variables. ' +
      'Discovery requires database connection for cascade to work.'
    );
  }

  // Postgres write — let exceptions propagate (hard-fail)
  await writeDiscoveryToPostgresByProject(StudyVariable, projectId, variablesData);
  console.log(`✅ Discovery variables written to Postgres for project:${projectId}`);

  // GitHub .variables write REMOVED (PH-1 / ADR 0033).
  // Postgres study_variables is the sole runtime authority.
  // GitHub .variables files were debug/export projections never read at runtime.
  // The Contents API 422 on large files confirmed the write was obsolete.
}

/**
 * @deprecated REMOVED in Phase 2B. Use writeDiscoveryVariablesByProject instead.
 * @throws Always throws — team-based lookups are no longer supported.
 */
export async function writeDiscoveryVariables(_team: string, _discoveryType: string, _variablesData: DiscoveryVariablesStructure): Promise<void> {
  throw new Error(
    'writeDiscoveryVariables(team, type, data) removed in Phase 2B. ' +
    'Use writeDiscoveryVariablesByProject(projectId, type, data) instead.'
  );
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
 *
 * Phase 2D: Changed from team-based to projectId-based lookup.
 * Phase B-0: Fixed source resolution (spec.source → discovery type) and
 * artifact aggregation (all artifacts in source type, not just one).
 *
 * Aggregation semantics:
 * - Pool variables (arrays): concatenate values from all artifacts
 * - Non-pool variables (scalars): most recent artifact wins (by source.date)
 *
 * See docs/known-limitations.md for non-pool aggregation limitations.
 */
export async function readUpstreamDiscoveryVariables(
  projectId: number,
  discoveryType: string,
  _discoveryArtifactId: string,  // Preserved for API compat, no longer used for lookup
  consumesSpec: ConsumeSpec[],
): Promise<UpstreamVariables> {
  if (!consumesSpec || consumesSpec.length === 0) return {};

  const upstream: UpstreamVariables = {};

  for (const spec of consumesSpec) {
    // Resolve source template ID to discovery type
    // spec.source = 'desk_research' → sourceType = 'desk-research'
    let sourceType: string;
    if (spec.source) {
      const mappedType = TEMPLATE_TO_DISCOVERY_TYPE[spec.source];
      if (mappedType) {
        sourceType = mappedType;
      } else {
        console.warn(`⚠️ Unknown source template "${spec.source}" in consumes spec, using as-is`);
        sourceType = spec.source;
      }
    } else {
      // No source specified — use current discovery type (same-type reference)
      sourceType = discoveryType;
    }

    const discoveryVars = await readDiscoveryVariablesByProject(projectId, sourceType);
    const artifacts = discoveryVars.artifacts || {};

    // Aggregate across ALL artifacts in this discovery type
    const aggregatedArray: unknown[] = [];
    const contributingDates: string[] = [];
    const contributingArtifactIds: string[] = [];
    let mostRecentScalar: { value: unknown; source: VariableSource; artifactId: string } | null = null;

    for (const [artifactId, artifactVars] of Object.entries(artifacts)) {
      const variable = artifactVars[spec.key];
      if (!variable) continue;

      // Filter by source template to avoid cross-template contamination
      // e.g., when consuming knowledge_gaps from desk_research, don't include
      // knowledge_gaps emitted by stakeholder_synthesis
      if (spec.source && variable.source.template !== spec.source) {
        continue;
      }

      contributingArtifactIds.push(artifactId);
      if (variable.source.date) {
        contributingDates.push(variable.source.date);
      }

      if (Array.isArray(variable.value)) {
        // Pool variable — accumulate all values
        aggregatedArray.push(...variable.value);
      } else {
        // Non-pool variable — track most recent
        const varDate = variable.source.date || '';
        const currentDate = mostRecentScalar?.source.date || '';
        if (!mostRecentScalar || varDate > currentDate) {
          mostRecentScalar = { value: variable.value, source: variable.source, artifactId };
        }
      }
    }

    // Build result for this variable
    if (aggregatedArray.length > 0) {
      // Pool variable — return aggregated array with full provenance
      upstream[spec.key] = {
        value: aggregatedArray,
        source: {
          template: sourceType,
          version: `aggregated_from_${contributingArtifactIds.length}_artifacts`,
          date: contributingDates.length > 0 ? contributingDates.sort().reverse()[0] : undefined,
          dates: contributingDates.length > 0 ? contributingDates.sort() : undefined,
          artifact_ids: contributingArtifactIds,
        },
      };
    } else if (mostRecentScalar) {
      // Non-pool variable — return most recent value
      upstream[spec.key] = {
        value: mostRecentScalar.value,
        source: {
          ...mostRecentScalar.source,
          artifact_ids: [mostRecentScalar.artifactId],
        },
      };
    } else if (spec.required) {
      console.warn(
        `⚠️ Required upstream variable "${spec.key}" not found in discovery type "${sourceType}" for project ${projectId}`
      );
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
 * Now uses FK-based filtering when projectId/studyId are provided.
 */
export async function searchVariablesAcrossStudies(
  variableKeys: string[],
  searchTerms: string[],
  options: SearchOptions = {},
): Promise<SearchResult> {
  const { studyName, projectId, studyId, limit = 30, offset = 0 } = options;
  const StudyVariable = getStudyVariableModel();
  if (!StudyVariable) return { rows: [], total: 0 };

  // Build WHERE clause using FKs if provided
  const where: Record<string, unknown> = {
    variable_key: { [Op.in]: variableKeys },
    scope: 'study',
  };

  if (projectId !== undefined) {
    where.project_id = projectId;
  }
  if (studyId !== undefined) {
    where.study_id = studyId;
  }

  // Legacy: support studyName via join (deprecated path)
  // Note: This path is deprecated and will be removed in Phase 2D
  type IncludeOption = { association: string; where: Record<string, unknown>; required: boolean; attributes: string[] };
  let include: IncludeOption[] | undefined;
  if (studyName && !projectId && studyId === undefined) {
    include = [{
      association: 'study',
      where: { slug: studyName },
      required: true,
      attributes: [],
    }];
  }

  // Text matching: any search term matches against value::text
  if (searchTerms && searchTerms.length > 0) {
    where[Op.and as unknown as string] = [
      { [Op.or as unknown as string]: searchTerms.map(term => literal(
        `"value"::text ILIKE '%${term.replace(/'/g, "''") }%'`
      )) },
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findOptions: any = {
    where,
    order: [['source_date', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  };
  if (include) findOptions.include = include;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countOptions: any = { where };
  if (include) countOptions.include = include;

  const [rows, countResult] = await Promise.all([
    StudyVariable.findAll(findOptions),
    StudyVariable.count(countOptions),
  ]);

  // count() may return a grouped result when include is used; extract total
  const total = typeof countResult === 'number' ? countResult : (countResult as unknown as { count: number }[]).reduce((sum, g) => sum + g.count, 0);

  return { rows, total };
}

// ═══════════════════════════════════════════════════════════
// REVERSE-QUERY (Traceable Role-Transformation)
// ═══════════════════════════════════════════════════════════

/**
 * Linkage field definitions for reverse queries.
 * Maps variable keys to their linkage fields and the upstream variable type they reference.
 */
const LINKAGE_DEFINITIONS: Record<string, { field: string; referencesType: string }[]> = {
  task_scenarios: [
    { field: 'validates_barriers', referencesType: 'target_barriers' },
    { field: 'addresses_questions', referencesType: 'research_questions' },
  ],
  probes: [
    { field: 'addresses_question', referencesType: 'research_questions' },
  ],
  prioritized_findings: [
    { field: 'supporting_themes', referencesType: 'validated_themes' },
    { field: 'supporting_nuggets', referencesType: 'atomic_nugget_core' },
    { field: 'validates_barrier', referencesType: 'target_barriers' },
    { field: 'addresses_question', referencesType: 'research_questions' },
  ],
  prioritized_recommendations: [
    { field: 'addresses_findings', referencesType: 'prioritized_findings' },
    { field: 'addresses_barrier', referencesType: 'target_barriers' },
  ],
  validated_themes: [
    { field: 'supporting_nuggets', referencesType: 'atomic_nugget_core' },
    { field: 'linked_barriers', referencesType: 'target_barriers' },
    { field: 'linked_questions', referencesType: 'research_questions' },
  ],
  deliverables: [
    { field: 'addresses_objective', referencesType: 'research_objectives' },
  ],
  journey_stages: [
    { field: 'supporting_nuggets', referencesType: 'atomic_nugget_core' },
    { field: 'linked_barriers', referencesType: 'target_barriers' },
  ],
};

export interface ReverseQueryResult {
  sourceVariable: string;
  sourceId: string;
  items: Array<{
    id: string;
    linkageField: string;
    variableKey: string;
    fullItem: unknown;
  }>;
}

/**
 * Find all downstream variables that reference a specific upstream ID.
 * Example: queryUpstreamReferences(ctx, 'TB-001', 'target_barriers') returns
 * all task_scenarios, themes, and findings that validate/link to TB-001.
 *
 * This enables bidirectional traceability queries:
 * - Forward: "What barrier does task-01 validate?" → task_scenarios[0].validates_barriers
 * - Reverse: "Which tasks validate TB-001?" → queryUpstreamReferences(ctx, 'TB-001', 'target_barriers')
 */
export async function queryUpstreamReferences(
  ctx: VariableContext,
  upstreamId: string,
  upstreamType: string,
): Promise<ReverseQueryResult> {
  const result: ReverseQueryResult = {
    sourceVariable: upstreamType,
    sourceId: upstreamId,
    items: [],
  };

  // Get all variables for this study
  const studyVars = await readStudyVariablesByContext(ctx);
  if (!studyVars?.variables) return result;

  // Find all variable types that can reference this upstream type
  for (const [variableKey, linkageFields] of Object.entries(LINKAGE_DEFINITIONS)) {
    const relevantFields = linkageFields.filter(l => l.referencesType === upstreamType);
    if (relevantFields.length === 0) continue;

    const storedVar = studyVars.variables[variableKey];
    if (!storedVar?.value) continue;

    const items = Array.isArray(storedVar.value) ? storedVar.value : [storedVar.value];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const itemObj = item as Record<string, unknown>;
      const itemId = (itemObj.id as string) || 'unknown';

      for (const { field } of relevantFields) {
        const fieldValue = itemObj[field];

        // Check if this item references the upstream ID
        let matches = false;
        if (Array.isArray(fieldValue)) {
          matches = fieldValue.includes(upstreamId);
        } else if (typeof fieldValue === 'string') {
          matches = fieldValue === upstreamId;
        }

        if (matches) {
          result.items.push({
            id: itemId,
            linkageField: field,
            variableKey,
            fullItem: item,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Validate that all required linkages are populated for a study.
 * Returns a report of missing linkages that should have been populated.
 */
export interface LinkageValidationReport {
  valid: boolean;
  gaps: Array<{
    variableKey: string;
    itemId: string;
    missingField: string;
    upstreamType: string;
  }>;
  summary: string;
}

export async function validateStudyLinkages(
  ctx: VariableContext,
): Promise<LinkageValidationReport> {
  const gaps: LinkageValidationReport['gaps'] = [];

  const studyVars = await readStudyVariablesByContext(ctx);
  if (!studyVars?.variables) {
    return { valid: true, gaps: [], summary: 'No variables found' };
  }

  // Check each variable type with required linkage fields
  for (const [variableKey, linkageFields] of Object.entries(LINKAGE_DEFINITIONS)) {
    const storedVar = studyVars.variables[variableKey];
    if (!storedVar?.value) continue;

    const items = Array.isArray(storedVar.value) ? storedVar.value : [storedVar.value];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const itemObj = item as Record<string, unknown>;
      const itemId = (itemObj.id as string) || 'unknown';

      for (const { field, referencesType } of linkageFields) {
        const fieldValue = itemObj[field];

        // Check for empty required linkage (arrays only)
        const isEmpty = Array.isArray(fieldValue) && fieldValue.length === 0;
        const isMissing = fieldValue === undefined || fieldValue === null;
        const isEmptyString = typeof fieldValue === 'string' && fieldValue.trim() === '';

        if (isEmpty || isMissing || isEmptyString) {
          gaps.push({
            variableKey,
            itemId,
            missingField: field,
            upstreamType: referencesType,
          });
        }
      }
    }
  }

  const valid = gaps.length === 0;
  const summary = valid
    ? 'All linkages populated'
    : `${gaps.length} linkage gap(s) found across ${new Set(gaps.map(g => g.variableKey)).size} variable type(s)`;

  return { valid, gaps, summary };
}

// ═══════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════

function extractStudySlug(studyBasePath: string): string {
  if (!studyBasePath) return 'unknown';
  return decodeURIComponent(studyBasePath).split('/').pop() || 'unknown';
}

// NOTE: resolveProjectFromTeam and resolveContextFromSlug were removed in Phase 2B.
// All callers must use FK-based APIs with explicit projectId/studyId.

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

/**
 * Write variables to Postgres using FK-based context.
 */
async function writeVariablesToPostgresByContext(
  StudyVariable: StudyVariableModel,
  ctx: VariableContext,
  variablesData: StudyVariablesStructure,
): Promise<void> {
  const sequelize = getSequelizeInstance();
  const now = new Date().toISOString();

  await sequelize.transaction(async (t) => {
    for (const [key, variable] of Object.entries(variablesData.variables || {})) {
      // Clear existing for this key using FK-based lookup
      await StudyVariable.destroy({
        where: {
          project_id: ctx.projectId,
          study_id: ctx.studyId ?? null,
          variable_key: key,
          scope: 'study',
        },
        transaction: t,
      });

      if (variable.pool && Array.isArray(variable.value)) {
        for (const item of variable.value) {
          const itemObj = item as Record<string, unknown>;
          await StudyVariable.create({
            project_id: ctx.projectId,
            study_id: ctx.studyId ?? null,
            variable_key: key,
            variable_type: 'pool',
            item_key: (itemObj.id as string) || null,
            value: item,
            participant_id: (itemObj.participant || itemObj.participant_id || null) as string | null,
            source_template: variable.source?.template || 'unknown',
            source_version: variable.source?.version || null,
            source_date: variable.source?.date || now,
            is_pool: true,
            scope: 'study',
            stale: false,
            extracted_at: now,
            updated_at: now,
          } as Record<string, unknown>, { transaction: t });
        }
      } else {
        await StudyVariable.create({
          project_id: ctx.projectId,
          study_id: ctx.studyId ?? null,
          variable_key: key,
          variable_type: 'singleton',
          item_key: null,
          value: variable.value,
          participant_id: null,
          source_template: variable.source?.template || 'unknown',
          source_version: variable.source?.version || null,
          source_date: variable.source?.date || now,
          is_pool: false,
          scope: 'study',
          stale: false,
          extracted_at: now,
          updated_at: now,
        } as Record<string, unknown>, { transaction: t });
      }
    }
  });
}

// NOTE: writeVariablesToPostgres(slug) removed in Phase 2B.
// Use writeVariablesToPostgresByContext(ctx) instead.

/**
 * Write discovery variables to Postgres using project_id.
 *
 * Bug fix (ADR 0019 era): Scopes delete by source_template to avoid
 * nuking other discovery types when writing one type.
 */
async function writeDiscoveryToPostgresByProject(
  StudyVariable: StudyVariableModel,
  projectId: number,
  variablesData: DiscoveryVariablesStructure,
): Promise<void> {
  const sequelize = getSequelizeInstance();
  const now = new Date().toISOString();

  // Extract the discovery type being written — scope delete to just this type
  const sourceTemplate = variablesData.discovery_type;
  if (!sourceTemplate) {
    throw new Error('writeDiscoveryToPostgresByProject requires variablesData.discovery_type');
  }

  await sequelize.transaction(async (t) => {
    // Clear existing discovery variables for this project AND this source_template only.
    // Bug fix: previously deleted ALL discovery types, nuking desk_research when writing stakeholder_synthesis.
    await StudyVariable.destroy({
      where: {
        project_id: projectId,
        study_id: null,
        scope: 'discovery',
        source_template: sourceTemplate,
      },
      transaction: t,
    });

    for (const [artifactId, artifactVars] of Object.entries(variablesData.artifacts || {})) {
      for (const [key, variable] of Object.entries(artifactVars)) {
        const values = Array.isArray(variable.value) ? variable.value : [variable.value];
        const isPool = Array.isArray(variable.value);

        for (const item of values) {
          await StudyVariable.create({
            project_id: projectId,
            study_id: null,
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

// NOTE: writeDiscoveryToPostgres(discoveryStudyId) removed in Phase 2B.
// Use writeDiscoveryToPostgresByProject(projectId) instead.

// ═══════════════════════════════════════════════════════════
// GITHUB FALLBACK — REMOVED (PH-1 / ADR 0033)
// ═══════════════════════════════════════════════════════════
// readStudyVariablesFromGitHub removed — was dead code (never called).
// readDiscoveryVariablesFromGitHub removed in Phase 2D.
// Postgres study_variables is the sole runtime authority for all variable reads.

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

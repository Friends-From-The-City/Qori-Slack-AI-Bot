/**
 * Evidence Projection Service
 *
 * Per ADR 0029: The projection seam — transforms accepted canonical
 * constructs into cascade-compatible shapes without requiring LLM
 * re-extraction.
 *
 * FAIL-CLOSED (ADR 0029 correction): An accepted construct that cannot
 * satisfy its projection contract throws EvidenceProjectionError rather
 * than producing malformed cascade variables with invented defaults.
 *
 * Flow:
 *   accepted EvidenceConstruct
 *   → validate canonical construct requirements
 *   → projection transform
 *   → validate destination cascade shape
 *   → CascadeProjection
 *
 * This is a service boundary, not a framework. Each vertical slice
 * defines its own projection logic as a plain function.
 *
 * Long-term relationship:
 *   accepted evidence/construct
 *   ├→ authoritative evidence store (evidence_constructs table)
 *   ├→ study_variables projection (this service)
 *   └→ template rendering context
 */

import type { ConstructType } from '../database/models/evidence_construct';
import type { EvidenceConstruct } from '../database/models/evidence_construct';
import { EvidenceProjectionError } from '../types/handlers';

// ═══════════════════════════════════════════════════════════════════════
// PROJECTION TYPES
// ═══════════════════════════════════════════════════════════════════════

/**
 * A cascade-compatible variable ready to be written to study_variables.
 * Mirrors the shape that studyVariables.ts expects.
 */
export interface CascadeProjection {
  variable_key: string;
  value: Record<string, unknown>;
  source_template: string;
  source_version?: string;
  is_pool: boolean;
  item_key?: string;
  participant_id?: string;
}

/**
 * A projection function transforms an accepted EvidenceConstruct
 * into one or more CascadeProjection values.
 *
 * MUST throw EvidenceProjectionError if the construct's payload
 * is missing required fields for the destination cascade shape.
 * MUST NOT invent defaults for missing required data.
 */
export type ProjectionFn = (construct: EvidenceConstruct) => CascadeProjection[];

/**
 * Schema definition for projection validation.
 * Lists which payload fields are required for this projection.
 */
export interface ProjectionSchema {
  requiredPayloadFields: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// PROJECTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════

const projectionRegistry = new Map<ConstructType, ProjectionFn>();
const projectionSchemas = new Map<ConstructType, ProjectionSchema>();

export function registerProjection(
  constructType: ConstructType,
  fn: ProjectionFn,
  schema: ProjectionSchema,
): void {
  projectionRegistry.set(constructType, fn);
  projectionSchemas.set(constructType, schema);
}

export function hasProjection(constructType: ConstructType): boolean {
  return projectionRegistry.has(constructType);
}

// ═══════════════════════════════════════════════════════════════════════
// CORE PROJECTION (fail-closed)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Project an accepted construct into cascade-compatible shape(s).
 *
 * Returns null if:
 *   - construct is not in accepted status
 *   - no projection is registered for the construct type
 *
 * Throws EvidenceProjectionError if:
 *   - accepted construct is missing required payload fields
 *   - projection produces an invalid cascade shape
 *
 * Deterministic: same construct always produces identical projection.
 */
export function projectConstruct(construct: EvidenceConstruct): CascadeProjection[] | null {
  if (construct.status !== 'accepted') return null;

  const fn = projectionRegistry.get(construct.construct_type);
  if (!fn) return null;

  // Step 1: Validate canonical construct requirements
  const schema = projectionSchemas.get(construct.construct_type);
  if (schema) {
    validateConstructPayload(construct, schema);
  }

  // Step 2: Execute projection transform
  const projections = fn(construct);

  // Step 3: Validate destination cascade shape
  for (const projection of projections) {
    validateCascadeProjection(projection, construct.construct_type);
  }

  return projections;
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDATION (fail-closed)
// ═══════════════════════════════════════════════════════════════════════

function validateConstructPayload(
  construct: EvidenceConstruct,
  schema: ProjectionSchema,
): void {
  const payload = construct.payload;
  if (!payload && schema.requiredPayloadFields.length > 0) {
    throw new EvidenceProjectionError(
      `Accepted ${construct.construct_type} (id=${construct.id}) has null payload but projection requires fields: ${schema.requiredPayloadFields.join(', ')}`,
      construct.construct_type,
      schema.requiredPayloadFields,
    );
  }

  const missingFields: string[] = [];
  for (const field of schema.requiredPayloadFields) {
    if (payload![field] === undefined || payload![field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    throw new EvidenceProjectionError(
      `Accepted ${construct.construct_type} (id=${construct.id}) is missing required payload fields for projection: ${missingFields.join(', ')}`,
      construct.construct_type,
      missingFields,
    );
  }
}

function validateCascadeProjection(
  projection: CascadeProjection,
  constructType: string,
): void {
  if (!projection.variable_key) {
    throw new EvidenceProjectionError(
      `Projection for ${constructType} produced empty variable_key`,
      constructType,
    );
  }
  if (projection.is_pool && !projection.item_key) {
    throw new EvidenceProjectionError(
      `Pool projection for ${constructType} → ${projection.variable_key} is missing item_key`,
      constructType,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BUILT-IN PROJECTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Knowledge gap → knowledge_gaps cascade shape.
 *
 * Demonstrates the pattern: a canonical evidence construct is validated,
 * transformed into the shape downstream YAML templates expect via their
 * `consumes:` declarations, and validated again. No LLM call. No defaults.
 */
registerProjection(
  'knowledge_gap',
  (construct) => {
    const payload = construct.payload!;
    return [
      {
        variable_key: 'knowledge_gaps',
        value: {
          id: String(payload.id),
          title: String(payload.title),
          summary: String(payload.summary),
          domain: payload.domain ?? null,
          evidence: payload.evidence ?? [],
          source_document: String(payload.source_document),
          confidence: payload.confidence ?? null,
        },
        source_template: 'evidence_projection',
        source_version: '1.0',
        is_pool: true,
        item_key: String(payload.id),
      },
    ];
  },
  {
    requiredPayloadFields: ['id', 'title', 'summary', 'source_document'],
  },
);

/**
 * Barrier → discovered_barriers cascade shape.
 */
registerProjection(
  'barrier',
  (construct) => {
    const payload = construct.payload!;
    return [
      {
        variable_key: 'discovered_barriers',
        value: {
          id: String(payload.id),
          title: String(payload.title),
          summary: String(payload.summary),
          magnitude: payload.magnitude ?? null,
          evidence: payload.evidence ?? [],
          affected_population: payload.affected_population ?? null,
          source_document: String(payload.source_document),
          confidence: payload.confidence ?? null,
        },
        source_template: 'evidence_projection',
        source_version: '1.0',
        is_pool: true,
        item_key: String(payload.id),
      },
    ];
  },
  {
    requiredPayloadFields: ['id', 'title', 'summary', 'source_document'],
  },
);
